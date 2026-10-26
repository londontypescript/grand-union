# Architecture

One closed vocabulary of semantic components, rendered by three React
renderers — `react-dom`, `react-three-fiber` and `ink` (served over SSH) — plus
an Electron shell around the dom build. This repository's issues say why and
what comes next; this file says what exists and how it fits together.
Decisions with alternatives live in `docs/adr/`.

The code is being ported here from a prototype, one phase per issue: the
vocabulary, pages, renderer-dom and contract tests in Phase 2 (#3), the web
app in 3a (#4), renderer-ink and the terminal in 3b (#5), renderer-three and
the scene in 3c (#6), the desktop shell in 4 (#7) and the render checks in 5
(#8). Until its phase merges, a part described here, and the check that
covers it, exists only in the prototype.

## Workspace

```text
packages/
  vocabulary/       @lts/vocabulary      the contract: component props, layout unions, Vocabulary, Page
  pages/            @lts/pages           page definitions, written against Vocabulary only
  renderer-dom/     @lts/renderer-dom    registry for react-dom
  renderer-three/   @lts/renderer-three  registry for react-three-fiber, plus its Surface
  renderer-ink/     @lts/renderer-ink    registry for ink
apps/
  web/              @lts/web             Vite build of the dom target
  scene/            @lts/scene           Vite build of the r3f target
  terminal/         @lts/terminal        SSH server rendering the ink target per session
  desktop/          @lts/desktop         Electron shell loading the web build
tests/
  contracts/        compiler-API tests proving the registry guarantees
  render/           Playwright checks that each target visibly honours the layout union
```

Packages are **source-only internal packages**: `exports` points at
`src/index.ts`, there is no per-package build, and apps consume source through
their bundler (Vite) or runner (`tsx`). Packages are named by role, never by
product: Electron is `react-dom`, so there is no `web`/`desktop` registry split.

Dependency direction is strict and one-way:

```text
vocabulary  ←  pages
vocabulary  ←  renderer-*          (renderers never import pages)
pages + renderer-*  ←  apps        (the only place a page meets a registry)
```

## The contract — `@lts/vocabulary`

```ts
import type { ReactElement, ReactNode } from 'react';

// Layout: the one closed union. The tuple is the source; the type is derived,
// so runtime iteration (tests, screenshots, arg parsing) cannot drift from it.
export const VERTICAL_ALIGN = ['top', 'middle', 'bottom'] as const;
export type VerticalAlign = (typeof VERTICAL_ALIGN)[number];
export function isVerticalAlign(value: unknown): value is VerticalAlign;

export interface StackProps {
  readonly align: VerticalAlign;
  readonly children: ReactNode;
}
export interface HeaderProps {
  readonly children: string;
}
export interface ParagraphProps {
  readonly children: string;
}
export interface DividingLineProps {
  readonly children?: never;
}
export interface QuoteProps {
  readonly children: string;
}

export interface Vocabulary {
  readonly Stack: (props: StackProps) => ReactNode;
  readonly Header: (props: HeaderProps) => ReactNode;
  readonly Paragraph: (props: ParagraphProps) => ReactNode;
  readonly DividingLine: (props: DividingLineProps) => ReactNode;
  readonly Quote: (props: QuoteProps) => ReactNode;
}

export interface PageParams {
  readonly align: VerticalAlign;
}
export type Page = (ui: Vocabulary, params: PageParams) => ReactElement;
```

Rules the contract encodes:

- **Text leaves take `string`, not `ReactNode`.** r3f and ink both need a plain
  string to lay text out; `ReactNode` would let a page pass something one
  renderer cannot draw.
- **`Stack` is the only layout primitive, and `align` its only layout prop.**
  Main-axis placement of a full-height column: `top | middle | bottom`. Spacing,
  colour and type scale are renderer decisions, not vocabulary.
- **Nothing enters the vocabulary that r3f cannot honour.** r3f is the least
  layout-capable renderer and is the arbiter.

## Registries — `@lts/renderer-*`

Each renderer package exports exactly one registry, from `src/registry.ts`:

```ts
export const dom = { Stack, Header, Paragraph, DividingLine, Quote } satisfies Vocabulary;
```

- `satisfies Vocabulary` makes a missing key and a typo'd key compile errors.
- Every closed union is consumed through a total map, never a `switch`:
  ```ts
  const justify = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }
    satisfies Record<VerticalAlign, CSSProperties['justifyContent']>;
  ```
  Adding a member to `VERTICAL_ALIGN` then fails to compile in every renderer.
- Visual tokens (colour, spacing, type scale) live in each renderer's own
  theme: CSS custom properties in `packages/renderer-dom/src/styles.css` for
  dom, `theme.ts` for three and ink. They are deliberately not shared yet.

**Styling is not vocabulary.** `align` is the only layout fact a page states;
everything else about how a component looks — colour, spacing, type scale,
and text alignment — is each renderer's own decision, and no test compares
targets on it. Ink left-aligns wrapped paragraph text because Ink has no
`text-align` concept, while dom and three centre it; this is a deliberate
choice by the project owner, not a gap to close.

Per renderer:

|       | Stack                                                         | Header / Paragraph       | DividingLine          | Quote                                       |
| ----- | ------------------------------------------------------------- | ------------------------ | --------------------- | ------------------------------------------- |
| dom   | `<main>` flex column, `min-height: 100dvh`                    | `<h1>` / `<p>`           | `<hr>`                | `<blockquote>`, accent left border          |
| three | Yoga container (`@react-three/uikit`) of fixed height         | uikit `Text`             | 1-unit-high container | container with a left border around `Text`  |
| ink   | `<Box flexDirection="column" height={rows}>`, tracking resize | `<Text bold>` / `<Text>` | `─` repeated to width | `<Box>` with a left border, `<Text italic>` |

Ink wraps text without trimming, so its text leaves strip the space a line
break can leave at the start of a wrapped line (`trim-wrapped-line.ts`).

`@lts/renderer-three` also exports `Surface`: the `Canvas`, camera, lighting and
uikit `Root` a registry needs to draw into. The registry stays pure vocabulary;
the surface is the renderer's host.

## Pages — `@lts/pages`

A page is a **function of the vocabulary**, not a component tree bound to one:

```tsx
export const home: Page = (ui, { align }) => (
  <ui.Stack align={align}>
    <ui.Header>London TypeScript</ui.Header>
    ...
  </ui.Stack>
);
```

No React context, no runtime lookup: the registry is an argument, so a page
cannot reach a component the contract does not name. `@lts/pages` depends only
on `@lts/vocabulary` and `react` types.

**Where types stop.** `Stack`'s `children: ReactNode` would still accept
`<div>` or `<mesh>` — TypeScript gives every JSX element the same type, so no
signature can reject an intrinsic element. That hole is closed by lint instead:
ESLint forbids intrinsic (lowercase) JSX elements in `packages/pages` (from
Phase 2, #3). Types prove _totality_ (every component exists everywhere);
they cannot prove _behavioural correspondence_ (a component can type-check
and render nothing). That is what `tests/render` is for.

## Apps

Each app does three things: read `align` (URL `?align=` for web and scene,
`--align=` for `local.tsx`, the `ALIGN` env var for the SSH server; validated
with `isVerticalAlign`, default `middle`), call `home(registry, { align })`,
and mount the result on its renderer.

- **web** — Vite, `base: './'` so `dist/`'s asset references stay relative —
  relocatable across a plain web origin, `vite preview` in `tests/render`,
  and the custom scheme `desktop` serves it under (see below).
- **scene** — Vite; the page floats on a panel in a 3D scene with gentle orbit.
- **terminal** — `ssh2` server on port `2222` (`PORT`). Accepts any client
  (read-only public site). `create-server.ts` owns the TCP listener and hands
  each socket to ssh2 via `injectSocket`, so it can bound what an
  unauthenticated client holds: at most 256 connections, 10 s to finish the
  handshake, 30 s without an open shell (re-armed when the last shell ends),
  2 session channels per connection, 64 concurrent shells, and a 10-minute
  idle timeout per shell. Host key generated on first run into
  `apps/terminal/.data/` (gitignored), retried until ssh2 can parse it. Each
  shell gets its own ink instance bound to the channel, sized from `pty-req`,
  resized on `window-change`, with `\n` written as `\r\n` since there is no
  server-side pty; `q` or `Ctrl-C` ends it. `pnpm dev:terminal:local` (from
  Phase 3b, #5) renders straight to the current terminal without SSH.
  `server.ts` catches SIGINT/SIGTERM and calls `createServer`'s
  `shutdown()`: it stops accepting
  connections, ends every open shell through its own `endSession` (the same
  goodbye/exit/cleanup `q` already runs) and every shell-less connection
  directly, then waits for sockets to close or a 5 s deadline, destroying
  whatever is left, before the process exits 0 — a second signal mid-shutdown
  exits 1 immediately.
- **desktop** — Electron main process, `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`, no preload. In dev
  (`LTS_WEB_URL` set), it `loadURL`s the web dev server directly. In
  production it serves `apps/web/dist` itself, over a registered `app://`
  scheme (`app://web/...`) rather than `loadFile`-ing `index.html` as a
  `file://` URL: Chromium fetches an ES module `<script type="module">` —
  exactly what `@lts/web`'s build emits — in CORS mode even for a same-page
  request, and `file://` has no origin to satisfy that against, so the
  module script fails to load. A "standard, secure" custom scheme gives the
  page a real, non-opaque origin (`app://web`) instead, so the module script
  loads normally; this needed no change to `@lts/web`'s own build or its
  plain-browser output. That real origin also lets `will-navigate` be
  policed by an actual origin check, rather than an unconditional deny (the
  only option `file://`'s opaque origin would have allowed). Packaging is
  deferred.

## Verification

| Claim                                                           | Where it is checked                                                                         | Arrives in   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------ |
| Missing registry key fails to compile                           | `tests/contracts` (compiler API, mutated in memory)                                         | Phase 2, #3  |
| New `Vocabulary` entry fails every registry                     | `tests/contracts`                                                                           | Phase 2, #3  |
| New `VerticalAlign` member fails every total map                | `tests/contracts`                                                                           | Phase 2, #3  |
| Pages use vocabulary only                                       | ESLint rule on `packages/pages`                                                             | Phase 2, #3  |
| Package dependency direction is one-way                         | ESLint `no-restricted-imports`, one block per directory (`eslint.config.js`)                | Phase 2, #3  |
| dom / three honour each `align` value                           | `tests/render` — layout measured, screenshot saved per value                                | Phase 5, #8  |
| ink honours each `align` value                                  | `apps/terminal/src/home.test.tsx` — 80×24 text snapshots per value                          | Phase 3b, #5 |
| The real SSH path renders and resizes correctly                 | `apps/terminal/src/ssh-render.test.ts` — real SSH client, screen read via `@xterm/headless` | Phase 3b, #5 |
| The SSH server's connection and session limits hold             | `apps/terminal/src/ssh-limits.test.ts`                                                      | Phase 3b, #5 |
| `shutdown()` ends every session gracefully, within its deadline | `apps/terminal/src/ssh-shutdown.test.ts`                                                    | Phase 3b, #5 |
| Electron loads the page                                         | `tests/render` via Playwright's Electron launcher                                           | Phase 5, #8  |
| No `_`-prefixed member access as `obj._x` or `obj['_x']`        | ESLint `no-restricted-syntax` on `apps/` and `packages/` (`eslint.config.js`)               | Phase 1, #2  |

The private-member rule matches exactly those two spellings. A
template-literal key (``obj[`_x`]``) or destructuring (`const { _x } = obj`)
gets past it, and it flags an object's own `_`-prefixed members as well as
another library's: private state of our own belongs in `#private` fields.

`pnpm gate` (temple-bar's gate) is the single gate, run identically locally
and in CI: format, lint, typecheck and tests in the root and every workspace
package (unit and contract tests, the SSH end-to-end tests included), plus
temple-bar's own checks, file length among them. The browser render checks
(`pnpm test:render`) run in a CI job of their own from Phase 5 (#8), required
once it has passed on `main`.
Screenshots default to a gitignored directory under
`tests/render/test-results`; the committed set in `docs/screenshots` is
refreshed on purpose with `pnpm screenshots:update`.
