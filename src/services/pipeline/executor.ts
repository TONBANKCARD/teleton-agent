import type { AgentRuntime } from "../../agent/runtime.js";
import type { ManagedAgentService } from "../../agents/service.js";
import type { ManagedAgentSnapshot } from "../../agents/types.js";
import { getErrorMessage } from "../../utils/errors.js";
import { createLogger } from "../../utils/logger.js";
import {
  type PipelineContext,
  type PipelineDefinition,
  type PipelineErrorStrategy,
  type PipelineRun,
  type PipelineRunDetail,
  type PipelineStep,
  type PipelineStore,
} from "./definition.js";
import { resolvePipelineSteps } from "./resolver.js";

const log = createLogger("PipelineExecutor");

export interface PipelineExecutorDeps {
  store: PipelineStore;
  agent: AgentRuntime;
  agentManager?: ManagedAgentService;
}

export interface ExecutePipelineOptions {
  inputContext?: PipelineContext;
  errorStrategy?: PipelineErrorStrategy;
}

interface StepExecutionResult {
  step: PipelineStep;
  outputName: string;
  outputValue: unknown;
  failed: boolean;
  error: string | null;
  strategy: PipelineErrorStrategy;
}

interface TimeoutBudget {
  timeoutMs: number;
  errorMessage: string;
}

type RunInterruption = "cancelled" | { status: "timeout"; message: string } | null;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function stringifyContextValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function interpolateAction(action: string, context: PipelineContext): string {
  return action.replace(/\{([A-Za-z_][A-Za-z0-9_.-]*)\}/g, (_, name: string) =>
    stringifyContextValue(context[name])
  );
}

function findManagedAgent(
  agentManager: ManagedAgentService,
  requestedAgent: string
): ManagedAgentSnapshot | null {
  const lookup = requestedAgent.trim().toLowerCase();
  return (
    agentManager
      .listAgentSnapshots()
      .find(
        (agent) =>
          agent.id.toLowerCase() === lookup ||
          agent.name.toLowerCase() === lookup ||
          agent.type.toLowerCase() === lookup
      ) ?? null
  );
}

export class PipelineExecutor {
  constructor(private deps: PipelineExecutorDeps) {}

  start(pipeline: PipelineDefinition, options: ExecutePipelineOptions = {}): PipelineRun {
    const run = this.deps.store.createRun(pipeline, {
      inputContext: options.inputContext,
      errorStrategy: options.errorStrategy,
    });
    void this.executeRun(pipeline, run.id).catch((error) => {
      log.error({ err: error, pipelineId: pipeline.id, runId: run.id }, "Pipeline run failed");
      this.deps.store.updateRun(run.id, {
        status: "failed",
        error: getErrorMessage(error),
        completedAt: nowSeconds(),
      });
    });
    return run;
  }

  async execute(
    pipeline: PipelineDefinition,
    options: ExecutePipelineOptions = {}
  ): Promise<PipelineRunDetail> {
    const run = this.deps.store.createRun(pipeline, {
      inputContext: options.inputContext,
      errorStrategy: options.errorStrategy,
    });
    await this.executeRun(pipeline, run.id);
    const detail = this.deps.store.getRunDetail(pipeline.id, run.id);
    if (!detail) {
      throw new Error(`Pipeline run ${run.id} not found after execution`);
    }
    return detail;
  }

  async executeRun(pipeline: PipelineDefinition, runId: string): Promise<void> {
    const resolution = resolvePipelineSteps(pipeline.steps);
    const initialRun = this.deps.store.getRun(runId);
    if (!initialRun) throw new Error(`Pipeline run not found: ${runId}`);
    if (initialRun.status === "cancelled") return;

    const startedAt = nowSeconds();
    this.deps.store.updateRun(runId, { status: "running", startedAt });
    let context: PipelineContext = { ...initialRun.context };
    const deadline =
      pipeline.timeoutSeconds && pipeline.timeoutSeconds > 0
        ? Date.now() + pipeline.timeoutSeconds * 1000
        : null;

    for (const level of resolution.levels) {
      const interruption = this.getRunInterruption(runId, pipeline, deadline);
      if (interruption === "cancelled") return;
      if (interruption?.status === "timeout") {
        this.failRunForTimeout(runId, interruption.message);
        return;
      }

      const levelPromise = Promise.all(
        level.map((step) => this.executeStep(runId, pipeline, step, context, deadline))
      );
      const results = await this.withOptionalTimeout(
        levelPromise,
        this.pipelineRemainingTimeout(deadline),
        this.pipelineTimeoutMessage(pipeline)
      ).catch((error) => {
        const interruption = this.getRunInterruption(runId, pipeline, deadline);
        if (interruption === "cancelled") return null;
        if (interruption?.status === "timeout") {
          this.failRunForTimeout(runId, interruption.message);
          return null;
        }
        throw error;
      });
      if (!results) return;

      const afterLevelInterruption = this.getRunInterruption(runId, pipeline, deadline);
      if (afterLevelInterruption === "cancelled") return;
      if (afterLevelInterruption?.status === "timeout") {
        this.failRunForTimeout(runId, afterLevelInterruption.message);
        return;
      }

      for (const result of results) {
        if (!result.failed) {
          context = {
            ...context,
            [result.outputName]: result.outputValue,
          };
        }
      }
      this.deps.store.updateRun(runId, { context });

      const blockingFailure = results.find(
        (result) => result.failed && result.strategy !== "continue"
      );
      if (blockingFailure) {
        this.deps.store.markPendingStepsSkipped(runId, "Skipped after pipeline failure");
        this.deps.store.updateRun(runId, {
          status: "failed",
          error: blockingFailure.error,
          completedAt: nowSeconds(),
        });
        return;
      }
    }

    const finalInterruption = this.getRunInterruption(runId, pipeline, deadline);
    if (finalInterruption === "cancelled") return;
    if (finalInterruption?.status === "timeout") {
      this.failRunForTimeout(runId, finalInterruption.message);
      return;
    }

    this.deps.store.updateRun(runId, {
      status: "completed",
      context,
      error: null,
      completedAt: nowSeconds(),
    });
  }

  private async executeStep(
    runId: string,
    pipeline: PipelineDefinition,
    step: PipelineStep,
    context: PipelineContext,
    deadline: number | null
  ): Promise<StepExecutionResult> {
    const strategy = step.errorStrategy ?? pipeline.errorStrategy;
    const retries =
      strategy === "retry" ? Math.max(0, step.retryCount ?? pipeline.maxRetries ?? 0) : 0;
    const maxAttempts = retries + 1;
    let lastError: string | null = null;
    let attemptsUsed = 0;
    const startedAt = nowSeconds();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const beforeAttemptInterruption = this.getRunInterruption(runId, pipeline, deadline);
      if (beforeAttemptInterruption === "cancelled") {
        return {
          step,
          outputName: step.output,
          outputValue: null,
          failed: true,
          error: "Pipeline run cancelled",
          strategy,
        };
      }
      if (beforeAttemptInterruption?.status === "timeout") {
        lastError = beforeAttemptInterruption.message;
        this.deps.store.updateStep(runId, step.id, {
          status: "failed",
          error: lastError,
          attempts: Math.max(0, attempt - 1),
          completedAt: nowSeconds(),
        });
        return {
          step,
          outputName: step.output,
          outputValue: null,
          failed: true,
          error: lastError,
          strategy,
        };
      }

      this.deps.store.updateStep(runId, step.id, {
        status: "running",
        inputContext: context,
        attempts: attempt,
        startedAt,
        error: lastError,
      });
      attemptsUsed = attempt;

      try {
        const action = interpolateAction(step.action, context);
        const timeout = this.getStepTimeoutBudget(pipeline, step, deadline);
        const outputValue = await this.withOptionalTimeout(
          this.dispatchStep(runId, step, action, context),
          timeout?.timeoutMs,
          timeout?.errorMessage
        );
        const afterDispatchInterruption = this.getRunInterruption(runId, pipeline, deadline);
        if (afterDispatchInterruption === "cancelled") {
          return {
            step,
            outputName: step.output,
            outputValue: null,
            failed: true,
            error: "Pipeline run cancelled",
            strategy,
          };
        }
        if (afterDispatchInterruption?.status === "timeout") {
          lastError = afterDispatchInterruption.message;
          break;
        }
        this.deps.store.updateStep(runId, step.id, {
          status: "completed",
          outputValue,
          error: null,
          attempts: attempt,
          completedAt: nowSeconds(),
        });
        return {
          step,
          outputName: step.output,
          outputValue,
          failed: false,
          error: null,
          strategy,
        };
      } catch (error) {
        const interruption = this.getRunInterruption(runId, pipeline, deadline);
        if (interruption === "cancelled") {
          return {
            step,
            outputName: step.output,
            outputValue: null,
            failed: true,
            error: "Pipeline run cancelled",
            strategy,
          };
        }
        lastError =
          interruption?.status === "timeout" ? interruption.message : getErrorMessage(error);
        if (interruption?.status === "timeout") break;
        if (attempt < maxAttempts) {
          log.warn({ pipelineId: pipeline.id, runId, stepId: step.id, error }, "Retrying step");
          continue;
        }
      }
    }

    this.deps.store.updateStep(runId, step.id, {
      status: "failed",
      error: lastError,
      attempts: attemptsUsed,
      completedAt: nowSeconds(),
    });
    return {
      step,
      outputName: step.output,
      outputValue: null,
      failed: true,
      error: lastError,
      strategy,
    };
  }

  private async dispatchStep(
    runId: string,
    step: PipelineStep,
    action: string,
    context: PipelineContext
  ): Promise<unknown> {
    const requestedAgent = step.agent.trim();
    if (!requestedAgent || requestedAgent.toLowerCase() === "primary") {
      const response = await this.deps.agent.processMessage({
        chatId: `pipeline:${runId}`,
        userName: "Pipeline",
        userMessage: action,
        timestamp: Date.now(),
        isGroup: false,
        pendingContext: JSON.stringify(context),
      });
      return response.content;
    }

    if (!this.deps.agentManager) {
      throw new Error(`Managed agent service unavailable for "${requestedAgent}"`);
    }
    const agent = findManagedAgent(this.deps.agentManager, requestedAgent);
    if (!agent) {
      throw new Error(`Managed agent not found: ${requestedAgent}`);
    }
    const message = await this.deps.agentManager.sendMessage(
      "primary",
      agent.id,
      [`[PIPELINE STEP - ${step.id}]`, action].join("\n")
    );
    return {
      messageId: message.id,
      toAgentId: agent.id,
      toAgentName: agent.name,
      createdAt: message.createdAt,
      action,
    };
  }

  private getRunInterruption(
    runId: string,
    pipeline: PipelineDefinition,
    deadline: number | null
  ): RunInterruption {
    const currentRun = this.deps.store.getRun(runId);
    if (!currentRun || currentRun.status === "cancelled") return "cancelled";
    if (deadline && Date.now() >= deadline) {
      return { status: "timeout", message: this.pipelineTimeoutMessage(pipeline) };
    }
    return null;
  }

  private failRunForTimeout(runId: string, message: string): void {
    const currentRun = this.deps.store.getRun(runId);
    if (!currentRun || currentRun.status === "cancelled") return;
    this.deps.store.markTimedOutSteps(runId, message);
    this.deps.store.updateRun(runId, {
      status: "failed",
      error: message,
      completedAt: nowSeconds(),
    });
  }

  private getStepTimeoutBudget(
    pipeline: PipelineDefinition,
    step: PipelineStep,
    deadline: number | null
  ): TimeoutBudget | undefined {
    const stepTimeout =
      step.timeoutSeconds && step.timeoutSeconds > 0
        ? {
            timeoutMs: step.timeoutSeconds * 1000,
            errorMessage: `Pipeline step "${step.id}" timed out after ${step.timeoutSeconds} seconds`,
          }
        : undefined;
    const remainingTimeout = this.pipelineRemainingTimeout(deadline);
    if (remainingTimeout === undefined) return stepTimeout;
    const pipelineTimeout = {
      timeoutMs: remainingTimeout,
      errorMessage: this.pipelineTimeoutMessage(pipeline),
    };
    if (!stepTimeout || pipelineTimeout.timeoutMs <= stepTimeout.timeoutMs) {
      return pipelineTimeout;
    }
    return stepTimeout;
  }

  private pipelineRemainingTimeout(deadline: number | null): number | undefined {
    if (!deadline) return undefined;
    return Math.max(0, deadline - Date.now());
  }

  private pipelineTimeoutMessage(pipeline: PipelineDefinition): string {
    return `Pipeline timed out after ${pipeline.timeoutSeconds} seconds`;
  }

  private withOptionalTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number | undefined,
    errorMessage = "Operation timed out"
  ): Promise<T> {
    if (timeoutMs === undefined) return promise;
    if (timeoutMs <= 0) return Promise.reject(new Error(errorMessage));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
      timer.unref?.();
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }
}
