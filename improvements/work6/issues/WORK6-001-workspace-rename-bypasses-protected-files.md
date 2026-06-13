---
title: "[AUDIT/V6] workspace_rename can move/clobber protected & immutable workspace files (SOUL.md, etc.) that workspace_delete blocks"
labels: ["bug", "audit-finding-v6", "high", "v3.0-blocker", "security"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-001"
severity: "high"
category: "security"
github-issue: "https://github.com/xlabtg/teleton-agent/issues/606"
---

## Problem Description

`workspace_delete` refuses to delete the agent's core files — it carries an
explicit `PROTECTED_WORKSPACE_FILES` list (`SOUL.md`, `STRATEGY.md`,
`SECURITY.md`, `MEMORY.md`, `IDENTITY.md`, `USER.md`) and rejects any delete that
targets one of them. The workspace write path enforces a stricter
`IMMUTABLE_FILES` list (`SOUL.md`, `STRATEGY.md`, `SECURITY.md`) as well.

`workspace_rename` enforces **neither**. It validates only that the source exists
and the destination is in-bounds, then calls `renameSync` unconditionally. Two
abuses follow:

1. **Bypass of the delete protection** — renaming `SOUL.md` to `SOUL.md.bak`
   removes the protected file from its canonical path, achieving exactly what
   `workspace_delete` forbids.
2. **Bypass of the immutable protection** — renaming an arbitrary
   attacker-controlled file *onto* `SECURITY.md`/`SOUL.md` (with `overwrite:true`)
   replaces an immutable file's contents, even though the write path would have
   rejected a direct write.

Because these files define the agent's identity, strategy, and **security
policy**, a tool-capable prompt (or a compromised plugin) can neutralize the
agent's own guardrails through the one workspace mutation that forgot to check.

## Location

- `src/agent/tools/workspace/rename.ts:36-71` — executor performs
  `validatePath(from,false)` / `validatePath(to,true)` then `renameSync(...)`
  with no protected/immutable check.
- `src/agent/tools/workspace/delete.ts:15-22,52` — the
  `PROTECTED_WORKSPACE_FILES` list and the guard that `rename` is missing.
- `src/workspace/validator.ts:211,220` — `IMMUTABLE_FILES` enforced by
  `validateWritePath` but not by the rename path.

## How To Reproduce

1. Drive the agent to call `workspace_rename` with `from: "SOUL.md"`,
   `to: "SOUL.md.bak"` → succeeds; `SOUL.md` no longer exists at its path.
2. Call `workspace_rename` with `from: "notes.md"`, `to: "SECURITY.md"`,
   `overwrite: true` → succeeds; the immutable `SECURITY.md` is replaced.

## Impact

The agent's protected/immutable core files (identity, strategy, **security
policy**) can be deleted-by-move or overwritten via a path that skips the checks
every sibling tool enforces. This directly undermines the integrity guarantees
those lists are meant to provide.

## Proposed Fix

- Apply the same protection in `rename.ts`: reject the operation when
  `validatedFrom.filename` is in `PROTECTED_WORKSPACE_FILES` (cannot move a
  protected file away) **and** when `validatedTo.filename` is in
  `PROTECTED_WORKSPACE_FILES` / `IMMUTABLE_FILES` (cannot overwrite one).
- Centralize the protected/immutable lists in one module so delete, write, and
  rename can't drift apart again.

## Regression Test

```typescript
it("workspace_rename refuses to move away or overwrite protected files", async () => {
  expect((await workspaceRenameExecutor({ from: "SOUL.md", to: "SOUL.bak" }, ctx)).success).toBe(false);
  expect((await workspaceRenameExecutor({ from: "notes.md", to: "SECURITY.md", overwrite: true }, ctx)).success).toBe(false);
});
```

## Acceptance Criteria

- [ ] Renaming a protected file to any other name is rejected.
- [ ] Renaming any file onto a protected/immutable name is rejected.
- [ ] Protected/immutable lists are shared by delete, write, and rename.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-001`
- Modules: `src/agent/tools/workspace/rename.ts`, `delete.ts`,
  `src/workspace/validator.ts`
