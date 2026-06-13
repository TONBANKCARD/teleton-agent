---
title: "[AUDIT/V6] State-mutating GET endpoints (/temporal, /patterns) bypass CSRF and are cacheable"
labels: ["bug", "audit-finding-v6", "low", "security"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-014"
severity: "low"
category: "security"
github-issue: "pending"
---

## Problem Description

Two analytics routes are declared as `GET` but perform writes as a side effect:
`GET /temporal` calls `service.syncTemporalMetadata()` and `GET /patterns` calls
`service.analyzeAndStorePatterns()` before returning data. The CSRF middleware
uses the double-submit-cookie pattern, which (correctly) treats GET/HEAD/OPTIONS
as safe and **exempts them from the token check**. Because these GETs mutate
state, they are reachable cross-site without a CSRF token and are also eligible
for HTTP caching / prefetching, which can trigger unintended writes.

This violates the HTTP safe-method contract (GET must be side-effect free) and
quietly removes CSRF protection from a write path.

## Location

- `src/webui/routes/temporal.ts:38-41` — `GET /temporal` →
  `service.syncTemporalMetadata()`.
- `src/webui/routes/temporal.ts:53-56` — `GET /patterns` →
  `service.analyzeAndStorePatterns()`.
- `src/webui/middleware/csrf.ts` — double-submit cookie; safe methods exempt.

## How To Reproduce

1. From another origin, cause the browser to issue `GET /api/.../temporal` (e.g.
   an `<img>`/prefetch) → the server runs the sync/store write with no CSRF
   token required.

## Impact

CSRF-able and cache-able writes. Low severity because the writes are
idempotent-ish metadata recomputation rather than financial/destructive actions,
but it bypasses a control and can be triggered by caches/prefetchers.

## Proposed Fix

- Split read from write: make `/temporal` and `/patterns` pure reads, and move
  the sync/analyze side effects to explicit `POST` routes (covered by CSRF), or
  run them on a schedule.
- If the side effect must stay, exempt these routes from caching
  (`Cache-Control: no-store`) and require the CSRF token.

## Regression Test

```typescript
it("does not mutate state on a GET", async () => {
  const spy = vi.spyOn(service, "syncTemporalMetadata");
  await app.request("/api/.../temporal");
  expect(spy).not.toHaveBeenCalled();   // after refactor: side effect moved to POST
});
```

## Acceptance Criteria

- [ ] No GET route performs a write side effect, or it is CSRF-protected and
      `no-store`.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-014`
- Modules: `src/webui/routes/temporal.ts`, `src/webui/middleware/csrf.ts`
