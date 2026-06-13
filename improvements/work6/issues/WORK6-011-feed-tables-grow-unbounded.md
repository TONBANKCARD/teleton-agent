---
title: "[AUDIT/V6] Telegram feed tables (tg_messages / tg_messages_vec) grow unbounded — retention never prunes them"
labels: ["bug", "audit-finding-v6", "medium", "reliability"]
milestone: "v3.0 - Production Ready"
audit-source: "#604"
finding-id: "WORK6-011"
severity: "medium"
category: "reliability"
github-issue: "pending"
---

## Problem Description

The Telegram message feed continuously inserts into `tg_messages` (and its FTS5
and `tg_messages_vec` companions). The memory retention service
(`src/memory/retention.ts`) prunes/archives the memory tables but contains **no
reference to the feed tables** (`tg_messages`, `tg_messages_vec`, the FTS index)
— a `grep` over the module shows none. Nothing else prunes them either.

So every message the agent ever sees is retained forever, along with its stored
embedding vector. On an active account this grows without bound: the SQLite file
and the vector index inflate continuously, slowing every FTS/vector query and the
backup process, and eventually risking disk exhaustion.

## Location

- `src/memory/retention.ts` — no handling of `tg_messages` / `tg_messages_vec` /
  the feed FTS index (verified absent).
- `src/memory/feed/messages.ts:83` — unbounded inserts into `tg_messages`.
- `src/memory/schema.ts:638-686` — feed tables + FTS/vector companions that grow
  alongside.

## How To Reproduce

1. Run the agent against a busy account for an extended period.
2. `SELECT COUNT(*) FROM tg_messages;` grows monotonically with no upper bound.
3. No retention/cron path ever issues a DELETE against the feed tables.

## Impact

Unbounded storage and index growth: degrading query latency, ballooning backups,
and eventual disk pressure on long-lived deployments. There is no configuration
to cap feed history.

## Proposed Fix

- Add a feed-retention pass (age- and/or count-based, configurable) that deletes
  old `tg_messages` rows and their `tg_messages_vec` entries within one
  transaction, keeping the FTS index consistent (see WORK6-003 for the
  trigger/upsert correctness needed here).
- Expose a `feed.retentionDays` / `feed.maxMessages` setting and run it on the
  same schedule as memory retention.

## Regression Test

```typescript
it("feed retention deletes messages older than the configured window", () => {
  seedMessages({ olderThanDays: 90, count: 10 });
  runFeedRetention({ retentionDays: 30 });
  expect(countMessages()).toBe(0);
  expect(countVectors()).toBe(0);
});
```

## Acceptance Criteria

- [ ] Feed tables are pruned by a configurable age/count policy.
- [ ] Pruning removes the row, its vector, and its FTS posting consistently.

## Related Artifacts

- Report: `improvements/work6/AUDIT_V6_REPORT.md#work6-011`
- Modules: `src/memory/retention.ts`, `src/memory/feed/messages.ts`,
  `src/memory/schema.ts`
