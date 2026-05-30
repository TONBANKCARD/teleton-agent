import { describe, it, expect } from "vitest";
import type { BenchResult } from "../harness.js";
import { detectRegressions, formatRegressionReport } from "../regression.js";

/** Build a minimal BenchResult with only the fields the gate cares about. */
function result(key: string, meanMs: number): BenchResult {
  return {
    key,
    suite: key.split("/")[0] ?? "suite",
    group: key.split("/")[1] ?? "group",
    task: key.split("/")[2] ?? "task",
    hz: meanMs > 0 ? 1000 / meanMs : 0,
    meanMs,
    p99Ms: meanMs,
    samples: 10,
  };
}

describe("detectRegressions", () => {
  it("does not flag identical runs", () => {
    const baseline = [result("memory/N=100/knn", 0.1), result("dex/prep/parse", 0.05)];
    const report = detectRegressions(baseline, baseline);
    expect(report.failed).toBe(false);
    expect(report.regressions).toHaveLength(0);
    expect(report.entries).toHaveLength(2);
  });

  it("does not flag improvements (faster current run)", () => {
    const baseline = [result("memory/N=100/knn", 0.2)];
    const current = [result("memory/N=100/knn", 0.1)];
    const report = detectRegressions(baseline, current);
    expect(report.failed).toBe(false);
    expect(report.entries[0].deltaPct).toBeCloseTo(-50, 5);
    expect(report.entries[0].regressed).toBe(false);
  });

  it("does not flag a slowdown at or just under the threshold", () => {
    const baseline = [result("memory/N=100/knn", 1.0)];
    // Exactly +20% — boundary is exclusive (> threshold), so this passes.
    const current = [result("memory/N=100/knn", 1.2)];
    const report = detectRegressions(baseline, current, { thresholdPct: 20 });
    expect(report.failed).toBe(false);
    expect(report.entries[0].deltaPct).toBeCloseTo(20, 5);
    expect(report.entries[0].regressed).toBe(false);
  });

  it("flags a slowdown beyond the threshold", () => {
    const baseline = [result("memory/N=100/knn", 1.0)];
    const current = [result("memory/N=100/knn", 1.25)];
    const report = detectRegressions(baseline, current, { thresholdPct: 20 });
    expect(report.failed).toBe(true);
    expect(report.regressions).toHaveLength(1);
    expect(report.regressions[0].key).toBe("memory/N=100/knn");
    expect(report.entries[0].deltaPct).toBeCloseTo(25, 5);
  });

  it("respects a custom threshold", () => {
    const baseline = [result("memory/N=100/knn", 1.0)];
    const current = [result("memory/N=100/knn", 1.4)]; // +40%
    expect(detectRegressions(baseline, current, { thresholdPct: 50 }).failed).toBe(false);
    expect(detectRegressions(baseline, current, { thresholdPct: 30 }).failed).toBe(true);
  });

  it("ignores noise-dominated sub-millisecond tasks", () => {
    // Baseline below the default minMeanMs (0.001 ms): even a huge relative jump
    // must not fail the gate.
    const baseline = [result("dex/conv/units", 0.0005)];
    const current = [result("dex/conv/units", 0.002)]; // +300%
    const report = detectRegressions(baseline, current);
    expect(report.failed).toBe(false);
    expect(report.entries[0].regressed).toBe(false);
  });

  it("marks tasks missing from the current run without failing", () => {
    const baseline = [result("memory/N=100/knn", 0.1), result("dex/prep/parse", 0.05)];
    const current = [result("memory/N=100/knn", 0.1)];
    const report = detectRegressions(baseline, current);
    expect(report.failed).toBe(false);
    const missing = report.entries.find((e) => e.key === "dex/prep/parse");
    expect(missing?.missing).toBe(true);
  });

  it("lists tasks added in the current run without evaluating them", () => {
    const baseline = [result("memory/N=100/knn", 0.1)];
    const current = [
      result("memory/N=100/knn", 0.1),
      result("memory/N=1000/knn", 99), // brand new, never gated
    ];
    const report = detectRegressions(baseline, current);
    expect(report.added).toEqual(["memory/N=1000/knn"]);
    expect(report.failed).toBe(false);
    expect(report.entries).toHaveLength(1);
  });

  it("reports every regression when several tasks degrade", () => {
    const baseline = [result("a/g/t", 1.0), result("b/g/t", 1.0), result("c/g/t", 1.0)];
    const current = [result("a/g/t", 2.0), result("b/g/t", 1.0), result("c/g/t", 3.0)];
    const report = detectRegressions(baseline, current, { thresholdPct: 20 });
    expect(report.regressions.map((r) => r.key).sort()).toEqual(["a/g/t", "c/g/t"]);
    expect(report.failed).toBe(true);
  });
});

describe("formatRegressionReport", () => {
  it("renders an ok summary with a passing run", () => {
    const report = detectRegressions([result("a/g/t", 1.0)], [result("a/g/t", 1.0)]);
    const text = formatRegressionReport(report);
    expect(text).toContain("✅ No regressions detected.");
    expect(text).toContain("a/g/t");
  });

  it("renders a failing summary and the missing marker", () => {
    const baseline = [result("a/g/t", 1.0), result("b/g/t", 1.0)];
    const current = [result("a/g/t", 2.0)];
    const text = formatRegressionReport(detectRegressions(baseline, current));
    expect(text).toContain("❌ 1 regression(s) detected.");
    expect(text).toContain("⚠️ missing");
  });
});
