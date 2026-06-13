---
title: "[AUDIT/V6] Permission hardening targets non-existent teleton.db*; the real memory.db/deals.db sidecars are never chmod-ed"
labels: ["bug", "audit-finding-v6", "medium", "security"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-006"
severity: "medium"
category: "security"
github-issue: "https://github.com/xlabtg/teleton-agent/issues/611"
---

## Problem Description

`hardenExistingPermissions` retroactively tightens sensitive files to `0o600` at
boot. Its `ROOT_FILES` list names a database that does not exist:
`teleton.db`, `teleton.db-wal`, `teleton.db-shm`. The application actually uses
`memory.db` (`src/index.ts`) and `deals.db` (`src/deals/db.ts`) — confirmed by
`src/backup/targets.ts` (`SQLITE_FILES = ["memory.db", "deals.db"]`).

So the hardening pass chmods nothing for the real databases. Their WAL/SHM
sidecars (`memory.db-wal`, `memory.db-shm`, `deals.db-wal`, `deals.db-shm`) —
which contain the same sensitive data as the main DB, including indexed message
content and deal records — are left at whatever mode they were created with
(typically `0o644`), readable by other local users. The gramjs bot session file
is likewise not covered here.

## Location

- `src/workspace/harden-permissions.ts:19-27` — `ROOT_FILES` lists
  `teleton.db`, `teleton.db-wal`, `teleton.db-shm` (none exist).
- Real names: `memory.db` (`src/index.ts:217`), `deals.db`
  (`src/deals/db.ts:11`), and `src/backup/targets.ts:27`
  (`SQLITE_FILES = ["memory.db", "deals.db"]`).

## How To Reproduce

1. Run the agent so `~/.teleton/memory.db` and its `-wal`/`-shm` sidecars exist.
2. Restart (triggers `hardenExistingPermissions`).
3. `stat -c '%a' ~/.teleton/memory.db-wal` → still `644` (world/group-readable);
   `teleton.db*` do not exist.

## Impact

Sensitive databases and their WAL/SHM sidecars remain readable by other local
accounts despite a hardening routine that appears to cover them. The fix
silently no-ops for the files that matter.

## Proposed Fix

- Replace the placeholder names with the real DB basenames and enumerate their
  `-wal`/`-shm`/`-journal` sidecars, or glob `*.db*` in `TELETON_ROOT`.
- Include `gramjs_bot_session.txt` and any other session artifacts.
- Source the list from the same `SQLITE_FILES` constant used by backup so it
  cannot drift.

## Regression Test

```typescript
it("hardens the real database files and their wal/shm sidecars", () => {
  // create memory.db, memory.db-wal at 0o644; run hardenExistingPermissions
  // expect each to be 0o600
});
```

## Acceptance Criteria

- [ ] `memory.db`/`deals.db` and their `-wal`/`-shm` sidecars are chmod-ed to
      `0o600` by the hardening pass.
- [ ] The hardened file list is derived from a single shared source of truth.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-006`
- Modules: `src/workspace/harden-permissions.ts`, `src/backup/targets.ts`
