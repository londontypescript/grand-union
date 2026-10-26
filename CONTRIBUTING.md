# Contributing

## Setup

- Node 24 (`.nvmrc`)
- `corepack enable` (pins the pnpm version from `packageManager` in
  `package.json`)
- `pnpm install`
- `pnpm gate` — temple-bar's gate, the same one CI runs: format, lint,
  typecheck and tests in the root and every workspace package, plus its own
  checks (file length, links, unused code, the setup it installed). Run it
  before you open a PR; CI runs it again regardless.
- `pnpm test:render` — the browser and Electron render checks. They arrive
  with Phase 5 (#8), with a CI job of their own.
- `pnpm screenshots:update` — refreshes the committed screenshots in
  `docs/screenshots` after a layout or theme change. Also Phase 5 (#8).

## How the repo is organised

Read [`docs/architecture.md`](docs/architecture.md) before changing code. In
short: one vocabulary of components (`@lts/vocabulary`), three renderer
registries that each implement it (`@lts/renderer-dom`, `@lts/renderer-three`,
`@lts/renderer-ink`), pages written against the vocabulary alone
(`@lts/pages`), and apps that wire a page to a registry. Dependency direction
is one-way — vocabulary is depended on, never the other way round — and
that's enforced by ESLint's `no-restricted-imports` (`eslint.config.js`), not
just documented.

## Changing the vocabulary

Adding to `Vocabulary` — a new component, a new prop, a new closed-union
member — is deliberate and breaks all three registries at once: that's the
point of `satisfies Vocabulary` and `satisfies Record<Union, …>`. It means a
vocabulary change is not a small PR.

[`docs/adding-a-primitive.md`](docs/adding-a-primitive.md) walks through a
real example, `Quote`, step by step. A vocabulary PR must:

- Implement the change in every renderer (dom, three, ink) in the same PR.
  A vocabulary entry with only one or two renderers implemented doesn't
  compile, and won't be merged partially "to unblock" something else.
- Justify that `react-three-fiber` can honour it. r3f is the least
  layout-capable renderer and is the arbiter of what the vocabulary is
  allowed to contain — if you can't show how uikit/Yoga renders it, the
  proposal doesn't go in, however easy it would be in dom or ink.

If you're proposing a new component or layout option rather than implementing
an agreed one, open a [vocabulary proposal issue](.github/ISSUE_TEMPLATE/vocabulary-proposal.yml)
first so the r3f question gets asked before code is written.

## Architecture Decision Records

Write an ADR when you make a decision that had real alternatives — not for
routine changes. Start from [`docs/adr/0000-template.md`](docs/adr/0000-template.md).
If you're reversing or narrowing an earlier decision, record what changed
about the project (scale, usage, a requirement that didn't exist before) that
ended it — that's what stops the next contributor quietly reverting your
reversal.

## Provenance policy

We don't police tools, AI or otherwise. A "no AI" rule would be the purest
possible line to draw and also the least real one: it's unverifiable across
a 1100-member community, unenforceable once a PR lands, and violated by the
first autocomplete suggestion anyone accepts. So that's not the policy.

Instead:

- **You are the author, and you answer for every line.** Whatever produced
  the diff — your own typing, an LLM, a codemod — the PR is yours. If a
  reviewer asks why a line is there, "the tool wrote it" is not an answer.
- **The types and the gate are the guarantee, and they're an honest one.**
  The type system proves _totality_: every vocabulary component exists in
  every renderer, every closed union is handled everywhere. It cannot prove
  _behavioural correspondence_ — a component can satisfy its contract and
  render nothing. That's a narrower, separate claim, which is why
  `tests/render` (Phase 5, #8) exists alongside the type checks rather than
  instead of them. Know which claim you're relying on.
- **Don't submit code you can't explain in review.** If you can't walk
  through why a change works, it isn't ready, regardless of how it was
  produced.
- **Disclose substantial generated content in the PR description.** The pull
  request template has a checkbox for this. It isn't a confession — it's
  review context, telling a reviewer where to look more carefully.
- **Licensing.** You must have the right to submit what you're submitting
  under this repo's MIT licence. That's on you to know, whatever tool
  produced the text.
