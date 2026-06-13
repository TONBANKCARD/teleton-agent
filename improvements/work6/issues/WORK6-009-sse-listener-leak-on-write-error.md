---
title: "[AUDIT/V6] SSE streams (notifications, audit) leak bus listeners when a write throws or the heartbeat loop exits early"
labels: ["bug", "audit-finding-v6", "medium", "reliability"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-009"
severity: "medium"
category: "reliability"
github-issue: "pending"
---

## Problem Description

The notifications and audit SSE handlers register an event-bus listener and only
detach it on the **normal** path — after the `while (!aborted)` heartbeat loop
returns:

```ts
notificationBus.on("update", onUpdate);
while (!aborted) { await stream.sleep(30_000); ... await stream.writeSSE({event:"ping"}); }
notificationBus.off("update", onUpdate);   // only reached if the loop exits cleanly
```

`stream.onAbort` flips `aborted = true` but does **not** call
`notificationBus.off`. If `writeSSE`/`sleep` throws (client disconnect mid-write,
broken pipe), the loop body throws, the `streamSSE` callback rejects, and the
`.off(...)` line is **never reached** — the listener stays attached to the
module-level bus forever. Every reconnect adds another dangling listener, so the
bus accumulates listeners that write to dead streams (eventually tripping
`MaxListenersExceededWarning` and wasting work on every event).

## Location

- `src/webui/routes/notifications.ts:38-76` — `onAbort` sets a flag but doesn't
  detach; `notificationBus.off` only runs after the loop.
- `src/webui/routes/audit.ts:133-158` — same pattern with `auditTrailBus`.

## How To Reproduce

1. Open `GET /api/notifications/stream`, then kill the connection abruptly so the
   next `writeSSE` throws.
2. Repeat N times.
3. Inspect `notificationBus.listenerCount("update")` → grows by ~1 per aborted
   connection instead of returning to baseline.

## Impact

Unbounded listener accumulation on long-lived processes: memory growth, Node's
max-listeners warning, and CPU wasted firing handlers that write to closed
streams. Degrades over days of normal browser reconnects.

## Proposed Fix

- Detach inside `onAbort` and in a `finally` block so the listener is removed on
  every exit path:

```ts
const cleanup = () => notificationBus.off("update", onUpdate);
stream.onAbort(() => { aborted = true; cleanup(); });
try { while (!aborted) { ... } } finally { cleanup(); }
```

## Regression Test

```typescript
it("removes the bus listener even when the stream errors", async () => {
  const before = notificationBus.listenerCount("update");
  await simulateAbortedStream();
  expect(notificationBus.listenerCount("update")).toBe(before);
});
```

## Acceptance Criteria

- [ ] Listener count returns to baseline after a stream aborts or errors.
- [ ] Both notifications and audit SSE routes detach on every exit path.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-009`
- Modules: `src/webui/routes/notifications.ts`, `src/webui/routes/audit.ts`
