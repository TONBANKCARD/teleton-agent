# FAQ and Best Practices

## Screenshots

![Adaptive prompting](../assets/screenshots/en/adaptive-prompting-soul.png)
![Memory prioritization](../assets/screenshots/en/memory-prioritization.png)
![Audit trail](../assets/screenshots/en/audit-trail-security-page.png)

## FAQ

### Should I use user mode or bot mode?

Use user mode when you need full Telegram account access, dialogs, history, media, and advanced Telegram features. Use bot mode when you want lower account risk and simpler deployment.

### Why is `telegram.admin_ids` required?

Autonomous actions must be attributed to a real administrator. Without admin IDs, autonomous manager and heartbeat cannot safely route escalations or admin-only tool calls.

### Can I expose WebUI to the internet?

Do not expose it directly. Keep it on localhost or put it behind a hardened reverse proxy, TLS, strong auth, IP controls, and monitoring.

### How many tools should be enabled?

Enable only tools the agent currently needs. Use Tool RAG to send relevant tools to the model, but still restrict dangerous tools with scope and Security Center policies.

### How do I control cost?

Set sensible iteration limits, use a cheaper utility model, monitor Analytics, keep cache enabled, and pause looping autonomous tasks.

### Where should I put long-term instructions?

Use Soul Editor for behavior and policy instructions. Use Memory for factual long-term context. Use Configuration for settings. Do not hide settings or secrets in prompts.

## Best Practices

### Security

- Use a dedicated Telegram account.
- Keep wallet tools approval-gated.
- Keep exec off unless explicitly needed.
- Rotate secrets after accidental exposure.
- Review audit logs after every production change.

### Operations

- Start each day from Dashboard.
- Review pending approvals before enabling autonomous work.
- Keep one focused dashboard for daily use.
- Use Workflows and Pipelines for repeatable procedures.
- Export config before major changes.

### Prompt Management

- Save prompt versions before edits.
- Use A/B experiments for tone changes.
- Keep security prompts concrete.
- Avoid prompt instructions that duplicate configuration.

### Memory

- Pin durable facts.
- Clean stale memory periodically.
- Sync vectors after changing embedding or Upstash settings.
- Use Sessions for recent context and Memory for durable knowledge.

### Autonomous Tasks

- Write measurable success criteria.
- Define failure conditions.
- Restrict risky tools.
- Pause instead of deleting when more context is needed.
- Inspect checkpoints before restarting failed work.
