---
title: "[AUDIT/V6] Frontend SSE helpers register no error/disconnect handler — streams die silently with no reconnect"
labels: ["bug", "audit-finding-v6", "low", "reliability", "frontend"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-017"
severity: "low"
category: "reliability"
github-issue: "https://github.com/xlabtg/teleton-agent/issues/622"
---

## Problem Description

The client SSE helpers open an `EventSource`, attach a single message listener,
and return a closer — but never attach an `onerror`/disconnect handler and never
signal the caller when the stream drops:

```ts
connectNotifications(onCount) {
  const eventSource = new EventSource(`${API_BASE}/notifications/stream`);
  eventSource.addEventListener("unread-count", (event) => { ... onCount(data.count); });
  return () => eventSource.close();
}
```

`EventSource` auto-reconnects on transient drops, but on a terminal error (auth
expiry, server gone, repeated failures) it transitions to `CLOSED` and stops
silently. The caller gets no error callback, so the UI shows stale data
indefinitely with no indication the live stream is dead and no opportunity to
re-auth or surface a "disconnected" state.

## Location

- `web/src/lib/api.ts:3352-3366` — `connectNotifications` (no `onerror`).
- Other SSE helpers in the same file (e.g. audit/event streams around
  `:4044-4053`) follow the same pattern.

## How To Reproduce

1. Open the app, then stop the backend.
2. The notification badge stops updating; no error is surfaced and nothing
   reconnects after the terminal failure.

## Impact

Silent loss of real-time updates (notifications, audit feed). Users see stale
counts/data with no signal that the live connection is gone. Low severity
(non-fatal, read-only data), but degrades trust in the live UI.

## Proposed Fix

- Accept an `onError`/`onStatus` callback and attach `eventSource.onerror` to
  surface disconnects; expose `readyState` so the UI can show a "reconnecting"/
  "disconnected" indicator.
- On terminal `CLOSED`, optionally re-create the `EventSource` with backoff.

## Regression Test

```tsx
it("invokes the error callback when the SSE connection fails", () => {
  const onError = vi.fn();
  const stop = connectNotifications(() => {}, onError);
  fakeEventSource.emitError();
  expect(onError).toHaveBeenCalled();
  stop();
});
```

## Acceptance Criteria

- [ ] SSE helpers surface connection errors/disconnects to the caller.
- [ ] The UI can reflect a disconnected/reconnecting state.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-017`
- Module: `web/src/lib/api.ts`
