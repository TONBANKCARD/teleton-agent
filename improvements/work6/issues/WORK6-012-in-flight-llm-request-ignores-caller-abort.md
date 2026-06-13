---
title: "[AUDIT/V6] In-flight LLM request ignores the caller's abort signal — only its own timeout can cancel it"
labels: ["bug", "audit-finding-v6", "medium", "reliability"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-012"
severity: "medium"
category: "reliability"
github-issue: "pending"
---

## Problem Description

The runtime threads an `AbortSignal` through the agent loop and correctly checks
`signal?.aborted` at the loop boundaries and before post-processing. But the
actual LLM network request is issued with **only its own timeout signal**:

```ts
const res = await fetch(endpoint, {
  ...
  signal: AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS),
});
```

The caller's `signal` (pipeline-step timeout, run cancellation, shutdown) is not
combined into this `fetch`. So when the caller aborts, the loop will stop
launching *new* work, but the **request already in flight keeps running** until
the LLM responds or `LLM_REQUEST_TIMEOUT_MS` elapses. On a slow generation that
can be tens of seconds of wasted latency, tokens billed for output nobody is
awaiting, and delayed shutdown.

## Location

- `src/agent/client.ts:435` — `signal: AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS)`
  with no reference to the caller's `signal`.
- `src/agent/runtime.ts` — passes `signal` into the loop and honors it at
  boundaries (`:838`, `:1148`, `:1519-1522`), but the signal does not reach the
  `fetch` above.

## How To Reproduce

1. Start a run that triggers a long LLM generation.
2. Abort the caller's signal mid-generation.
3. Observe the underlying HTTP request continues until the model responds / the
   internal timeout fires, rather than cancelling promptly.

## Impact

Cancellation/shutdown is not honored for the in-flight model call: wasted
latency and output-token spend after the consumer has given up, and slower clean
shutdown.

## Proposed Fix

Combine the caller's signal with the timeout so either can cancel the request:

```ts
const timeout = AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS);
const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
const res = await fetch(endpoint, { ..., signal });
```

Thread `callerSignal` from the runtime into `client` so it reaches the fetch.

## Regression Test

```typescript
it("aborts the in-flight LLM request when the caller signal fires", async () => {
  const ac = new AbortController();
  const p = client.complete(req, { signal: ac.signal });
  ac.abort();
  await expect(p).rejects.toMatchObject({ name: "AbortError" });
});
```

## Acceptance Criteria

- [ ] Aborting the caller signal cancels the in-flight LLM request promptly.
- [ ] The request still self-cancels on its own timeout.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-012`
- Modules: `src/agent/client.ts`, `src/agent/runtime.ts`
