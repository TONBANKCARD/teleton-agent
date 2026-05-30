# Governance

Teleton Agent uses a lightweight maintainer-led governance model. The goal is
to keep decisions explicit, reviewable, and easy for contributors to follow.

## Maintainers

- Primary maintainer: [Konstantin Diachenko (@konard)](https://github.com/konard)
- Project contact: [@zkproof](https://t.me/zkproof)
- Repository maintainers: GitHub users or teams with write or admin access to
  [xlabtg/teleton-agent](https://github.com/xlabtg/teleton-agent)

Maintainers are responsible for triage, reviews, merges, releases, security
coordination, and Code of Conduct enforcement.

## Decision Making

Routine decisions are made in issues and pull requests. Maintainers seek rough
consensus, but a maintainer may make the final call when a decision is blocking
progress or when the change affects security, release quality, or maintenance
cost.

For substantial changes, maintainers may ask for an RFC before implementation.
Substantial changes include new public APIs, config schema changes, database
migrations, plugin SDK changes, release process changes, or behavior that affects
operator security.

## Merge Policy

- Pull requests target `main`.
- PRs should be focused and reviewable.
- Behavior changes should include tests or a clear reason tests are not useful.
- User-facing changes should update documentation.
- CI must pass before merge unless a maintainer explicitly documents why a
  failing check is unrelated or temporarily waived.
- Maintainers use squash merge by default to keep `main` readable.

## Release Cadence

Releases are automated with release-please. Conventional Commit messages drive
version selection and changelog generation. The project does not commit to a
fixed release calendar; maintainers cut releases when enough verified changes
have accumulated or when a security or reliability fix needs to ship quickly.

## RFC Process

1. Open a GitHub issue describing the problem, goals, non-goals, proposed
   design, alternatives, and compatibility risks.
2. Label or title it as an RFC when maintainers agree it needs design review.
3. Discuss tradeoffs in the issue or a linked GitHub Discussion.
4. Wait for maintainer acceptance before starting a large implementation.
5. Keep the final PR linked to the accepted RFC.

## Community Spaces

- Questions and troubleshooting: [Q&A Discussions](https://github.com/xlabtg/teleton-agent/discussions/categories/q-a)
- Early ideas: [Ideas Discussions](https://github.com/xlabtg/teleton-agent/discussions/categories/ideas)
- Demos and community work: [Show and Tell](https://github.com/xlabtg/teleton-agent/discussions/categories/show-and-tell)
- Project updates: [Announcements](https://github.com/xlabtg/teleton-agent/discussions/categories/announcements)

## Conduct

All contributors and maintainers must follow the
[Code of Conduct](.github/CODE_OF_CONDUCT.md). Reports are handled by
maintainers with respect for reporter privacy and project safety.
