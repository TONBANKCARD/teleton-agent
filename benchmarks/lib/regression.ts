/**
 * Pure regression-detection logic, separated from I/O so it can be unit-tested.
 *
 * A metric "regresses" when the current mean time per operation exceeds the
 * baseline by more than `thresholdPct` (default 20%). To avoid false positives
 * on sub-millisecond noise, comparisons below `minMeanMs` are ignored.
 */
import type { BenchResult } from "./harness.js";

export interface RegressionOptions {
  /** Allowed slowdown before flagging, in percent. Default: 20. */
  thresholdPct?: number;
  /** Ignore tasks whose baseline mean is below this (ms) — too fast to compare reliably. Default: 0.001. */
  minMeanMs?: number;
}

export interface RegressionEntry {
  key: string;
  baselineMs: number;
  currentMs: number;
  /** Positive = slower than baseline, negative = faster. */
  deltaPct: number;
  regressed: boolean;
  /** True when the task exists in the baseline but not in the current run. */
  missing: boolean;
}

export interface RegressionReport {
  thresholdPct: number;
  entries: RegressionEntry[];
  regressions: RegressionEntry[];
  /** Tasks present in the current run but absent from the baseline (informational). */
  added: string[];
  /** True when any task regressed beyond the threshold. */
  failed: boolean;
}

/**
 * Compare a current run against a baseline.
 *
 * Only tasks present in the baseline are evaluated for regression — this keeps
 * the check stable when new benchmarks are added in the same PR.
 */
export function detectRegressions(
  baseline: BenchResult[],
  current: BenchResult[],
  options: RegressionOptions = {}
): RegressionReport {
  const thresholdPct = options.thresholdPct ?? 20;
  const minMeanMs = options.minMeanMs ?? 0.001;

  const currentByKey = new Map(current.map((r) => [r.key, r]));
  const baselineByKey = new Map(baseline.map((r) => [r.key, r]));

  const entries: RegressionEntry[] = [];
  for (const base of baseline) {
    const cur = currentByKey.get(base.key);
    if (!cur) {
      entries.push({
        key: base.key,
        baselineMs: base.meanMs,
        currentMs: 0,
        deltaPct: 0,
        regressed: false,
        missing: true,
      });
      continue;
    }
    // Skip noise-dominated tasks where small absolute jitter swamps the ratio.
    const comparable = base.meanMs >= minMeanMs;
    const deltaPct = base.meanMs > 0 ? ((cur.meanMs - base.meanMs) / base.meanMs) * 100 : 0;
    entries.push({
      key: base.key,
      baselineMs: base.meanMs,
      currentMs: cur.meanMs,
      deltaPct,
      regressed: comparable && deltaPct > thresholdPct,
      missing: false,
    });
  }

  const added = current.filter((r) => !baselineByKey.has(r.key)).map((r) => r.key);
  const regressions = entries.filter((e) => e.regressed);

  return {
    thresholdPct,
    entries,
    regressions,
    added,
    failed: regressions.length > 0,
  };
}

/** Human-readable summary of a {@link RegressionReport}. */
export function formatRegressionReport(report: RegressionReport): string {
  const lines: string[] = [];
  lines.push(`Regression threshold: +${report.thresholdPct}% mean time per op`);
  lines.push("");
  lines.push("| Benchmark | baseline (ms) | current (ms) | delta | status |");
  lines.push("| --------- | ------------: | -----------: | ----: | ------ |");
  for (const e of report.entries) {
    if (e.missing) {
      lines.push(`| ${e.key} | ${e.baselineMs.toFixed(4)} | — | — | ⚠️ missing |`);
      continue;
    }
    const sign = e.deltaPct >= 0 ? "+" : "";
    const status = e.regressed ? "❌ regressed" : "✅ ok";
    lines.push(
      `| ${e.key} | ${e.baselineMs.toFixed(4)} | ${e.currentMs.toFixed(4)} | ${sign}${e.deltaPct.toFixed(1)}% | ${status} |`
    );
  }
  if (report.added.length > 0) {
    lines.push("");
    lines.push(`New benchmarks (no baseline yet): ${report.added.join(", ")}`);
  }
  lines.push("");
  lines.push(
    report.failed
      ? `❌ ${report.regressions.length} regression(s) detected.`
      : "✅ No regressions detected."
  );
  return lines.join("\n");
}
