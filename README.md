# grand-union

One vocabulary of semantic components, rendered by three React renderers —
`react-dom`, `react-three-fiber`, and `ink` served over SSH — plus an
Electron shell wrapping the dom build.

This is [London TypeScript](https://github.com/londontypescript)'s first
public repository.

## Why

For a room of TypeScript developers, the architecture and type design are
the product, not the page content. So the page you'll see live is throwaway:
a `Header`, a `Paragraph`, a `DividingLine`, a `Quote`, nothing more. What's real is
that the same page definition drives a browser page, a 3D scene, and a
terminal over SSH from one closed contract — and that adding to that
contract is a compile error everywhere it isn't yet implemented.

```ts
// the contract: one place, checked everywhere
export interface Vocabulary {
  readonly Stack: (props: StackProps) => ReactNode;
  readonly Header: (props: HeaderProps) => ReactNode;
  readonly Paragraph: (props: ParagraphProps) => ReactNode;
  readonly DividingLine: (props: DividingLineProps) => ReactNode;
  readonly Quote: (props: QuoteProps) => ReactNode;
}

// each renderer's registry — a missing or typo'd key fails to compile
export const dom = { Stack, Header, Paragraph, DividingLine, Quote } satisfies Vocabulary;

// a page is a function of the vocabulary, not a component tree bound to one
export const home: Page = (ui, { align }) => (
  <ui.Stack align={align}>
    <ui.Header>London TypeScript</ui.Header>
    <ui.Paragraph>A meetup for people who like their types strict.</ui.Paragraph>
    <ui.DividingLine />
  </ui.Stack>
);
```

See [`docs/architecture.md`](docs/architecture.md) for what exists and how
it fits together, and [`docs/adr/`](docs/adr/) for the decisions behind it —
starting with why registries were chosen over platform-extension resolution.

## Status

**Port in progress — throwaway content, proving the system.** The code is
being ported here from an earlier prototype, in reviewed slices, one phase
per issue; this repository's issues and milestones track what's done and
what comes next. Nothing here is the real London TypeScript site yet.

## Quick start

```sh
corepack enable
pnpm install

pnpm gate           # temple-bar's gate: format, lint, typecheck, tests and its own checks
pnpm ready          # the gate, then marks the commit as ready to push
```

Each target's commands arrive with the phase that ports it:

```sh
pnpm dev:web        # react-dom, in a browser
pnpm dev:scene      # react-three-fiber, in a browser
pnpm dev:terminal   # ink over SSH on 127.0.0.1, for local development only — then, in another shell:
pnpm dev:terminal:connect   # = ssh -p 2222 localhost (the resolved port), without host-key prompts
pnpm dev:desktop    # Electron on the web dev server (start pnpm dev:web first)

pnpm test:render    # Playwright: each renderer visibly honours the layout union (after pnpm build)
```

## Adding a primitive

A new component means one entry in `Vocabulary` and one implementation per
renderer; the compiler lists every place that's missing it.
[`docs/adding-a-primitive.md`](docs/adding-a-primitive.md) walks through how
`Quote` was added, file by file.

## Contributing

Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, how the repo is
organised, what changing the vocabulary requires, and the provenance policy
(we don't police tools; you're the author and you answer for every line).
