# ADR 0004 — React version pinned by the narrowest renderer

**Status:** accepted; version window superseded by
[ADR 0005](0005-react-19-3-within-the-widened-window.md). The rule itself stands.
**Date:** 2026-09-19

## Context

`react-dom`, `react-three-fiber`, and `ink` all render the same React tree,
and `pnpm-workspace.yaml`'s catalog pins exactly one React version
workspace-wide — required so all three renderers share a single React
runtime rather than each bundling (and potentially disagreeing on) their own.
Picking that one version means satisfying every renderer's peer range at
once, not picking whichever is newest.

`npm view @react-three/fiber@9.7.0 peerDependencies` reports:

```json
{ "react": ">=19 <19.3", "react-dom": ">=19 <19.3", ... }
```

`npm view ink@7.1.1 peerDependencies` reports:

```json
{ "react": ">=19.2.0", "@types/react": ">=19.2.0", ... }
```

The intersection of `[19.0.0, 19.3.0)` and `[19.2.0, ∞)` is `[19.2.0, 19.3.0)`
— a five-patch-version-wide window. `pnpm-workspace.yaml`'s catalog pins
`react: 19.2.8` and `react-dom: 19.2.8`, which sits inside that window.
`renderer-dom` (plain `react-dom`) has no meaningfully narrower peer range of
its own here; it is r3f's upper bound and Ink's lower bound that actually
constrain the choice.

## Decision

React is pinned in the catalog to the single version satisfying every
renderer's peer range — currently `19.2.8` — not to "latest" or to whatever
`react-dom` alone would accept. `strictPeerDependencies: true`
(`pnpm-workspace.yaml`) makes a future violation of any renderer's peer range
a hard install failure (`pnpm install` refuses to proceed) rather than a
warning a contributor can miss.

This is the same arbiter logic as ADR 0002's layout vocabulary: there, r3f is
the least layout-capable renderer, so it bounds what the vocabulary can
contain; here, r3f's `<19.3` ceiling and Ink's `>=19.2.0` floor together
leave the narrowest window of the three renderers' peer ranges, so that
window — not any single renderer's own preference — decides the pinned
version.

## Consequences

Bumping React (a patch within `19.2.x`, or a future minor) is safe exactly
as long as the new version stays inside whichever intersection is current;
`strictPeerDependencies` turns "stays inside" from something a contributor
has to check by hand into something `pnpm install` checks for them.
Upgrading past `19.3.0` is not possible at all until `@react-three/fiber`
widens its own peer range — this workspace cannot get ahead of its narrowest
renderer no matter how ready the other two are for a newer React.

## Expiry

This expires when `@react-three/fiber` publishes a version whose peer range
extends past `<19.3` (their next major, or a patch relaxing that ceiling) —
at which point the intersection widens and the pinned version can move.
It also expires, in the other direction, if Ink raises its own floor past
whatever `@react-three/fiber` still allows, which would shrink the
intersection to nothing and force a decision about which renderer to hold
back.
