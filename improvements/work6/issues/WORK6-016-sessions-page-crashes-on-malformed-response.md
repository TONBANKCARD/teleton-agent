---
title: "[AUDIT/V6] Sessions page crashes on a malformed 2xx response body (unchecked res.data access)"
labels: ["bug", "audit-finding-v6", "low", "reliability", "frontend"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-016"
severity: "low"
category: "reliability"
github-issue: "https://github.com/xlabtg/teleton-agent/issues/621"
---

## Problem Description

The session message loader assumes a successful response always carries a
well-formed body and reads nested fields directly:

```ts
setMessages(res.data.messages);
setTotal(res.data.total);
```

If a 2xx response is returned with a missing/empty body (proxy error page,
truncated JSON, schema drift), `res.data` is `undefined` and `res.data.messages`
throws, or `setMessages(undefined)` makes `messages` undefined so the later
`messages.length === 0` / `messages.map(...)` render path throws "Cannot read
properties of undefined" — the whole page errors out instead of showing an empty
state or an error message.

## Location

- `web/src/pages/Sessions.tsx:404-406` — unchecked `res.data.messages` /
  `res.data.total` access.
- `web/src/pages/Sessions.tsx:548` — render assumes `messages` is always an array
  (`messages.length`, `.map`).

## How To Reproduce

1. Stub `getSessionMessages` to resolve with `{ data: undefined }` (or a 200 with
   an empty body).
2. Open the session detail view → React render throws and the page crashes.

## Impact

A transient backend/proxy hiccup that returns a malformed 2xx takes down the
Sessions UI rather than degrading gracefully. Low severity (requires a malformed
success response) but it's an easily-hardened crash.

## Proposed Fix

- Default the nested fields: `setMessages(res.data?.messages ?? [])`,
  `setTotal(res.data?.total ?? 0)`.
- Validate the response shape (zod/io-ts) and show an error state on mismatch.

## Regression Test

```tsx
it("renders an empty state when the messages response is malformed", async () => {
  api.getSessionMessages = async () => ({ data: undefined } as any);
  // render; expect no throw and an empty/error state
});
```

## Acceptance Criteria

- [ ] A malformed 2xx response yields an empty/error state, not a crash.
- [ ] `messages` is always an array in render.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-016`
- Module: `web/src/pages/Sessions.tsx`
