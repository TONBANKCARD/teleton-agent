# Security Center

Security Center is the audit and policy hub. Use it to inspect administrative mutations, zero-trust policy decisions, approval queues, validation logs, secrets, and WebUI access controls.

## Screenshots

![Audit trail](../assets/screenshots/en/audit-trail-security-page.png)
![Zero-trust security page](../assets/screenshots/en/zero-trust-security-page.png)
![Zero-trust mobile view](../assets/screenshots/en/zero-trust-security-mobile.png)

## Audit Trail

The audit trail records important events with timestamps, actors, actions, targets, payloads, and chain data. Use verification to detect broken hash chains and chain view to inspect the decision path around one event.

## Audit Log

The audit log focuses on WebUI administrative activity. It is useful for answering who changed a setting, installed a plugin, altered a policy, or approved a sensitive operation.

## Zero-Trust Policies

Policies match by tool, module, or parameter and return one of:

| Action | Meaning |
| --- | --- |
| `allow` | The operation may continue. |
| `deny` | The operation is blocked. |
| `require_approval` | A human must approve before execution. |

Keep wallet, workspace write/delete, exec, external API mutation, and account-control tools behind explicit policies.

## Approval Queue

Pending approvals show tool, parameters, requester, reason, policy, and creation time. Approve only when the requested operation matches the user's intent and current risk tolerance.

## Validation Log

The validation log is the fastest way to see why a tool call was allowed, denied, or escalated. Use it after changing policies.

## Security Settings

Security settings include session timeout, IP allowlist, and WebUI rate limit. Keep WebUI bound to localhost unless you have a protected reverse proxy and strong operational reason.

## Secrets Management

Secrets should be stored through the secrets UI or plugin-specific secret controls, not in prompt files, screenshots, or exported session logs.

## Incident Checklist

1. Export relevant audit trail records.
2. Verify the audit chain.
3. Inspect policy validation for the affected tool.
4. Rotate exposed secrets if needed.
5. Tighten tool scopes and policies before resuming autonomous tasks.
