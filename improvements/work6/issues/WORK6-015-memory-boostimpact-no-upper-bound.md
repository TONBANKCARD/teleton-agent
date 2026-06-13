---
title: "[AUDIT/V6] memory boostImpact accepts an unbounded amount — a client can inflate a memory's ranking arbitrarily"
labels: ["bug", "audit-finding-v6", "low", "data-integrity"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-015"
severity: "low"
category: "data-integrity"
github-issue: "pending"
---

## Problem Description

`MemoryScorer.boostImpact(memoryIds, amount)` clamps the increment to a **minimum**
of 1 but applies **no upper bound**:

```ts
const increment = Math.max(1, Math.floor(amount));
```

The Management API route passes the client-supplied amount straight through:

```ts
const body = await c.req.json<{ memoryIds?: string[]; amount?: number }>();
memoryScorer.boostImpact(ids, body.amount ?? 1);
```

So a caller can pass `amount: 1e9` and arbitrarily inflate a memory's impact
score, dominating retrieval ranking (and potentially overflowing the stored
counter). The same is true of `recordAccess`.

## Location

- `src/memory/scoring.ts:188-193` — `boostImpact` clamps only the lower bound.
- `src/memory/scoring.ts:163-168` — `recordAccess` has the same shape.
- `src/webui/routes/memory.ts:242,253` — route forwards `body.amount` unbounded.

## How To Reproduce

1. `POST /api/memory/boost` with `{ "memoryIds": ["m1"], "amount": 1000000000 }`.
2. `m1`'s impact score jumps by a billion and outranks everything in retrieval.

## Impact

Ranking integrity: a single API call can pin an arbitrary memory to the top of
recall, skewing what the agent retrieves. Low severity (requires API access and
affects ranking, not correctness of stored data), but it's an unvalidated input
into a scoring primitive.

## Proposed Fix

- Validate and clamp `amount` to a sane range at the route (e.g. `1..100`) and
  defensively in `boostImpact`/`recordAccess`
  (`Math.min(MAX_BOOST, Math.max(1, Math.floor(amount)))`).
- Reject non-finite/negative values explicitly.

## Regression Test

```typescript
it("clamps an out-of-range boost amount", () => {
  scorer.boostImpact(["m1"], 1e9);
  expect(scorer.getImpact("m1")).toBeLessThanOrEqual(MAX_BOOST);
});
```

## Acceptance Criteria

- [ ] `amount` is clamped to a documented maximum at the API and in the scorer.
- [ ] Non-finite/negative amounts are rejected.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-015`
- Modules: `src/memory/scoring.ts`, `src/webui/routes/memory.ts`
