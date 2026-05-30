# Performance Benchmarks

Teleton Agent ships a benchmark suite for its performance-critical paths so that
regressions are visible, operators can size hardware, and "fast" is a measured
claim rather than an assertion.

The suite lives in [`benchmarks/`](../benchmarks) and is built on
[tinybench](https://github.com/tinylibs/tinybench).

## Quick start

```bash
npm run bench                 # run all benchmarks, print a report, write benchmarks/results.json
npm run bench:check           # run benchmarks and fail if a tracked metric regresses > 20%
npm run bench:update-baseline # regenerate the committed baseline (benchmarks/baseline.json)
```

By default only the deterministic, offline suites run. Two suites are opt-in
because they require the network (and, for LLMs, API keys):

```bash
RUN_NETWORK_BENCH=1 npm run bench   # also run a real DeDust quote round-trip
RUN_LLM_BENCH=1 GROQ_API_KEY=… ANTHROPIC_API_KEY=… npm run bench   # also measure LLM first-token latency
```

## What is measured

| Suite | File | What it exercises |
| ----- | ---- | ----------------- |
| `memory-search` | [`memory-search.bench.ts`](../benchmarks/memory-search.bench.ts) | Semantic KNN search over an in-memory `sqlite-vec` cosine index (the production path), with corpus sizes N = 100 / 1 000 / 10 000. |
| `agentic-loop` | [`agentic-loop.bench.ts`](../benchmarks/agentic-loop.bench.ts) | Per-iteration CPU overhead around each LLM turn: Gemini schema sanitization, oversized tool-result truncation, and a mocked parse → tool-select → dispatch cycle. |
| `dex-routing` | [`dex-routing.bench.ts`](../benchmarks/dex-routing.bench.ts) | DEX routing prep: TON address parsing/normalisation and human↔base-unit amount conversion. An opt-in tier runs a real DeDust quote. |
| `llm-providers` | [`llm-providers.bench.ts`](../benchmarks/llm-providers.bench.ts) | Opt-in: time-to-first-token streamed from each configured provider (Groq / OpenRouter / Anthropic). |

The deterministic suites import the **real** source modules
(`serializeEmbedding`, `sanitizeToolsForGemini`, `truncateToolResult`,
`toUnits`/`fromUnits`, `@ton/core` `Address`) and the real `better-sqlite3` +
`sqlite-vec` dependencies — only the data is synthetic — so they track the
behaviour of production code, not a reimplementation.

## Baseline

The committed baseline ([`benchmarks/baseline.json`](../benchmarks/baseline.json),
table mirrored in [`benchmarks-results.md`](./benchmarks-results.md)) was captured
on a GitHub-Actions-class Linux runner:

- **CPU:** AMD EPYC, 6 vCPU
- **Node:** v20
- **OS:** Linux x64

> Numbers are hardware-dependent. The absolute values below illustrate scaling
> and relative cost; the regression gate (below) compares like-for-like on a
> single runner, so it is not affected by cross-machine drift.

#### memory-search

| Group | Task | ops/sec | mean (ms) | p99 (ms) |
| ----- | ---- | ------: | --------: | -------: |
| N=100 | knn top-10 | ~8 600 | 0.116 | 0.153 |
| N=1 000 | knn top-10 | ~3 560 | 0.281 | 0.327 |
| N=10 000 | knn top-10 | ~287 | 3.479 | 4.455 |

#### agentic-loop

| Group | Task | ops/sec | mean (ms) |
| ----- | ---- | ------: | --------: |
| schema-prep | sanitize tool schemas (8 tools) | ~50 000 | 0.020 |
| result-handling | truncate large tool result (~10 KB) | ~22 800 | 0.044 |
| dispatch | parse + dispatch 4 tasks (mocked) | ~455 000 | 0.0022 |

#### dex-routing

| Group | Task | ops/sec | mean (ms) |
| ----- | ---- | ------: | --------: |
| address-prep | parse + normalise jetton addresses | ~228 000 | 0.0044 |
| amount-conversion | amount ↔ base units (9 decimals) | ~1 090 000 | 0.0009 |

Memory search scales roughly linearly with the corpus size, as expected for a
brute-force cosine KNN: ~0.12 ms at 100 entries, ~3.5 ms at 10 000 entries.

## Regression detection

`npm run bench:check` (and the **Benchmarks** CI job) compares a fresh run against
a baseline and fails when any tracked metric's mean time per operation degrades by
more than **20%**.

Two design choices keep the gate stable despite benchmark jitter:

1. **Min-of-N runs.** Each suite is run several times and the best (lowest mean)
   measurement per task is kept — this filters out scheduler noise far better than
   a single run.
2. **Same-hardware comparison in CI.** The CI job benchmarks both the PR and its
   merge base on the *same* runner using the *same* harness, so only the source
   change can move the numbers. The committed `baseline.json` is used for local
   checks and documentation.

Sub-microsecond tasks are excluded from the gate (jitter dominates a meaningful
ratio there); they are still reported.

The regression gate runs in CI only for PRs that touch performance-sensitive
paths: `src/memory/`, `src/agent/`, `src/agents/`, `src/ton/`, or `benchmarks/`.

## Updating the baseline

Regenerate after intentional, justified performance changes (or a hardware
change for the reference numbers):

```bash
npm run bench:update-baseline
git add benchmarks/baseline.json docs/benchmarks-results.md
git commit -m "chore(bench): refresh performance baseline"
```
