/**
 * Shared benchmark harness built on tinybench.
 *
 * Each `*.bench.ts` module default-exports an async factory that prepares its
 * data (building an in-memory DB, generating fixtures, …) and returns a list of
 * {@link BenchGroup}. The runner ({@link ./run.ts}) executes every group, then
 * formats a report and writes machine-readable JSON consumed by the regression
 * checker ({@link ./check-regression.ts}).
 *
 * Pure orchestration — no project source is imported here, so the harness is
 * cheap to load and safe to unit-test.
 */
import { Bench } from "tinybench";

/** A named tinybench instance. `suite` groups related benches, `group` labels a variant (e.g. "N=1000"). */
export interface BenchGroup {
  suite: string;
  group: string;
  bench: Bench;
}

/** A module that prepares fixtures and returns benches. Returning `[]` means "skipped" (e.g. no network/keys). */
export type BenchModule = () => Promise<BenchGroup[]>;

/** One measured task, flattened for reporting and regression comparison. */
export interface BenchResult {
  /** Stable identifier: `${suite}/${group}/${task}`. */
  key: string;
  suite: string;
  group: string;
  task: string;
  /** Operations per second (higher is better). */
  hz: number;
  /** Mean wall-clock time per operation, in milliseconds (lower is better). */
  meanMs: number;
  /** 99th percentile time per operation, in milliseconds. */
  p99Ms: number;
  /** Number of samples tinybench collected. */
  samples: number;
}

/** Top-level shape persisted to `results.json` / `baseline.json`. */
export interface BenchReport {
  /** ISO-8601 timestamp; injected by the runner (scripts cannot call Date.now()). */
  generatedAt: string;
  node: string;
  platform: string;
  arch: string;
  cpus: number;
  results: BenchResult[];
}

/** Default tinybench settings — long enough to be stable, short enough for CI. */
export const DEFAULT_BENCH_OPTIONS = { time: 500, iterations: 10, warmupTime: 100 } as const;

/** Create a tinybench instance with project defaults, overridable per-bench. */
export function makeBench(options: Partial<typeof DEFAULT_BENCH_OPTIONS> = {}): Bench {
  return new Bench({ ...DEFAULT_BENCH_OPTIONS, ...options });
}

/** Run every group sequentially and flatten tinybench's results into {@link BenchResult}. */
export async function runGroups(groups: BenchGroup[]): Promise<BenchResult[]> {
  const results: BenchResult[] = [];
  for (const { suite, group, bench } of groups) {
    await bench.run();
    for (const task of bench.tasks) {
      const r = task.result;
      if (!r) continue;
      results.push({
        key: `${suite}/${group}/${task.name}`,
        suite,
        group,
        task: task.name,
        // tinybench reports latency in milliseconds.
        hz: r.hz ?? 0,
        meanMs: r.mean ?? 0,
        p99Ms: r.p99 ?? r.mean ?? 0,
        samples: r.samples?.length ?? 0,
      });
    }
  }
  return results;
}

/**
 * Aggregate several full-suite runs into one result set by keeping each task's
 * **best** (lowest mean) measurement. Min-of-N filters out scheduling jitter and
 * is far more stable than a single run — important for a regression gate.
 */
export function aggregateRuns(runs: BenchResult[][]): BenchResult[] {
  const best = new Map<string, BenchResult>();
  for (const run of runs) {
    for (const r of run) {
      const prev = best.get(r.key);
      if (!prev || r.meanMs < prev.meanMs) best.set(r.key, r);
    }
  }
  return [...best.values()];
}

/** Render results as an aligned plain-text table, grouped by suite. */
export function formatTable(results: BenchResult[]): string {
  if (results.length === 0) return "(no benchmark results — all suites skipped)";
  const lines: string[] = [];
  const bySuite = new Map<string, BenchResult[]>();
  for (const r of results) {
    const arr = bySuite.get(r.suite) ?? [];
    arr.push(r);
    bySuite.set(r.suite, arr);
  }

  for (const [suite, rows] of bySuite) {
    lines.push("");
    lines.push(`### ${suite}`);
    const header = ["group", "task", "ops/sec", "mean (ms)", "p99 (ms)", "samples"];
    const table = rows.map((r) => [
      r.group,
      r.task,
      formatHz(r.hz),
      r.meanMs.toFixed(4),
      r.p99Ms.toFixed(4),
      String(r.samples),
    ]);
    lines.push(renderColumns([header, ...table]));
  }
  return lines.join("\n");
}

/** Render results as a GitHub-flavoured Markdown table per suite. */
export function formatMarkdown(results: BenchResult[]): string {
  if (results.length === 0) return "_No benchmark results (all suites skipped)._";
  const lines: string[] = [];
  const bySuite = new Map<string, BenchResult[]>();
  for (const r of results) {
    const arr = bySuite.get(r.suite) ?? [];
    arr.push(r);
    bySuite.set(r.suite, arr);
  }
  for (const [suite, rows] of bySuite) {
    lines.push(`#### ${suite}`, "");
    lines.push("| Group | Task | ops/sec | mean (ms) | p99 (ms) | samples |");
    lines.push("| ----- | ---- | ------: | --------: | -------: | ------: |");
    for (const r of rows) {
      lines.push(
        `| ${r.group} | ${r.task} | ${formatHz(r.hz)} | ${r.meanMs.toFixed(4)} | ${r.p99Ms.toFixed(4)} | ${r.samples} |`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function formatHz(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return "0";
  return Math.round(hz).toLocaleString("en-US");
}

function renderColumns(rows: string[][]): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows
    .map((row) => row.map((cell, i) => cell.padEnd(widths[i])).join("  "))
    .join("\n");
}
