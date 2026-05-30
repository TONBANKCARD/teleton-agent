/**
 * Benchmark runner.
 *
 * Loads every `*.bench.ts` module, executes its groups, prints a report and
 * writes a machine-readable `results.json` consumed by `check-regression.ts`.
 *
 * Usage:
 *   tsx benchmarks/run.ts [--json <path>] [--md <path>] [--quiet]
 *
 * Environment flags:
 *   RUN_NETWORK_BENCH=1   include the real DeDust quote round-trip
 *   RUN_LLM_BENCH=1       include LLM provider first-token latency (needs API keys)
 */
import { writeFileSync } from "node:fs";
import { cpus, arch, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import memorySearch from "./memory-search.bench.js";
import agenticLoop from "./agentic-loop.bench.js";
import dexRouting from "./dex-routing.bench.js";
import llmProviders from "./llm-providers.bench.js";
import type { BenchModule, BenchReport, BenchResult } from "./lib/harness.js";
import { runGroups, aggregateRuns, formatTable, formatMarkdown } from "./lib/harness.js";

const MODULES: BenchModule[] = [memorySearch, agenticLoop, dexRouting, llmProviders];

function parseArgs(argv: string[]): { json: string; md?: string; quiet: boolean; runs: number } {
  const here = dirname(fileURLToPath(import.meta.url));
  let json = resolve(here, "results.json");
  let md: string | undefined;
  let quiet = false;
  let runs = 1;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") json = resolve(argv[++i]);
    else if (argv[i] === "--md") md = resolve(argv[++i]);
    else if (argv[i] === "--quiet") quiet = true;
    else if (argv[i] === "--runs") runs = Math.max(1, Number(argv[++i]) || 1);
  }
  return { json, md, quiet, runs };
}

async function main(): Promise<void> {
  const { json, md, quiet, runs } = parseArgs(process.argv.slice(2));

  if (!quiet) console.log(`Running Teleton Agent benchmarks (${runs} run${runs > 1 ? "s" : ""})…\n`);

  // Re-prepare fixtures and re-run on each pass so min-of-N denoises fairly.
  const perRun: BenchResult[][] = [];
  for (let i = 0; i < runs; i++) {
    const groups = (await Promise.all(MODULES.map((m) => m()))).flat();
    perRun.push(await runGroups(groups));
    if (!quiet && runs > 1) console.log(`  run ${i + 1}/${runs} done`);
  }
  const results = aggregateRuns(perRun);

  const report: BenchReport = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpus: cpus().length,
    results,
  };

  writeFileSync(json, JSON.stringify(report, null, 2) + "\n");

  if (md) {
    writeFileSync(md, formatMarkdown(results) + "\n");
  }

  if (!quiet) {
    console.log(formatTable(results));
    console.log(`\nEnvironment: Node ${report.node} · ${report.platform}/${report.arch} · ${report.cpus} CPUs`);
    console.log(`Results written to ${json}`);
  }
}

main().catch((err) => {
  console.error("Benchmark run failed:", err);
  process.exit(1);
});
