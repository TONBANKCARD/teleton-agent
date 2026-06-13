# V6 Full Logic Audit Work Folder (Issue #604)

This folder contains the V6 audit workspace for
[`#604`](https://github.com/xlabtg/teleton-agent/issues/604) ("Check via
Claude"). It follows the format established by the prior audit folders
(`improvements/work`, `work2`, `work3`, `work4`, `work5`): one report, one
reproducible record per confirmed defect, and structural + pattern validation
scripts.

## Scope

The audit fanned out across the whole tree and adversarially verified each
candidate on commit `9b3fc43` (current `main` = `3b11a13`, release 0.8.41):

- agent runtime and tools (workspace tools, plugin registry, client abort)
- services (rate limiting, integrations / OAuth)
- memory / RAG storage (feed, FTS5 external content, embeddings cache,
  retention, scoring)
- API / WebUI / Management API (mtproto, temporal, notifications, audit SSE,
  CSRF, permission hardening)
- workspace / filesystem permissions
- React frontend (Soul editor, Sessions, Analytics, SSE client helpers)

Findings already captured in earlier audits (`#252`–`#296`, `#306`–`#329`,
`#400`–`#404`, `#447`–`#451`, `#523`–`#540`, `#585`–`#592`) were treated as a
duplicate baseline and are not re-filed.

## Contents

| File                                       | Purpose                                              |
| ------------------------------------------ | ---------------------------------------------------- |
| [AUDIT_V6_REPORT.md](AUDIT_V6_REPORT.md)   | Issue #604 full audit report, finding index & stages |
| [audit-config.yaml](audit-config.yaml)     | Audit metadata, inspected paths, finding policy      |
| [issues/](issues/)                         | One professional issue template per confirmed finding |
| [validation/](validation/)                 | Structural + pattern reproduction checks             |

## Confirmed findings

| ID        | Severity | Category       | Task File                                                                            | GitHub Issue | Status   |
| --------- | -------- | -------------- | ------------------------------------------------------------------------------------ | ------------ | -------- |
| WORK6-001 | High     | security       | [WORK6-001](issues/WORK6-001-workspace-rename-bypasses-protected-files.md)            | [#606](https://github.com/xlabtg/teleton-agent/issues/606) | Created |
| WORK6-002 | High     | security       | [WORK6-002](issues/WORK6-002-api-per-method-rate-limiters-nonfunctional.md)           | [#607](https://github.com/xlabtg/teleton-agent/issues/607) | Created |
| WORK6-003 | High     | data-integrity | [WORK6-003](issues/WORK6-003-fts5-external-content-corruption-insert-or-replace.md)   | [#608](https://github.com/xlabtg/teleton-agent/issues/608) | Created |
| WORK6-004 | Medium   | data-integrity | [WORK6-004](issues/WORK6-004-soul-editor-tab-switch-race-wrong-file.md)               | [#609](https://github.com/xlabtg/teleton-agent/issues/609) | Created |
| WORK6-005 | Medium   | security       | [WORK6-005](issues/WORK6-005-oauth-token-exchange-ssrf.md)                            | [#610](https://github.com/xlabtg/teleton-agent/issues/610) | Created |
| WORK6-006 | Medium   | security       | [WORK6-006](issues/WORK6-006-harden-permissions-wrong-db-filenames.md)                | [#611](https://github.com/xlabtg/teleton-agent/issues/611) | Created |
| WORK6-007 | Medium   | security       | [WORK6-007](issues/WORK6-007-workspace-dirs-created-without-0700.md)                  | [#612](https://github.com/xlabtg/teleton-agent/issues/612) | Created |
| WORK6-008 | Medium   | security       | [WORK6-008](issues/WORK6-008-mtproto-get-returns-unmasked-proxy-secret.md)            | [#613](https://github.com/xlabtg/teleton-agent/issues/613) | Created |
| WORK6-009 | Medium   | reliability    | [WORK6-009](issues/WORK6-009-sse-listener-leak-on-write-error.md)                     | [#614](https://github.com/xlabtg/teleton-agent/issues/614) | Created |
| WORK6-010 | Medium   | data-integrity | [WORK6-010](issues/WORK6-010-embedquery-caches-empty-embeddings.md)                   | [#615](https://github.com/xlabtg/teleton-agent/issues/615) | Created |
| WORK6-011 | Medium   | reliability    | [WORK6-011](issues/WORK6-011-feed-tables-grow-unbounded.md)                           | [#616](https://github.com/xlabtg/teleton-agent/issues/616) | Created |
| WORK6-012 | Medium   | reliability    | [WORK6-012](issues/WORK6-012-in-flight-llm-request-ignores-caller-abort.md)           | [#617](https://github.com/xlabtg/teleton-agent/issues/617) | Created |
| WORK6-013 | Medium   | reliability    | [WORK6-013](issues/WORK6-013-frontend-stale-response-races.md)                        | [#618](https://github.com/xlabtg/teleton-agent/issues/618) | Created |
| WORK6-014 | Low      | security       | [WORK6-014](issues/WORK6-014-state-mutating-get-endpoints-bypass-csrf.md)             | [#619](https://github.com/xlabtg/teleton-agent/issues/619) | Created |
| WORK6-015 | Low      | data-integrity | [WORK6-015](issues/WORK6-015-memory-boostimpact-no-upper-bound.md)                    | [#620](https://github.com/xlabtg/teleton-agent/issues/620) | Created |
| WORK6-016 | Low      | reliability    | [WORK6-016](issues/WORK6-016-sessions-page-crashes-on-malformed-response.md)          | [#621](https://github.com/xlabtg/teleton-agent/issues/621) | Created |
| WORK6-017 | Low      | reliability    | [WORK6-017](issues/WORK6-017-sse-client-helpers-no-error-handling.md)                 | [#622](https://github.com/xlabtg/teleton-agent/issues/622) | Created |
| WORK6-018 | Low      | reliability    | [WORK6-018](issues/WORK6-018-registerplugintools-silently-drops-collisions.md)        | [#623](https://github.com/xlabtg/teleton-agent/issues/623) | Created |

The issue body frontmatter and footer contain the requested labels and milestone
metadata. The automation account used for creation has no triage rights on the
upstream repository, so **maintainers still need to apply the labels, milestone,
and assignment** in GitHub — each issue lists its suggested labels/milestone for
convenience. The `GitHub Issue` column and each file's `github-issue` frontmatter
field are updated with the issue URL once filed.

## Validation

```bash
# Structural check: report references every ID, every issue file has the
# required frontmatter fields and section headings.
node improvements/work6/validation/check-artifacts.mjs

# Reproduction check: asserts the audited code patterns still exist on this
# commit (exits non-zero while the findings remain present).
node improvements/work6/validation/reproduce-findings.mjs
```

## Finding format

Each issue file uses the established structure: YAML frontmatter (`title`,
`labels`, `milestone`, `audit-source`, `finding-id`, `severity`, `category`,
`github-issue`) followed by `Problem Description`, `Location`,
`How To Reproduce`, `Impact`, `Proposed Fix`, `Regression Test`,
`Acceptance Criteria`, and `Related Artifacts`.
