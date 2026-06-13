---
title: "[AUDIT/V6] tg_messages INSERT OR REPLACE corrupts the FTS5 external-content index (orphaned postings, wrong-text search)"
labels: ["bug", "audit-finding-v6", "high", "v3.0-blocker", "data-integrity"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-003"
severity: "high"
category: "data-integrity"
github-issue: "https://github.com/xlabtg/teleton-agent/issues/608"
---

## Problem Description

The Telegram message feed stores rows in `tg_messages` and mirrors their text
into an FTS5 **external-content** table (`content='tg_messages'`,
`content_rowid='rowid'`) kept in sync by `AFTER INSERT/UPDATE/DELETE` triggers.

Rows are written with `INSERT OR REPLACE INTO tg_messages (...)`. With SQLite's
default `recursive_triggers = OFF`, the implicit DELETE performed by
`INSERT OR REPLACE` (when the row's `id TEXT PRIMARY KEY` already exists) **does
not fire the `AFTER DELETE` trigger**, so the old FTS posting is never removed.
The subsequent insert fires `AFTER INSERT` and adds a new posting. Because
`tg_messages` uses a separate auto-increment `rowid` (the PK is `id TEXT`, not
`INTEGER PRIMARY KEY`), the replaced row also gets a **new rowid**, so:

1. The old FTS entry for the previous rowid is orphaned (it points at a rowid
   that no longer exists).
2. FTS `content_rowid` joins now resolve to the wrong / missing base row, so
   search returns mismatched text or misses rows.
3. BM25 statistics are computed over a corrupted index.

This is the classic "don't use INSERT OR REPLACE with FTS5 external content"
trap; it silently degrades RAG/search recall and correctness over time.

## Location

- `src/memory/feed/messages.ts:83` — `INSERT OR REPLACE INTO tg_messages (...)`.
- `src/memory/schema.ts:638` — `id TEXT PRIMARY KEY` (rowid is separate
  autoincrement).
- `src/memory/schema.ts:668-686` — FTS5 `content='tg_messages'`,
  `content_rowid='rowid'`, and the `AFTER INSERT/DELETE/UPDATE` triggers that
  `INSERT OR REPLACE` bypasses.

## How To Reproduce

1. Insert a `tg_messages` row, then upsert the same `id` with changed text via
   `INSERT OR REPLACE`.
2. Run an FTS query (`MATCH`) for a word from the **old** text → it still
   matches, or the returned text no longer corresponds to the joined base row.
3. Query `fts_table('...')` integrity / compare `rowid` sets → orphaned postings.

## Impact

The message search index (a core RAG retrieval surface) progressively corrupts:
stale postings, wrong-text results, and skewed BM25 ranking. There is no error —
it just returns increasingly wrong results.

## Proposed Fix

- Replace `INSERT OR REPLACE` with an explicit `INSERT ... ON CONFLICT(id) DO
  UPDATE SET ...` (UPSERT), which fires the `AFTER UPDATE` trigger and keeps the
  rowid stable, OR
- Make `tg_messages` use `INTEGER PRIMARY KEY` semantics / delete-then-insert
  inside one transaction so the DELETE trigger fires, OR
- Enable `PRAGMA recursive_triggers = ON` and verify the delete trigger fires.
- Add a one-time `INSERT INTO tg_messages_fts(tg_messages_fts) VALUES('rebuild')`
  migration to repair existing indexes.

## Regression Test

```typescript
it("upserting a message keeps FTS in sync (no orphan, correct text)", () => {
  insertMessage({ id: "m1", text: "alpha" });
  insertMessage({ id: "m1", text: "beta" });        // upsert
  expect(search("alpha")).toHaveLength(0);
  expect(search("beta").map((r) => r.id)).toEqual(["m1"]);
});
```

## Acceptance Criteria

- [ ] Upserting a message never leaves orphaned FTS postings.
- [ ] FTS results always join to the correct base-row text.
- [ ] A rebuild/migration repairs already-corrupted indexes.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-003`
- Modules: `src/memory/feed/messages.ts`, `src/memory/schema.ts`
