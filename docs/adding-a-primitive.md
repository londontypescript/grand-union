# Adding a primitive

A worked example: how `Quote` was added in `b9c5623`, in the prototype this
repository is ported from. The vocabulary, pages and renderer-dom are here;
renderer-ink and the terminal arrive with Phase 3b (#5), renderer-three with
Phase 3c (#6). Once they have, read along in the code. The rules behind each
step are in [`CONTRIBUTING.md`](../CONTRIBUTING.md) § "Changing the vocabulary" and
[`architecture.md`](architecture.md).

A primitive is expensive on purpose: one entry in the contract costs one
implementation per renderer. If you only need new content, write a page
instead. If you're proposing a primitive rather than implementing an agreed
one, open a vocabulary proposal issue first.

## 0. Can r3f honour it?

`react-three-fiber` is the least capable renderer, and it decides what the
vocabulary may contain ([ADR 0002](adr/0002-layout-vocabulary-is-the-yoga-intersection.md)).
A quote is text with a bar beside it, and `@react-three/uikit` can draw both,
so it qualifies. A primitive that only dom or ink could render does not go in.

## 1. Add it to the contract

Three files in `packages/vocabulary/src`:

```ts
// props.ts: text leaves take `string`, never ReactNode
export interface QuoteProps {
  readonly children: string;
}

// vocabulary.ts
export interface Vocabulary {
  // ...
  readonly Quote: (props: QuoteProps) => ReactNode;
}

// index.ts: export QuoteProps alongside the other props types
```

If the primitive has a closed set of options, write them as a tuple and
derive the type from it, like `VERTICAL_ALIGN` in `vertical-align.ts`.

## 2. Let the compiler list the work

```sh
pnpm -r --no-bail run typecheck
```

(The root's own `pnpm typecheck` checks only the root's files; `pnpm gate`
runs every package's too.) Every registry now fails, each at its own
`registry.ts` (shortened here):

```
packages/renderer-ink typecheck: src/registry.ts(14,63): error TS1360: Type '{ Stack: …; Header: …; Paragraph: …; DividingLine: …; }' does not satisfy the expected type 'Vocabulary'.
  Property 'Quote' is missing in type '{ … }' but required in type 'Vocabulary'.
```

`renderer-dom` and `renderer-three` report the same, and so does every app
that passes a registry to a page. That list is your checklist.

## 3. Implement it in each renderer

One file per renderer, then one word in each `registry.ts`:

- **dom**: `packages/renderer-dom/src/Quote.tsx` renders a `<blockquote>`, and
  `.lts-quote` in `styles.css` styles it with the existing tokens
  (`var(--lts-color-accent)`, `var(--lts-measure)`). No new colour literals.
- **three**: `packages/renderer-three/src/Quote.tsx` is a uikit `Container`
  with a left border around a `Text`. With `width="100%"` it spread across
  the panel with its bar on the far left, while the other targets hug the
  text. `maxWidth="100%"` sizes it to the text and caps it at the panel.
- **ink**: `packages/renderer-ink/src/Quote.tsx` is a `Box` with only its left
  border on, around `<Text italic>`. Like every Ink text leaf, it wraps its
  `Text` in `<Transform transform={trimWrappedLine}>`: Ink leaves a space at
  the start of a line that wrapped exactly at one.

```ts
export const ink = { Stack, Header, Paragraph, DividingLine, Quote } satisfies Vocabulary;
```

How it looks is each renderer's decision: styling is not vocabulary.
Colours and sizes come from that renderer's own theme.

## 4. Use it on a page, and look at every target

`packages/pages/src/home.tsx` uses it:

```tsx
<ui.Quote>Write it once, render it everywhere.</ui.Quote>
```

Then look at it in each target:

```sh
pnpm dev:web            # browser, ?align=top|middle|bottom (Phase 3a, #4)
pnpm dev:scene          # 3D (Phase 3c, #6)
pnpm dev:terminal       # then, in another shell: pnpm dev:terminal:connect (Phase 3b, #5)
pnpm dev:desktop        # Electron (Phase 4, #7)
```

Compiling isn't enough. The types prove the primitive exists everywhere, not
that it looks right anywhere.

## 5. Expect these tests to react

The render tests are written for `home`, so changing `home` moves them.
Read every diff before accepting it.

- **Ink snapshots** (`apps/terminal/src/home.test.tsx`, Phase 3b, #5) change
  with the page. Once the new output is right:
  `npx vitest run -u apps/terminal/src/home.test.tsx`.
- **Contract snapshots** (`tests/contracts`) restate each registry's type in
  their error text, so a new member changes them: `npx vitest run -u tests/contracts`.
- **The SSH render test** (`apps/terminal/src/ssh-render.test.ts`, Phase 3b,
  #5) checks the real terminal screen. With `Quote` it caught the
  wrapped-line space above, after the page's new wording happened to wrap at
  exactly that width. Treat a failure there as a rendering bug until proven
  otherwise.
- **Browser render checks** measure content position per `align` value, and
  run in `pnpm test:render` and the render CI job (Phase 5, #8).

## 6. Update the docs

- `docs/architecture.md`: the contract snippet and the per-renderer table.
- `README.md`: the contract snippet.
- An ADR if you chose between real alternatives. `Quote` didn't need one;
  `Link` will.

## 7. Verify, then refresh the screenshots

```sh
pnpm gate                 # format, lint, typecheck, tests and temple-bar's checks
pnpm test:render          # browser render checks (Phase 5, #8)
pnpm screenshots:update   # if the page looks different (Phase 5, #8)
```

## Checklist

- [ ] r3f can honour it
- [ ] `props.ts`, `vocabulary.ts`, `index.ts`
- [ ] one component per renderer, added to each `registry.ts`
- [ ] used on a page and checked in all four targets
- [ ] snapshot diffs read, then updated
- [ ] architecture table and snippets updated; ADR if there was a real choice
- [ ] `pnpm gate` and `pnpm test:render` pass; screenshots refreshed
