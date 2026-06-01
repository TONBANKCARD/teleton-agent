# V4 Full Logic Audit Work Folder (Issue #521)

This folder contains the V4 audit workspace for
[`#521`](https://github.com/xlabtg/teleton-agent/issues/521) ("We need to check
all the logic"). It follows the format established by the prior audit folders
(`improvements/work`, `work2`, `work3`): one report, one reproducible record per
confirmed defect, and a structural validation script.

## Scope

The audit reviewed the subsystems that handle untrusted input, money, host
capabilities, and persistent state, on commit `5ad0d0f` (current `main` =
`2d53385`, release 0.8.23):

- exec sandbox (`exec_run` / `exec_install` / `exec_service`)
- plugin and MCP loaders (DB isolation, server config)
- WebUI Management API (config import/export, MCP route)
- workflow / pipeline / autonomous executors and scheduler
- TON and gift payment verification (core + SDK)
- memory / RAG storage (vector dimensions, search, scoring)
- Groq STT/TTS providers

Findings already captured in earlier audits (`#400`–`#404`, `#447`–`#451`) were
treated as a duplicate baseline and are not re-filed.

## Contents

| File                                       | Purpose                                              |
| ------------------------------------------ | ---------------------------------------------------- |
| [AUDIT_V4_REPORT.md](AUDIT_V4_REPORT.md)   | Issue #521 full audit report, finding index & stages |
| [audit-config.yaml](audit-config.yaml)     | Audit metadata, inspected paths, finding policy      |
| [issues/](issues/)                         | One professional issue template per `medium`+ finding |
| [validation/](validation/)                 | Structural + pattern reproduction checks             |

## Confirmed findings

| ID        | Severity | Category       | Task File                                                                                                              | GitHub Issue | Status      |
| --------- | -------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------ | ----------- |
| WORK4-001 | High     | security       | [WORK4-001](issues/WORK4-001-exec-install-service-shell-injection.md) | [#523](https://github.com/xlabtg/teleton-agent/issues/523) | Created |
| WORK4-002 | High     | security       | [WORK4-002](issues/WORK4-002-plugin-migratefrommaindb-core-table-exfiltration.md) | [#524](https://github.com/xlabtg/teleton-agent/issues/524) | Created |
| WORK4-003 | Medium   | security       | [WORK4-003](issues/WORK4-003-integration-credentials-key-colocated.md) | [#525](https://github.com/xlabtg/teleton-agent/issues/525) | Created |
| WORK4-004 | Medium   | logic          | [WORK4-004](issues/WORK4-004-exec-scope-allowlist-ignored.md) | [#526](https://github.com/xlabtg/teleton-agent/issues/526) | Created |
| WORK4-005 | Medium   | security       | [WORK4-005](issues/WORK4-005-webui-mcp-url-env-unvalidated-ssrf.md) | [#527](https://github.com/xlabtg/teleton-agent/issues/527) | Created |
| WORK4-006 | High     | security       | [WORK4-006](issues/WORK4-006-workflow-call-api-no-ssrf-protection.md) | [#528](https://github.com/xlabtg/teleton-agent/issues/528) | Created |
| WORK4-007 | Medium   | security       | [WORK4-007](issues/WORK4-007-workflow-webhook-secret-timing-unsafe.md) | [#529](https://github.com/xlabtg/teleton-agent/issues/529) | Created |
| WORK4-008 | Medium   | security       | [WORK4-008](issues/WORK4-008-webhook-ssrf-guard-skips-dns.md) | [#530](https://github.com/xlabtg/teleton-agent/issues/530) | Created |
| WORK4-009 | High     | security       | [WORK4-009](issues/WORK4-009-config-import-bypasses-allowlist.md) | [#531](https://github.com/xlabtg/teleton-agent/issues/531) | Created |
| WORK4-010 | High     | reliability    | [WORK4-010](issues/WORK4-010-pipeline-timeout-does-not-stop-primary-agent.md) | [#532](https://github.com/xlabtg/teleton-agent/issues/532) | Created |
| WORK4-011 | Medium   | reliability    | [WORK4-011](issues/WORK4-011-restore-interrupted-tasks-bypasses-cap.md) | [#533](https://github.com/xlabtg/teleton-agent/issues/533) | Created |
| WORK4-012 | Medium   | logic          | [WORK4-012](issues/WORK4-012-autonomous-task-no-default-iteration-cap.md) | [#534](https://github.com/xlabtg/teleton-agent/issues/534) | Created |
| WORK4-013 | High     | logic          | [WORK4-013](issues/WORK4-013-gift-payment-verification-always-fails.md) | [#535](https://github.com/xlabtg/teleton-agent/issues/535) | Created |
| WORK4-014 | Medium   | financial      | [WORK4-014](issues/WORK4-014-sdk-verifypayment-missing-lower-time-bound.md) | [#536](https://github.com/xlabtg/teleton-agent/issues/536) | Created |
| WORK4-015 | High     | data-integrity | [WORK4-015](issues/WORK4-015-hardcoded-vector-dimension.md) | [#537](https://github.com/xlabtg/teleton-agent/issues/537) | Created |
| WORK4-016 | Medium   | logic          | [WORK4-016](issues/WORK4-016-message-search-skips-semantic-vector-store.md) | [#538](https://github.com/xlabtg/teleton-agent/issues/538) | Created |
| WORK4-017 | Medium   | performance    | [WORK4-017](issues/WORK4-017-memory-getstats-forces-full-recalculate.md) | [#539](https://github.com/xlabtg/teleton-agent/issues/539) | Created |
| WORK4-018 | Medium   | security       | [WORK4-018](issues/WORK4-018-groq-stt-tts-raw-error-body-leak.md) | [#540](https://github.com/xlabtg/teleton-agent/issues/540) | Created |

Two additional `low`-severity findings (cron-tick time budget; inline-keyboard
parse_mode) are documented in the report only — see
[AUDIT_V4_REPORT.md §5](AUDIT_V4_REPORT.md#5-low-severity-findings-report-only-not-filed).

All 18 findings have been filed upstream as issues
[#523](https://github.com/xlabtg/teleton-agent/issues/523)–[#540](https://github.com/xlabtg/teleton-agent/issues/540)
(`GitHub Issue` column above; `github-issue` frontmatter field in each task
file). The issue body frontmatter and footer contain the requested labels and
milestone metadata. The automation account used for creation has no triage
rights on the upstream repository, so **maintainers still need to apply the
labels, milestone, and assignment** in GitHub — each issue lists its suggested
labels/milestone in a footer for convenience.

## Validation

```bash
# Structural check: report references every ID, every issue file has the
# required frontmatter fields and section headings.
node improvements/work4/validation/check-artifacts.mjs

# Reproduction check: asserts the audited code patterns still exist on this
# commit (exits non-zero while the findings remain present).
node improvements/work4/validation/reproduce-findings.mjs
```

## Finding format

Each issue file uses the established structure: YAML frontmatter (`title`,
`labels`, `milestone`, `audit-source`, `finding-id`, `severity`, `category`,
`github-issue`) followed by `Problem Description`, `Location`,
`How To Reproduce`, `Impact`, `Proposed Fix`, `Regression Test`,
`Acceptance Criteria`, and `Related Artifacts`.
