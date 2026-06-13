---
title: "[AUDIT/V6] GET /api/mtproto returns the full MTProto config including the unmasked proxy secret"
labels: ["bug", "audit-finding-v6", "medium", "security"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-008"
severity: "medium"
category: "security"
github-issue: "https://github.com/xlabtg/teleton-agent/issues/613"
---

## Problem Description

`GET /api/mtproto` returns the runtime MTProto configuration object verbatim:

```ts
const config = deps.agent.getConfig() as Record<string, any>;
const mtproto = config.mtproto ?? { enabled: false, proxies: [] };
return c.json({ success: true, data: mtproto } as APIResponse);
```

MTProto proxy entries include the proxy **secret** (the credential that
authenticates to the proxy). Returning the raw config exposes that secret in
plaintext to any client that can read the config endpoint. The sibling
`/status` route deliberately returns only `{ server, port, index }` for the
active proxy — showing the intended shape — but the base `/` route leaks
everything.

## Location

- `src/webui/routes/mtproto.ts:78-82` — `GET /` returns `config.mtproto`
  unmodified (secrets included).
- Contrast `:86-99` — `/status` returns only `server`/`port`/`index`.

## How To Reproduce

1. Configure an MTProto proxy with a `secret`.
2. `GET /api/mtproto` → response `data.proxies[].secret` is present in plaintext.

## Impact

Proxy secrets (and any other sensitive MTProto config) are disclosed to API
clients/browser sessions, captured in logs/caches, and exfiltratable by any XSS
or over-broad token. Anyone with the secret can use the proxy.

## Proposed Fix

- Mask secrets before returning: redact `proxies[].secret` (e.g.
  `"••••" + last4`) and any other credential fields, mirroring how `/status`
  already narrows the payload.
- Add a shared `maskMtprotoConfig()` helper and use it on every read path.

## Regression Test

```typescript
it("GET /api/mtproto never returns a raw proxy secret", async () => {
  const res = await app.request("/api/mtproto");
  const body = await res.json();
  for (const p of body.data.proxies ?? []) expect(p.secret).not.toMatch(/^[0-9a-f]{32}/i);
});
```

## Acceptance Criteria

- [ ] Proxy secrets are masked/omitted on every MTProto read endpoint.
- [ ] A round-trip save still works (mask on read, not on store).

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-008`
- Module: `src/webui/routes/mtproto.ts`
