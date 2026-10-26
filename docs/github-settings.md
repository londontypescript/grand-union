# GitHub settings

Everything in this file is a setting in the GitHub UI (or org-level API),
not a file in this repository — nothing here can be applied from a PR. A
maintainer with admin access needs to set each of these by hand, once,
except the rulesets, which temple-bar's setup creates.

## Rulesets on `main`

temple-bar's setup (`pnpm exec temple-bar init --create-ruleset`, run by a
maintainer) creates them, and `pnpm gate` reads them back from GitHub and
fails when one is missing or weakened:

- **main: pull requests only** — pull requests only, squash merges, linear
  history, signed commits, no force pushes or deletion, and no bypass for
  anyone, repository admins included.
- **Required checks**, in the same ruleset — `temple-bar gate`
  (`.github/workflows/temple-bar-gate.yml`) and `temple-bar pr-title`
  (`.github/workflows/temple-bar-pr-title.yml`), with branches up to date
  before merging, and CodeQL's code scanning results. Setup adds these when
  it is run again once the workflows and a first CodeQL analysis are on
  `main`. The render checks' job joins them from Phase 5 (#8), once it has
  passed on `main`.
- **main: the judge** — requires `temple-bar judge`
  (`.github/workflows/temple-bar-judge.yml`), which refuses a pull request
  that changes the checks themselves. A repository admin may bypass this one
  ruleset, through a pull request only, to merge such a change by hand.

**Verify:** with local git hooks uninstalled (or bypassed), `git push origin
main` directly should be refused by GitHub, not merely discouraged locally.
A PR whose `temple-bar gate` check is failing or pending should show
the merge button disabled.

## Actions: require approval for fork PR workflow runs

Settings → Actions → General → **Fork pull request workflows from outside
collaborators** → set to **Require approval for all outside collaborators**.

Why this one specifically: public repositories get unlimited Actions
minutes. Without this setting, anyone can open a PR from a fork and have CI
run their workflow changes unattended — that's a free compute sink and a
way to exfiltrate whatever a workflow can reach. Requiring approval means a
maintainer looks at the workflow diff before it runs, every time, for every
first-time or flagged contributor.

**Verify:** open a PR from a fork account with no prior approved run and
confirm the Actions run sits in a "waiting for approval" state rather than
running immediately.

## Actions: default workflow permissions

Settings → Actions → General → Workflow permissions → **Read repository
contents permission** (not read/write). temple-bar's workflows already set
read-only `permissions` at the top level, but the org/repo default
should match so a workflow that omits `permissions` doesn't silently get
write access.

**Verify:** the setting page shows "Read repository contents and packages
permissions" selected, not "Read and write permissions".

## Dependabot alerts and security updates

Settings → Code security → enable **Dependabot alerts** and **Dependabot
security updates**. `.github/dependabot.yml` only schedules routine version
updates (monthly); these two settings are what raise an alert and open a
fix PR as soon as an advisory affects a dependency.

**Verify:** for security updates,
`gh api repos/londontypescript/grand-union/automated-security-fixes` answers
HTTP 200 with `{"enabled":true,"paused":false}`. For alerts,
`gh api -i repos/londontypescript/grand-union/vulnerability-alerts` answers
HTTP 204 with no body when they're on, and 404 when they're off.

## Private vulnerability reporting

Settings → Security → enable **Private vulnerability reporting**. This is
what `SECURITY.md` tells people to use instead of a public issue.

**Verify:** the Security tab shows a "Report a vulnerability" button.

## Discussions

Settings → General → Features → enable **Discussions**. `.github/ISSUE_TEMPLATE/config.yml`
links here and disables blank issues, so this needs to exist before that
link resolves to something useful.

**Verify:** a Discussions tab appears on the repository.

## Claim the `@lts` npm org

Packages are named `@lts/*` (see `docs/architecture.md`). Claim the `lts`
scope on npmjs.com under an account or org the maintainer team controls,
before the first package is published from CI (issue #25 decides when) — an
unclaimed scope that someone else
registers first is not recoverable without a dispute.

**Verify:** `npm org ls lts` (or the npmjs.com org page) shows the org and
its members.
