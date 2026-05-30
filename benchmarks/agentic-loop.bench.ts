/**
 * Agentic-loop throughput benchmark.
 *
 * Measures the per-iteration CPU overhead the agent pays around every LLM turn,
 * with all external calls (LLM, network, Telegram) mocked. We exercise the real,
 * pure hot-path helpers:
 *   - {@link ../src/agent/schema-sanitizer.ts} — converts TypeBox tool schemas
 *     into the Gemini-compatible subset before each provider request.
 *   - {@link ../src/agent/tool-result-truncator.ts} — trims oversized tool
 *     results into a valid JSON summary after each tool call.
 *   - a mocked parse → tool-select → dispatch cycle over a tool registry.
 *
 * No API keys or network — runs anywhere.
 */
import { Type } from "@sinclair/typebox";
import { sanitizeToolsForGemini } from "../src/agent/schema-sanitizer.js";
import { truncateToolResult } from "../src/agent/tool-result-truncator.js";
import type { BenchGroup, BenchModule } from "./lib/harness.js";
import { makeBench } from "./lib/harness.js";

/** A small but representative tool set, shaped like the real Telegram/TON tools. */
function buildToolSet(): Array<{ name: string; description: string; parameters: unknown }> {
  const names = [
    "send_message",
    "search_memory",
    "dedust_quote",
    "stonfi_swap",
    "schedule_task",
    "read_chat",
    "transfer_ton",
    "create_reminder",
  ];
  return names.map((name) => ({
    name,
    description: `Tool ${name} for the agentic loop benchmark`,
    parameters: Type.Object({
      target: Type.String({ description: "primary target" }),
      amount: Type.Optional(Type.Number({ minimum: 0 })),
      mode: Type.Optional(
        Type.Union([Type.Literal("fast"), Type.Literal("safe")], { description: "execution mode" })
      ),
      tags: Type.Optional(Type.Array(Type.String())),
    }),
  }));
}

/** A large mocked tool result, like a DEX pool list or chat history page. */
function buildLargeResult(): { success: boolean; data: Record<string, unknown> } {
  return {
    success: true,
    data: {
      items: Array.from({ length: 200 }, (_, i) => ({
        id: `item-${i}`,
        label: `Pool ${i}`,
        reserve: i * 1000,
        note: "x".repeat(40),
      })),
      cursor: "next-page-token",
    },
  };
}

/** Mocked NL-task → tool-name dispatch over a registry (no LLM, deterministic). */
function buildDispatch() {
  const tools = buildToolSet();
  const registry = new Map(tools.map((t) => [t.name, t]));
  const tasks = [
    "send a message to the group",
    "search my memory for the swap",
    "get a dedust quote for ton",
    "schedule a task for tomorrow",
  ];
  const keywords: Array<[RegExp, string]> = [
    [/message/, "send_message"],
    [/memory|search/, "search_memory"],
    [/quote|dedust/, "dedust_quote"],
    [/swap/, "stonfi_swap"],
    [/schedule|task|tomorrow/, "schedule_task"],
  ];
  return () => {
    for (const task of tasks) {
      const match = keywords.find(([re]) => re.test(task));
      const tool = match ? registry.get(match[1]) : undefined;
      if (tool) {
        // Mock arg-binding + result handling.
        const result = { success: true, data: { ok: true, tool: tool.name, task } };
        truncateToolResult(result, 8_000);
      }
    }
  };
}

const moduleFactory: BenchModule = async (): Promise<BenchGroup[]> => {
  const tools = buildToolSet();
  const largeResult = buildLargeResult();
  const dispatch = buildDispatch();

  const groups: BenchGroup[] = [];

  const sanitizeBench = makeBench();
  sanitizeBench.add("sanitize tool schemas (8 tools)", () => {
    sanitizeToolsForGemini(tools as never);
  });
  groups.push({ suite: "agentic-loop", group: "schema-prep", bench: sanitizeBench });

  const truncateBench = makeBench();
  truncateBench.add("truncate large tool result (~10KB)", () => {
    truncateToolResult(largeResult, 4_000);
  });
  groups.push({ suite: "agentic-loop", group: "result-handling", bench: truncateBench });

  const dispatchBench = makeBench();
  dispatchBench.add("parse + dispatch 4 tasks (mocked)", () => {
    dispatch();
  });
  groups.push({ suite: "agentic-loop", group: "dispatch", bench: dispatchBench });

  return groups;
};

export default moduleFactory;
