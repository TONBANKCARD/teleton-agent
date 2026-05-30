/**
 * LLM provider first-token latency benchmark.
 *
 * Opt-in and network-bound: skipped entirely unless `RUN_LLM_BENCH=1`. For every
 * provider whose API key is present in the environment, it streams a tiny prompt
 * via pi-ai's `stream()` and measures **time to first text token** — the metric
 * that dominates perceived agent responsiveness. The stream is aborted right
 * after the first token, so no full completion is billed.
 *
 * Never part of the regression baseline (numbers depend on provider load and the
 * runner's network), only reported.
 */
import { stream, getModel } from "@mariozechner/pi-ai";
import type { BenchGroup, BenchModule } from "./lib/harness.js";
import { makeBench } from "./lib/harness.js";

interface ProviderSpec {
  provider: string;
  modelId: string;
  envKey: string;
}

// Conservative, widely-available fast models. Unknown ones are skipped gracefully.
const PROVIDERS: ProviderSpec[] = [
  { provider: "groq", modelId: "llama-3.3-70b-versatile", envKey: "GROQ_API_KEY" },
  { provider: "openrouter", modelId: "openai/gpt-4o-mini", envKey: "OPENROUTER_API_KEY" },
  { provider: "anthropic", modelId: "claude-3-5-haiku-20241022", envKey: "ANTHROPIC_API_KEY" },
];

async function timeFirstToken(spec: ProviderSpec, apiKey: string): Promise<void> {
  // getModel is strongly typed over a known registry; we resolve dynamically here.
  const model = (getModel as (p: string, m: string) => unknown)(spec.provider, spec.modelId);
  const controller = new AbortController();
  const events = stream(model as never, {
    messages: [{ role: "user", content: "Reply with the single word: ok" }],
  } as never, {
    apiKey,
    maxTokens: 8,
    signal: controller.signal,
  } as never);

  for await (const event of events) {
    if (event.type === "text_delta" || event.type === "text_start") {
      controller.abort(); // stop as soon as the first token arrives
      return;
    }
    if (event.type === "done" || event.type === "error") return;
  }
}

const moduleFactory: BenchModule = async (): Promise<BenchGroup[]> => {
  if (process.env.RUN_LLM_BENCH !== "1") return [];

  const groups: BenchGroup[] = [];
  for (const spec of PROVIDERS) {
    const apiKey = process.env[spec.envKey];
    if (!apiKey) continue; // no key → skip this provider

    const bench = makeBench({ time: 6_000, iterations: 3, warmupTime: 0 });
    bench.add(`${spec.provider} first-token (${spec.modelId})`, async () => {
      await timeFirstToken(spec, apiKey);
    });
    groups.push({ suite: "llm-providers", group: "first-token (network)", bench });
  }

  return groups;
};

export default moduleFactory;
