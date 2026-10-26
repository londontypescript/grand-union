# ADR 0003 — Pages are functions of the vocabulary

**Status:** accepted
**Date:** 2026-09-19

## Context

A page has to be defined once and rendered by three registries without being
rewritten per target. The candidates were: a component tree bound to one
concrete registry via React context (a provider each app wraps its tree in,
with pages reading `useVocabulary()`), per-renderer page imports (`home.dom.tsx`,
`home.ink.tsx`, ...), or a page as an ordinary function that takes the
registry as an argument.

## Decision

```ts
export type Page = (ui: Vocabulary, params: PageParams) => ReactElement;
```

(`packages/vocabulary/src/page.ts`). `packages/pages/src/home.tsx` is exactly
this: `export const home: Page = (ui, { align }) => <ui.Stack align={align}>...</ui.Stack>;`.
An app calls `home(dom, { align })`, `home(three, { align })`, or
`home(ink, { align })` — the registry is passed in like any other argument,
not looked up.

This rules out React context and per-renderer imports for the same reason:
both make "which registry" a runtime fact resolved somewhere other than the
call site. Context needs a provider mounted correctly above every consumer,
and a misconfigured tree fails at render time, not compile time — the
Electron shell forgetting to wrap its tree, say, produces a runtime crash or
a silently missing component, not a type error. Passing `ui` as an argument
makes it impossible to reach a component the type of `ui` doesn't name: no
provider to misconfigure, no runtime lookup that can fail, because there is
no lookup — `ui.Header` is a plain property access on a value the caller
already has.

## Consequences

**Where types stop, honestly.** `StackProps.children: ReactNode` still
type-checks against `<div>onClick=...</div>` or `<mesh />` — every JSX
element has the same TypeScript type regardless of its tag, so no prop
signature can reject an intrinsic element from _inside_ a page. That hole is
closed by lint, not types: `eslint.config.js` scopes a `no-restricted-syntax`
rule to `packages/pages/**/*.{ts,tsx}` matching the selector
`JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^[a-z]/]` — any
lowercase (intrinsic) JSX tag inside a page is a lint error, with a message
pointing at `docs/architecture.md`. This is the enforcement mechanism for
"pages consume `ui.*` only," and it is deliberately not a type-level
guarantee, because none is available.

Types prove **totality** — `satisfies Vocabulary` guarantees every component
exists on every registry (ADR 0001). They cannot prove **behavioural
correspondence** — that `Header.three.tsx` actually draws visible text rather
than, say, an empty `Container` that type-checks perfectly. Two separate,
narrower checks cover that gap instead of a single completeness test:

- `tests/render` (`web.spec.ts`, `scene.spec.ts`, `desktop.spec.ts`) measures
  what `dom`, `three`, and the Electron shell actually paint — bounding boxes
  and, for the WebGL target, rendered pixels — against each `VERTICAL_ALIGN`
  value, and screenshots the result.
- `apps/terminal/src/home.test.tsx` renders `home(ink, { align })`
  through Ink's own `render()` at a fixed 80×24 frame (via a small
  test-only stdout stub, since `ink-testing-library`'s own stub hardcodes a
  different, unconfigurable size) and asserts on the resulting text: the
  header and the SSH hint both appear, a snapshot per `VERTICAL_ALIGN` value,
  and explicit line-position checks (`top`'s content starts on the first
  non-blank line, `bottom`'s ends within two rows of the frame's bottom,
  `middle`'s has blank padding on both sides).

Neither of these is a type-level guarantee, and neither claims to be — they
are the "narrow, separate" rendering check the prototype's plan called for
(in this repository, issue #8), precisely because `Page`'s own type cannot provide it.

## Expiry

Reconsider if pages ever need local state, effects, or other hooks — a page
that is only ever called as `home(ui, params)` and returns a single
`ReactElement` has no lifecycle of its own to hang a hook off; state would
need either a different `Page` shape (e.g. a component, not a plain
function) or lifting state up to the app, which is a materially different
contract than the one this ADR describes. Reconsider too if a renderer ever
needs a genuine per-renderer escape hatch inside a page — content or
structure that only makes sense for one target — since `Page = (ui,
params) => ReactElement` has no way to express "this part is dom-only," and
would need a real design change rather than a workaround.
