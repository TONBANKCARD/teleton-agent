---
title: "[AUDIT/V6] Frontend list/analytics loaders have no request sequencing — a slow earlier response overwrites a newer one"
labels: ["bug", "audit-finding-v6", "medium", "reliability", "frontend"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-013"
severity: "medium"
category: "reliability"
github-issue: "pending"
---

## Problem Description

Several data loaders fire an async fetch keyed on user input and unconditionally
write the result into state, with no AbortController and no "ignore if
superseded" guard. When the user changes the input quickly (typing a search,
paging, switching the analytics period), responses can resolve out of order and a
**stale earlier response overwrites the newer one**, leaving the UI showing data
that doesn't match the current selection.

```ts
const loadSessions = useCallback(async (p, q, ct) => {
  const res = await api.listSessions(p, limit, { q, chatType: ct });
  setSessions(res.data.sessions);   // no check that this is still the latest request
  ...
}, []);
```

The Analytics page has the same shape: effects fire on `[period]` changes and set
state from whichever request resolves last in wall-clock terms, not the one for
the current `period`.

## Location

- `web/src/pages/Sessions.tsx:617-633` — `loadSessions` sets state with no
  sequencing/abort.
- `web/src/pages/Analytics.tsx:188-209` and `:444-468` — period-keyed loaders
  set state with no sequencing/abort.

## How To Reproduce

1. On the Sessions page, type a query that returns slowly, then immediately
   refine it to a query that returns quickly.
2. The fast (newer) results render first, then the slow (older) results arrive
   and replace them → the list no longer matches the search box.

## Impact

Users intermittently see wrong/stale data (sessions, usage charts, anomaly
stats) for the current filter. Confusing and, for analytics, misleading.

## Proposed Fix

- Use an `AbortController` per request and abort the previous one on a new call,
  or a monotonically increasing request id and apply results only when the id is
  still current:

```ts
const reqIdRef = useRef(0);
const id = ++reqIdRef.current;
const res = await api.listSessions(...);
if (id === reqIdRef.current) setSessions(res.data.sessions);
```

## Regression Test

```tsx
it("ignores a stale response that resolves after a newer request", async () => {
  // fire load("a") (slow) then load("b") (fast); resolve "b" then "a";
  // expect state reflects "b"
});
```

## Acceptance Criteria

- [ ] Out-of-order responses never overwrite newer state.
- [ ] Applies to Sessions search/paging and Analytics period loaders.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-013`
- Modules: `web/src/pages/Sessions.tsx`, `web/src/pages/Analytics.tsx`
