---
title: "[AUDIT/V6] API per-method rate limiters never trip and leak a timer on every request"
labels: ["bug", "audit-finding-v6", "high", "v3.0-blocker", "security"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-002"
severity: "high"
category: "security"
github-issue: "pending"
---

## Problem Description

`mutatingRateLimit` and `readRateLimit` are meant to cap POST/PUT/DELETE at
10/min and GET at 300/min. Instead of building the limiter once, they **call
`createLimiter(...)` inside the request handler on every request**:

```ts
export const mutatingRateLimit: MiddlewareHandler = async (c, next) => {
  ...
  return createLimiter(60_000, 10)(c, next);   // new limiter per request
};
```

`createLimiter` → `rateLimiter(...)` allocates a fresh `MemoryStore` each time it
is constructed. So every request gets a brand-new counter that starts at zero and
is discarded after the call. The limit of 10 (or 300) is therefore **never
reached** — the rate limiter is effectively disabled.

Worse, each `MemoryStore` from `hono-rate-limiter` starts a `setInterval` cleanup
timer on construction. Because a new store is created per request and never
`.shutdown()`-ed, **a timer is leaked on every single request**, an unbounded
resource leak that also keeps the process from settling.

The `globalRateLimit` export (line 28) is built **once** at module load and works
correctly — proving the per-method ones simply have the construction in the wrong
place.

## Location

- `src/api/middleware/rate-limit.ts:31-37` — `mutatingRateLimit` constructs the
  limiter per request.
- `src/api/middleware/rate-limit.ts:40-45` — `readRateLimit` does the same.
- Contrast with `:28` — `globalRateLimit` built once at module scope (correct).

## How To Reproduce

1. Send 50 POST requests within a minute to any route guarded by
   `mutatingRateLimit` → all 50 succeed (expected: 11th returns 429).
2. Observe the process's active timer count climbing one per request
   (`process.getActiveResourcesInfo()` / heap growth under load).

## Impact

- **Security/abuse:** the stricter mutating limit (the one that matters for
  spam/brute-force/financial actions) is non-functional, so the API has only the
  loose 60/min global cap regardless of method.
- **Reliability:** a per-request timer leak under sustained traffic exhausts
  resources over time.

## Proposed Fix

Build each limiter once at module scope and only branch on method in the
middleware:

```ts
const mutating = createLimiter(60_000, 10);
export const mutatingRateLimit: MiddlewareHandler = (c, next) =>
  ["GET", "HEAD", "OPTIONS"].includes(c.req.method) ? next() : mutating(c, next);

const read = createLimiter(60_000, 300);
export const readRateLimit: MiddlewareHandler = (c, next) =>
  c.req.method === "GET" ? read(c, next) : next();
```

## Regression Test

```typescript
it("mutating rate limit trips after the configured number of POSTs", async () => {
  const app = new Hono(); app.use("*", mutatingRateLimit); app.post("/x", (c) => c.text("ok"));
  let last; for (let i = 0; i < 12; i++) last = await app.request("/x", { method: "POST" });
  expect(last.status).toBe(429);
});
```

## Acceptance Criteria

- [ ] The mutating/read limiters share one store across requests and return 429
      once the configured limit is exceeded.
- [ ] No new timer/store is allocated per request.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-002`
- Module: `src/api/middleware/rate-limit.ts`
