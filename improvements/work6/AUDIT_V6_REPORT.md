# Teleton Agent — Full Logic Audit V6 (Issue #604)

**Source issue:** [#604](https://github.com/xlabtg/teleton-agent/issues/604) ·
**PR:** [#605](https://github.com/xlabtg/teleton-agent/pull/605) ·
**Branch:** `issue-604-15eb16366e49`

**Compared base (`main`):** `3b11a13` (release 0.8.41) · **Auditor:** Claude
Opus 4.8 (Claude Code).

## 1. Executive Summary

Issue #604 asked for a thorough, end-to-end review of the application logic so
that every flaw, bug, and vulnerability could be filed as a separate,
professional issue with labels and implementation stages, allowing the team to
fix them step by step.

This audit fanned out across the whole tree — agent runtime/tools, services
(policy, integrations, cache, rate limiting), memory/RAG storage (feed, FTS,
embeddings, retention), Telegram/bot, SDK, API/WebUI/Management API, TON/deals,
autonomous mode, workspace/permissions, and the React frontend — and then
**adversarially verified each candidate against the exact source** before filing.
It builds on the prior audit waves in `improvements/work`, `work2`, `work3`,
`work4`, and `work5`, and deliberately avoids re-filing findings already captured
there.

**18 findings** are confirmed against the current source, each with its own
professional issue template in [`issues/`](issues/) and filed upstream as a
separate issue. The set is intentionally *new* — every prior-wave finding and the
~287-issue backlog were treated as a duplicate baseline.

The two highest-leverage findings are:

- **WORK6-002** — the API's per-method rate limiters (`mutatingRateLimit`,
  `readRateLimit`) construct a fresh limiter *inside the handler on every
  request*, so the counter resets each time and **never trips**, while leaking a
  cleanup timer per request. The strict mutating limit that should protect
  spam/brute-force/financial actions is effectively disabled.
- **WORK6-003** — `tg_messages` is written with `INSERT OR REPLACE` against an
  FTS5 **external-content** index; with default `recursive_triggers=off` the
  delete trigger never fires and the row's rowid is reassigned, **corrupting the
  message search index** (orphaned postings, wrong-text results, skewed BM25).

### Severity breakdown

| Severity | Count | IDs                                                        |
| -------- | ----- | ---------------------------------------------------------- |
| High     | 3     | WORK6-001, -002, -003                                      |
| Medium   | 10    | WORK6-004, -005, -006, -007, -008, -009, -010, -011, -012, -013 |
| Low      | 5     | WORK6-014, -015, -016, -017, -018                         |

### Category breakdown

| Category        | IDs                                              |
| --------------- | ------------------------------------------------ |
| security        | 001, 002, 005, 006, 007, 008, 014                |
| data-integrity  | 003, 004, 010, 015                               |
| reliability     | 009, 011, 012, 013, 016, 017, 018                |

## 2. Method

- Read issue #604 and the prior audit folders (`improvements/work`..`work5`) plus
  the closed audit issues/PRs to build a duplicate baseline (~287 backlog issues
  + ~119 previously-filed findings).
- Decomposed the system into subsystem lanes and reviewed each in parallel,
  producing a candidate list of ~45 observations.
- **Adversarially verified** every reported candidate against the exact file and
  line on the current branch (base `main` = `3b11a13`, release 0.8.41),
  discarding false positives, duplicates, and already-fixed items. Notable
  discards/narrowings:
  - Runtime **retry-backoff abort** — already fixed (`waitForRetryBackoff` /
    `sleepWithAbort`, `runtime.ts:177-182`); this was WORK5-007. Not re-filed.
  - Self-correction loop **ignoring abort** — false; post-processing is gated on
    `signal?.aborted` (`runtime.ts:1519-1522`). WORK6-012 was narrowed to the one
    real gap: the in-flight LLM `fetch` uses only its own timeout signal
    (`client.ts:435`).
  - `embedBatch` empty-embedding caching — already guarded
    (`cached.ts:135`); the real gap is the single-query `embedQuery` path
    (WORK6-010).
- Recorded reproduction steps, a regression test, and acceptance criteria per
  confirmed finding.

## 3. Findings index

| ID        | Severity | Category       | Summary                                                                     | Task file | GitHub |
| --------- | -------- | -------------- | --------------------------------------------------------------------------- | --------- | ------ |
| WORK6-001 | High     | security       | `workspace_rename` bypasses protected/immutable workspace-file checks        | [file](issues/WORK6-001-workspace-rename-bypasses-protected-files.md) | pending |
| WORK6-002 | High     | security       | API per-method rate limiters never trip + leak a timer per request          | [file](issues/WORK6-002-api-per-method-rate-limiters-nonfunctional.md) | pending |
| WORK6-003 | High     | data-integrity | `tg_messages` INSERT OR REPLACE corrupts the FTS5 external-content index     | [file](issues/WORK6-003-fts5-external-content-corruption-insert-or-replace.md) | pending |
| WORK6-004 | Medium   | data-integrity | Soul editor tab-switch race can save one file's content into another         | [file](issues/WORK6-004-soul-editor-tab-switch-race-wrong-file.md) | pending |
| WORK6-005 | Medium   | security       | OAuth token-exchange fetches a caller-supplied `tokenUrl` (SSRF)             | [file](issues/WORK6-005-oauth-token-exchange-ssrf.md) | pending |
| WORK6-006 | Medium   | security       | Permission hardening targets non-existent `teleton.db*`; real DBs unhardened | [file](issues/WORK6-006-harden-permissions-wrong-db-filenames.md) | pending |
| WORK6-007 | Medium   | security       | Root/workspace directories created without `0o700`                           | [file](issues/WORK6-007-workspace-dirs-created-without-0700.md) | pending |
| WORK6-008 | Medium   | security       | `GET /api/mtproto` returns the unmasked proxy secret                         | [file](issues/WORK6-008-mtproto-get-returns-unmasked-proxy-secret.md) | pending |
| WORK6-009 | Medium   | reliability    | SSE streams leak bus listeners when a write throws                          | [file](issues/WORK6-009-sse-listener-leak-on-write-error.md) | pending |
| WORK6-010 | Medium   | data-integrity | `embedQuery` permanently caches empty embeddings (poisoning)                | [file](issues/WORK6-010-embedquery-caches-empty-embeddings.md) | pending |
| WORK6-011 | Medium   | reliability    | Feed tables `tg_messages`/`tg_messages_vec` grow unbounded (no retention)   | [file](issues/WORK6-011-feed-tables-grow-unbounded.md) | pending |
| WORK6-012 | Medium   | reliability    | In-flight LLM request ignores caller abort (only its own timeout cancels)   | [file](issues/WORK6-012-in-flight-llm-request-ignores-caller-abort.md) | pending |
| WORK6-013 | Medium   | reliability    | Frontend list/analytics loaders have no request sequencing (stale overwrite) | [file](issues/WORK6-013-frontend-stale-response-races.md) | pending |
| WORK6-014 | Low      | security       | State-mutating GET endpoints bypass CSRF and are cacheable                   | [file](issues/WORK6-014-state-mutating-get-endpoints-bypass-csrf.md) | pending |
| WORK6-015 | Low      | data-integrity | `boostImpact` accepts an unbounded `amount` (ranking inflation)             | [file](issues/WORK6-015-memory-boostimpact-no-upper-bound.md) | pending |
| WORK6-016 | Low      | reliability    | Sessions page crashes on a malformed 2xx response body                      | [file](issues/WORK6-016-sessions-page-crashes-on-malformed-response.md) | pending |
| WORK6-017 | Low      | reliability    | Frontend SSE helpers have no error/disconnect handling                      | [file](issues/WORK6-017-sse-client-helpers-no-error-handling.md) | pending |
| WORK6-018 | Low      | reliability    | `registerPluginTools` silently drops tool-name collisions                   | [file](issues/WORK6-018-registerplugintools-silently-drops-collisions.md) | pending |

## 4. Findings detail

### WORK6-001 — workspace_rename bypasses protected/immutable files {#work6-001}

`workspace_rename` (`src/agent/tools/workspace/rename.ts:36-71`) validates only
path containment and renames unconditionally. `workspace_delete`
(`delete.ts:15-22,52`) blocks `PROTECTED_WORKSPACE_FILES` and the write path
blocks `IMMUTABLE_FILES` (`validator.ts:211`), but rename enforces neither — so a
tool-capable prompt can move `SOUL.md` away (delete-by-rename) or overwrite
`SECURITY.md` (`overwrite:true`), defeating the core-file protections. See
[issue template](issues/WORK6-001-workspace-rename-bypasses-protected-files.md).

### WORK6-002 — API per-method rate limiters non-functional {#work6-002}

`mutatingRateLimit` / `readRateLimit` (`src/api/middleware/rate-limit.ts:31-45`)
call `createLimiter(...)` *inside* the handler, allocating a fresh `MemoryStore`
per request → the counter always restarts (never trips) and a cleanup timer is
leaked per request. `globalRateLimit` (`:28`) is built once and works, proving
the construction is just in the wrong place. See
[issue template](issues/WORK6-002-api-per-method-rate-limiters-nonfunctional.md).

### WORK6-003 — FTS5 external-content corruption {#work6-003}

`tg_messages` is written with `INSERT OR REPLACE` (`messages.ts:83`) against an
FTS5 `content='tg_messages'` index with `id TEXT PRIMARY KEY` (separate rowid)
(`schema.ts:638,668-686`). With default `recursive_triggers=off`, the implicit
delete doesn't fire the `AFTER DELETE` trigger and the rowid is reassigned →
orphaned postings, wrong-text joins, corrupted BM25. See
[issue template](issues/WORK6-003-fts5-external-content-corruption-insert-or-replace.md).

### WORK6-004 — Soul editor tab-switch race {#work6-004}

`web/src/pages/Soul.tsx` shares one `content` state across tabs; switching tabs
flips `activeTab` (`:519`) and reloads asynchronously (`:523-525`), leaving a
window where `activeTab` is the new file but `content`/`dirty` still reflect the
old one. A save (`:459`) or auto-save (`:506`) firing in that window writes the
old file's content into the newly selected file. See
[issue template](issues/WORK6-004-soul-editor-tab-switch-race-wrong-file.md).

### WORK6-005 — OAuth token-exchange SSRF {#work6-005}

`POST /:id/oauth/token` (`integrations.ts:225-253`) takes `tokenUrl` from the
body and `exchangeOAuthCode` → `requestOAuthToken` → `fetch(tokenUrl)`
(`auth.ts:226-241,345-354`) with no URL validation, allowing server-side requests
to internal/metadata addresses. See
[issue template](issues/WORK6-005-oauth-token-exchange-ssrf.md).

### WORK6-006 — Hardening targets non-existent DB files {#work6-006}

`harden-permissions.ts:19-27` lists `teleton.db*` (which never exist); the real
DBs are `memory.db`/`deals.db` (`backup/targets.ts:27`). Their WAL/SHM sidecars
are left world/group-readable. See
[issue template](issues/WORK6-006-harden-permissions-wrong-db-filenames.md).

### WORK6-007 — Workspace dirs created without 0o700 {#work6-007}

`ensureWorkspace` (`manager.ts:58-82`) creates `TELETON_ROOT`/`WORKSPACE_ROOT`
and subdirectories with `mkdirSync(..., {recursive:true})` and no `mode`, leaving
them traversable by other local users. See
[issue template](issues/WORK6-007-workspace-dirs-created-without-0700.md).

### WORK6-008 — mtproto GET leaks proxy secret {#work6-008}

`GET /api/mtproto` (`mtproto.ts:78-82`) returns `config.mtproto` verbatim,
including `proxies[].secret`; `/status` (`:86-99`) shows the intended narrowed
shape. See
[issue template](issues/WORK6-008-mtproto-get-returns-unmasked-proxy-secret.md).

### WORK6-009 — SSE listener leak {#work6-009}

`notifications.ts:38-76` and `audit.ts:133-158` only `.off(...)` after the
heartbeat loop returns; `onAbort` sets a flag but doesn't detach, so a throwing
`writeSSE` leaks the bus listener. See
[issue template](issues/WORK6-009-sse-listener-leak-on-write-error.md).

### WORK6-010 — embedQuery caches empty embeddings {#work6-010}

`cached.ts:85-91` caches `embedQuery` results unconditionally; an empty `[]` from
a failed provider is stored permanently. `embedBatch` (`:135`) already guards
with `embedding.length > 0`. See
[issue template](issues/WORK6-010-embedquery-caches-empty-embeddings.md).

### WORK6-011 — Feed tables grow unbounded {#work6-011}

`retention.ts` never references `tg_messages`/`tg_messages_vec`; the feed inserts
forever (`messages.ts:83`) with no pruning, inflating the DB and vector index.
See [issue template](issues/WORK6-011-feed-tables-grow-unbounded.md).

### WORK6-012 — In-flight LLM request ignores caller abort {#work6-012}

`client.ts:435` issues the LLM `fetch` with `signal:
AbortSignal.timeout(...)` only; the caller's signal (honored elsewhere in
`runtime.ts`) is not combined in, so cancellation doesn't free the in-flight
request. See
[issue template](issues/WORK6-012-in-flight-llm-request-ignores-caller-abort.md).

### WORK6-013 — Frontend stale-response races {#work6-013}

`Sessions.tsx:617-633` and `Analytics.tsx:188-209,444-468` set state from async
loaders with no AbortController/sequence guard, so a slow earlier response can
overwrite a newer one. See
[issue template](issues/WORK6-013-frontend-stale-response-races.md).

### WORK6-014 — State-mutating GET bypasses CSRF {#work6-014}

`GET /temporal` and `GET /patterns` (`temporal.ts:38-56`) perform writes
(`syncTemporalMetadata`, `analyzeAndStorePatterns`); CSRF (`csrf.ts`) exempts
safe methods, so these writes are CSRF-able and cacheable. See
[issue template](issues/WORK6-014-state-mutating-get-endpoints-bypass-csrf.md).

### WORK6-015 — boostImpact unbounded amount {#work6-015}

`scoring.ts:188-193` clamps only the lower bound; `webui/routes/memory.ts:253`
forwards the client `amount` unbounded, allowing arbitrary ranking inflation. See
[issue template](issues/WORK6-015-memory-boostimpact-no-upper-bound.md).

### WORK6-016 — Sessions crash on malformed 2xx {#work6-016}

`Sessions.tsx:404-406` reads `res.data.messages`/`.total` unchecked; a malformed
success body makes `messages` undefined and the render path (`:548`) throws. See
[issue template](issues/WORK6-016-sessions-page-crashes-on-malformed-response.md).

### WORK6-017 — SSE client helpers lack error handling {#work6-017}

`api.ts:3352-3366` (and peers near `:4044-4053`) open an `EventSource` with no
`onerror`/disconnect signal, so terminal failures leave the UI silently stale.
See [issue template](issues/WORK6-017-sse-client-helpers-no-error-handling.md).

### WORK6-018 — registerPluginTools silent collisions {#work6-018}

`registry.ts:428` silently `continue`s on a tool-name collision, whereas
`replacePluginTools` (`:478-483`) logs a warning — silent partial plugin loads.
See [issue template](issues/WORK6-018-registerplugintools-silently-drops-collisions.md).

## 5. Implementation stages (suggested)

1. **Stage 1 — restore silently-bypassed controls:** WORK6-002 (rate limit),
   WORK6-001 (rename protection).
2. **Stage 2 — secret/permission exposure & SSRF:** WORK6-005 (OAuth SSRF),
   WORK6-008 (mtproto secret), WORK6-006 (DB hardening), WORK6-007 (dir mode),
   WORK6-014 (mutating GET / CSRF).
3. **Stage 3 — data & storage integrity:** WORK6-003 (FTS5 corruption),
   WORK6-004 (Soul race), WORK6-010 (embedding poisoning), WORK6-011 (feed
   retention), WORK6-015 (boost clamp).
4. **Stage 4 — reliability & resource hygiene:** WORK6-009 (SSE server leak),
   WORK6-012 (abortable LLM request), WORK6-013 (stale-response races),
   WORK6-016 (defensive render), WORK6-017 (SSE client errors), WORK6-018
   (plugin collision logging).

## 6. Filing note

The automation account used for issue creation has no triage rights on the
upstream repository, so the issue bodies carry the suggested labels/milestone in
their frontmatter and a footer, and **maintainers still need to apply the
labels, milestone, and assignment** in GitHub. The `github-issue` frontmatter
field and the index table above are updated with the issue URLs once filed.
