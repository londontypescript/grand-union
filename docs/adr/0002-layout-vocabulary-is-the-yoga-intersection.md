# ADR 0002 — The layout vocabulary is the Yoga intersection

**Status:** accepted
**Date:** 2026-09-19

## Context

`Stack` is the vocabulary's only layout primitive, with exactly one layout
prop: `align: VerticalAlign` (`'top' | 'middle' | 'bottom'`). Ink renders
through Yoga. `renderer-three` renders through `@react-three/uikit`, which is
also Yoga-backed. `renderer-dom` renders through CSS flexbox, the model Yoga
implements. So the closed set of layout values the vocabulary can ever offer
is bounded by whichever renderer can express the least — and that renderer,
by construction, is `react-three-fiber`: no native layout engine of its own,
everything staged by hand in world space unless a library does the Yoga work
for it.

The prototype's plan named `@react-three/flex` as that library. By the time
`renderer-three` was actually built, it used `@react-three/uikit` instead.
This ADR records why, and what actually happened when r3f — the intended
arbiter — was built against the real vocabulary.

**`@react-three/flex` is not viable.** `npm view @react-three/flex peerDependencies`
reports:

```json
{ "@react-three/fiber": ">=8.0", "react": "^18.0.0", "three": ">=0.137" }
```

`npm view @react-three/flex time.modified` reports a last publish of
**2022-12-03** — over 3.5 years before this phase. Its `react: ^18.0.0` peer
is incompatible with this workspace's catalog-pinned React `19.2.8`; under
`strictPeerDependencies: true` (`pnpm-workspace.yaml`), installing it
alongside the rest of this workspace fails outright rather than warns.

**`@react-three/uikit` is the replacement**, already the catalog dependency
`renderer-three` is built on (`Surface.tsx`, `Stack.tsx`, `registry.ts`).
`npm view @react-three/uikit peerDependencies` reports `{"@react-three/fiber":
">=8", "react": ">=18"}` — compatible with the catalog's React and r3f
versions, and actively maintained. It is Yoga-backed like `@react-three/flex`
was, so the "layout vocabulary is the Yoga intersection" reasoning is
unchanged; only the library honouring it changed.

## Decision

The layout vocabulary is the subset of flexbox that `react-dom`, Ink's Yoga
layout, and `@react-three/uikit`'s Yoga layout can all express. Nothing
enters `VerticalAlign` — or any future layout union — that r3f cannot honour,
because r3f (via uikit) is the least layout-capable of the three and is
therefore the one that decides what the closed set can contain.

Every renderer consumes the union through a total map —
`satisfies Record<VerticalAlign, Impl>` — never a `switch`, so a new member
fails to compile in every renderer until handled. See
`packages/renderer-three/src/Stack.tsx`'s `justifyContent` map and its
`renderer-dom`/`renderer-ink` equivalents.

## Consequences

**Kill criterion status.** The prototype's plan set the bar at: if a page cannot be
expressed in r3f without the layout vocabulary growing past roughly a dozen
options, the abstraction is wrong. As built: one closed union
(`VerticalAlign`), three members (`top`, `middle`, `bottom`), and nothing
about building the r3f target forced growth beyond that — `uikit`'s Yoga
`Container` expressed every value the dom and ink targets already needed,
with no r3f-specific escape hatch. The kill criterion was not approached.

**Next pressure, observed rather than hypothesised.** `renderer-three`'s
panel has a _finite, fixed_ width (`theme.panel.width: 960`,
`packages/renderer-three/src/theme.ts`) — unlike `renderer-dom`'s `<main>`,
which spans the viewport, or Ink's `Box`, which tracks the terminal's actual
columns. A fixed-width panel is where content width or horizontal alignment
would first become a real question, if the page ever needed it — text that
must wrap narrower, or a layout that isn't simply centred. Per this ADR's own
logic, that pressure should be tried **first as a `Surface` (host) concern —
sizing or composing the panel itself — not as a new vocabulary member**,
since `Surface` already owns exactly this kind of renderer-specific staging
decision (see `docs/architecture.md`'s split between a registry, which stays
pure vocabulary, and its host). Only if that genuinely can't express what's
needed should a new layout union member be considered, and only then subject
to the same Yoga-intersection and r3f-arbiter constraints as `VerticalAlign`.

## Expiry

Reconsider this decision if the kill criterion is actually approached — the
layout vocabulary nearing a dozen options — which would mean r3f's
Yoga-via-uikit model is the wrong fit for what the pages need to express, not
that another option should be added to work around it. Also reconsider if
`@react-three/uikit` itself is abandoned or stops tracking current
`@react-three/fiber`/React versions, the same way `@react-three/flex` did.
