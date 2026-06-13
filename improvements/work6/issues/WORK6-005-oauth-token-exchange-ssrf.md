---
title: "[AUDIT/V6] OAuth token-exchange endpoint performs server-side fetch of a caller-supplied tokenUrl (SSRF)"
labels: ["bug", "audit-finding-v6", "medium", "security"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-005"
severity: "medium"
category: "security"
github-issue: "pending"
---

## Problem Description

The integrations OAuth token-exchange route takes `tokenUrl` straight from the
request body and hands it to `exchangeOAuthCode`, which calls
`requestOAuthToken(tokenUrl, ...)` → `fetch(tokenUrl, ...)` server-side. The URL
is never validated against an allowlist, never checked for private/loopback/
link-local targets, and DNS is never resolved/re-checked, so the WebUI/Management
API can be coerced into issuing arbitrary server-side POST requests to internal
addresses (cloud metadata `169.254.169.254`, `localhost` admin ports, internal
services). The response is then surfaced to the caller.

Unlike `src/config/mcp-security.ts`'s `validateMcpServerUrl` (which at least
blocks IP literals), the OAuth path applies **no** URL validation at all.

## Location

- `src/webui/routes/integrations.ts:225-253` — `POST /:id/oauth/token` reads
  `tokenUrl` from the body and passes it to `registry.auth.exchangeOAuthCode`.
- `src/services/integrations/auth.ts:226-241` — `exchangeOAuthCode` →
  `requestOAuthToken(input.tokenUrl, ...)`.
- `src/services/integrations/auth.ts:345-354` — `requestOAuthToken` does
  `await fetch(tokenUrl, { method: "POST", ... })` with no SSRF guard.

## How To Reproduce

1. `POST /api/integrations/<id>/oauth/token` with
   `{"tokenUrl":"http://169.254.169.254/latest/meta-data/...","clientId":"x","code":"y","redirectUri":"z"}`.
2. The server performs the request to the internal target; timing/response
   differences (or the echoed error) confirm reachability.

## Impact

Server-side request forgery from the management surface: internal network
probing, cloud metadata/credential theft, and interaction with internal-only
services using the agent host's network position.

## Proposed Fix

- Validate `tokenUrl` before fetching: require `https:`, reject IP literals and
  hostnames that resolve to private/loopback/link-local/ULA ranges, and re-check
  after DNS resolution (pin the resolved IP for the connection).
- Prefer an allowlist of known provider token endpoints, or bind `tokenUrl` to
  the integration's configured provider rather than accepting it per request.
- Reuse a single hardened URL-guard helper across MCP, webhooks, and OAuth.

## Regression Test

```typescript
it("rejects an OAuth tokenUrl that targets a private/loopback address", async () => {
  const res = await app.request("/api/integrations/x/oauth/token", {
    method: "POST",
    body: JSON.stringify({ tokenUrl: "http://127.0.0.1:9000/", clientId: "a", code: "b", redirectUri: "c" }),
  });
  expect(res.status).toBeGreaterThanOrEqual(400);
});
```

## Acceptance Criteria

- [ ] `tokenUrl` values resolving to private/loopback/link-local ranges are
      rejected before any outbound request.
- [ ] The same guard covers DNS-rebinding (validation after resolution).

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-005`
- Modules: `src/webui/routes/integrations.ts`,
  `src/services/integrations/auth.ts`
