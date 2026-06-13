---
title: "[AUDIT/V6] registerPluginTools silently drops tool-name collisions (no warning, unlike replacePluginTools)"
labels: ["bug", "audit-finding-v6", "low", "reliability"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-018"
severity: "low"
category: "reliability"
github-issue: "pending"
---

## Problem Description

`ToolRegistry.registerPluginTools` skips any tool whose name already exists, but
does so **silently**:

```ts
for (const { tool, executor, scope } of tools) {
  if (this.tools.has(tool.name)) continue;   // dropped with no log
  ...
}
```

The sibling `replacePluginTools` handles the same collision but **logs a
warning** ("tried to overwrite existing tool … — skipped"). The asymmetry means a
plugin whose tool name clashes with a core/other-plugin tool is partially loaded
with no diagnostic: the registry returns a count lower than the plugin author
expects, the missing tool simply never appears, and there is nothing in the logs
to explain why. This is a confusing, hard-to-debug failure mode for plugin
authors.

## Location

- `src/agent/tools/registry.ts:428` — `registerPluginTools` silently `continue`s
  on collision.
- `src/agent/tools/registry.ts:478-483` — `replacePluginTools` logs a warning for
  the same case (the behavior to mirror).

## How To Reproduce

1. Install a plugin that registers a tool whose name equals an existing tool.
2. Load it via `registerPluginTools` → the tool is missing and the return count
   is short, with no log line indicating a collision.

## Impact

Silent partial plugin loads; plugin authors get no feedback that a name clash
dropped their tool. Low severity (no crash/security impact) but a real
developer-experience and observability gap.

## Proposed Fix

Mirror `replacePluginTools`: log a warning when skipping a colliding tool, and
include the collision in any returned/aggregated result so callers can report it.

```ts
if (this.tools.has(tool.name)) {
  log.warn(`Plugin "${pluginName}" tool "${tool.name}" collides with an existing tool — skipped`);
  continue;
}
```

## Regression Test

```typescript
it("warns when a plugin tool name collides with an existing tool", () => {
  const warn = vi.spyOn(log, "warn");
  registry.registerPluginTools("p", [{ tool: existingTool, executor }]);
  expect(warn).toHaveBeenCalled();
});
```

## Acceptance Criteria

- [ ] A colliding plugin tool is logged (warning) when skipped.
- [ ] Behavior is consistent between `registerPluginTools` and
      `replacePluginTools`.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-018`
- Module: `src/agent/tools/registry.ts`
