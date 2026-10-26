# ADR 0005 — React 19.3, within the widened window

**Status:** accepted
**Date:** 2026-09-25
**Supersedes:** the version window in ADR 0004. Its rule, that React is pinned
to whatever every renderer's peer range allows, stands unchanged.

**Port note:** ported from the prototype unchanged apart from this note.
`apps/web/src/react-versions.test.ts` arrives with Phase 3a (#4). `pnpm verify`
was the prototype's gate, build and render checks in one command: here the
gate is `pnpm gate`, and the render checks arrive with Phase 5 (#8).

## Context

ADR 0004 pinned React to `19.2.8` because the three renderers' peer ranges
only overlapped in `[19.2.0, 19.3.0)`: `@react-three/fiber@9.7.0` capped React
below 19.3, and Ink required at least 19.2.0. Its expiry condition was r3f
publishing a version whose range extends past `<19.3`.

That has happened. `npm view @react-three/fiber@9.8.0 peerDependencies`:

```json
{ "react": ">=19 <19.4", "react-dom": ">=19 <19.4", ... }
```

Ink's floor is unchanged (`ink@7.1.1`: `"react": ">=19.2.0"`), so the window is
now `[19.2.0, 19.4.0)`. `react`, `react-dom`, `@types/react` and
`@types/react-dom` 19.3.0 are all published.

Dependabot proposed the move in its `renderer-stack` group (PR #3), but bumped
`react` to 19.3.0 while leaving `react-dom` on 19.2.8. The gate passed, because
no Node-side test renders through `react-dom`. In a browser the web and
desktop targets rendered nothing: React error #527, "Incompatible React
versions", with `react` 19.3.0 and `react-dom` 19.2.8.

## Decision

The catalog moves `react`, `react-dom`, `@types/react` and `@types/react-dom`
to `19.3.0` together, and `@react-three/fiber` to `9.8.0`. A unit test in the
gate (`apps/web/src/react-versions.test.ts`) fails whenever the installed
`react` and `react-dom` versions differ.

## Consequences

The pin sits inside the new window with room for 19.3 patches.
`strictPeerDependencies` still turns a step outside it into an install
failure.

A partial React bump now fails the gate in CI instead of only in a browser.
Renderer-stack Dependabot PRs still need `pnpm verify` locally before
merging: the gate checks that the versions match, but only the browser render
checks show that the targets actually draw.

## Expiry

This window expires on the same terms as ADR 0004's: when r3f's next release
moves its ceiling past `<19.4`, or Ink raises its floor. Moving to React 19.4
means reading both peer ranges again and recording the new window here or in
a successor.
