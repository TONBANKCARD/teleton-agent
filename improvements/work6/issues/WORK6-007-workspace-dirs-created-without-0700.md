---
title: "[AUDIT/V6] TELETON_ROOT and workspace directories are created world/group-readable (no 0o700 mode)"
labels: ["bug", "audit-finding-v6", "medium", "security"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-007"
severity: "medium"
category: "security"
github-issue: "pending"
---

## Problem Description

`ensureWorkspace` creates `TELETON_ROOT`, `WORKSPACE_ROOT`, and all workspace
subdirectories with `mkdirSync(path, { recursive: true })` and **no `mode`**, so
they are created with the process umask default (typically `0o755`) — readable
and traversable by other local users. Only a handful of named directories
(`secrets`, `plugins`, `tls`) are tightened later by
`hardenExistingPermissions`; the root and the general workspace tree (which holds
`MEMORY.md`, downloads, temp files, daily memory logs) are not.

While individual sensitive files may be `0o600`, directory traversal bits being
open lets other local accounts enumerate filenames, sizes, and timestamps, and
read any file that wasn't individually hardened.

## Location

- `src/workspace/manager.ts:58-67` — `mkdirSync(TELETON_ROOT, {recursive:true})`
  and `mkdirSync(WORKSPACE_ROOT, {recursive:true})` with no `mode`.
- `src/workspace/manager.ts:78-82` — subdirectories (`MEMORY_DIR`,
  `DOWNLOADS_DIR`, `UPLOADS_DIR`, `TEMP_DIR`, `MEMES_DIR`) created with no `mode`.
- `src/workspace/harden-permissions.ts:29-30,64-78` — only `secrets`/`plugins`/
  `tls` are forced to `0o700`; the root/workspace tree is not.

## How To Reproduce

1. Fresh install; let `ensureWorkspace` create the tree.
2. `stat -c '%a' ~/.teleton ~/.teleton/workspace` → `755` (others can traverse
   and list).

## Impact

On multi-user hosts, other local accounts can enumerate and (for any
non-individually-hardened file) read the agent's working data — message logs,
downloads, temp artifacts, identity/memory files.

## Proposed Fix

- Pass `{ recursive: true, mode: 0o700 }` when creating `TELETON_ROOT`,
  `WORKSPACE_ROOT`, and subdirectories (note `mkdir` applies umask; follow with an
  explicit `chmodSync(dir, 0o700)` to be deterministic).
- Extend `hardenExistingPermissions` to chmod the root and workspace tree to
  `0o700`, not just `secrets`/`plugins`/`tls`.

## Regression Test

```typescript
it("creates the teleton root and workspace as 0o700", async () => {
  await ensureWorkspace({ silent: true });
  expect(statSync(TELETON_ROOT).mode & 0o777).toBe(0o700);
  expect(statSync(WORKSPACE_ROOT).mode & 0o777).toBe(0o700);
});
```

## Acceptance Criteria

- [ ] Root and workspace directories are `0o700` after creation.
- [ ] The hardening pass also enforces `0o700` on the root/workspace tree.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-007`
- Modules: `src/workspace/manager.ts`, `src/workspace/harden-permissions.ts`
