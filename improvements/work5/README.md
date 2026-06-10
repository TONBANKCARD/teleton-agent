# V5 Full Logic Audit Work Folder (Issue #583)

This folder contains the V5 audit workspace for
[`#583`](https://github.com/xlabtg/teleton-agent/issues/583) ("Check via Claude
Fable"). It follows the format established by the prior audit folders
(`improvements/work`, `work2`, `work3`, `work4`): one report, one reproducible
record per confirmed defect, and structural + pattern validation scripts.

## Scope

The audit fanned out across the whole tree and adversarially verified each
candidate on commit `50dbfe8` (current `main` = `908b991`, release 0.8.40):

- agent runtime and tools (retry/backoff, MCP loader)
- services (policy engine, scheduling, caching, metrics, integrations, webhooks)
- memory / RAG storage (retention, vector stores, search)
- Telegram / bot (inline router, rate limiter)
- SDK, API / WebUI (auth middleware, bootstrap)
- TON / deals and autonomous mode (budget gates)
- backup / restore, config, web frontend

Findings already captured in earlier audits (`#252`–`#296`, `#306`–`#329`,
`#400`–`#404`, `#447`–`#451`, `#523`–`#540`) were treated as a duplicate baseline
and are not re-filed.

## Contents

| File                                       | Purpose                                              |
| ------------------------------------------ | ---------------------------------------------------- |
| [AUDIT_V5_REPORT.md](AUDIT_V5_REPORT.md)   | Issue #583 full audit report, finding index & stages |
| [audit-config.yaml](audit-config.yaml)     | Audit metadata, inspected paths, finding policy      |
| [issues/](issues/)                         | One professional issue template per confirmed finding |
| [validation/](validation/)                 | Structural + pattern reproduction checks             |

## Confirmed findings

| ID        | Severity | Category       | Task File                                                                 | GitHub Issue | Status   |
| --------- | -------- | -------------- | ------------------------------------------------------------------------- | ------------ | -------- |
| WORK5-001 | High     | security       | [WORK5-001](issues/WORK5-001-backup-restore-path-traversal.md)            | _to be filed_ | Drafted |
| WORK5-002 | High     | security       | [WORK5-002](issues/WORK5-002-integration-credentials-hardcoded-fallback-key.md) | _to be filed_ | Drafted |
| WORK5-003 | High     | security       | [WORK5-003](issues/WORK5-003-policy-engine-untrusted-regex.md)            | _to be filed_ | Drafted |
| WORK5-004 | High     | security       | [WORK5-004](issues/WORK5-004-mcp-server-url-ssrf-skips-dns.md)            | _to be filed_ | Drafted |
| WORK5-005 | Medium   | security       | [WORK5-005](issues/WORK5-005-autonomous-ton-budget-bypass.md)            | _to be filed_ | Drafted |
| WORK5-006 | Medium   | data-integrity | [WORK5-006](issues/WORK5-006-retention-phantom-remote-vectors.md)        | _to be filed_ | Drafted |
| WORK5-007 | Medium   | reliability    | [WORK5-007](issues/WORK5-007-runtime-retry-backoff-not-abortable.md)     | _to be filed_ | Drafted |
| WORK5-008 | Medium   | reliability    | [WORK5-008](issues/WORK5-008-plugin-inline-rate-limit-not-per-user.md)   | _to be filed_ | Drafted |

Two additional `low`-severity findings (cache FIFO eviction; spoolable client
IP fallback) are documented in the report only — see
[AUDIT_V5_REPORT.md §5](AUDIT_V5_REPORT.md#5-low-severity-findings-report-only-not-filed).

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
node improvements/work5/validation/check-artifacts.mjs

# Reproduction check: asserts the audited code patterns still exist on this
# commit (exits non-zero while the findings remain present).
node improvements/work5/validation/reproduce-findings.mjs
```

## Finding format

Each issue file uses the established structure: YAML frontmatter (`title`,
`labels`, `milestone`, `audit-source`, `finding-id`, `severity`, `category`,
`github-issue`) followed by `Problem Description`, `Location`,
`How To Reproduce`, `Impact`, `Proposed Fix`, `Regression Test`,
`Acceptance Criteria`, and `Related Artifacts`.
