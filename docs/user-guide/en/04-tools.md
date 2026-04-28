# Tools

The Tools page controls which built-in tools the agent can use and where each tool is allowed to run. This is one of the most important safety surfaces in the WebUI.

## Screenshots

![Tool-related dashboard widgets](../assets/screenshots/en/dynamic-dashboard-engine.png)
![Task delegation uses tool capabilities](../assets/screenshots/en/task-delegation-ui.png)
![Cache and tool resources](../assets/screenshots/en/cache-widget.png)

## Tool Concepts

| Concept | Description |
| --- | --- |
| Module | A group such as Telegram, TON, web, workspace, exec, or plugin tools. |
| Enabled | Whether the agent may consider the tool. |
| Scope | Where the tool can run: always, direct messages only, groups only, or admin only. |
| Cost badge | A rough indicator of latency, expense, or operational risk. |
| Stats | Total calls, success count, failures, last use, and average duration. |

## Find and Filter Tools

Use search for names, descriptions, or modules. Use the state filter to show all, enabled, or disabled tools. Sorting by module is useful for audits; sorting by name is useful when you know the exact tool.

## Inspect a Tool

Open a tool detail panel to see description, parameters, usage stats, and a test panel. Test tools with harmless parameters first. For Telegram and TON tools, prefer test accounts and small amounts.

## Enable or Disable Tools

1. Search for the tool or expand the module.
2. Toggle enabled state.
3. Choose the strictest usable scope.
4. Confirm behavior in Security Center if the tool is sensitive.

For high-risk modules:

- Keep `exec` disabled unless the operator explicitly needs system command execution.
- Keep wallet-moving TON tools admin-only or approval-gated.
- Keep workspace write/delete tools restricted to trusted operators.

## Bulk Operations

Use bulk selection for module-level audits. Good examples:

- Disable all unused tools after reviewing last-used dates.
- Set all TON send tools to admin-only.
- Export the tool configuration before a large change.
- Import a known-good tool configuration on another installation.

## Plugin Tools

Plugin tools appear alongside built-ins but come from installed plugin manifests. Review plugin permissions, secrets, and source before enabling them in production.
