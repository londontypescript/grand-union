# ADR 0001 — Registry over platform resolution

**Status:** accepted
**Date:** 2026-09-19

## Context

Three renderers (`react-dom`, `react-three-fiber`, `ink`) implement one closed
vocabulary of four components (`Stack`, `Header`, `Paragraph`, `DividingLine`).
Something has to wire a page written against the vocabulary to a concrete
implementation per target. This is still a spike: three components, one
layout union, one page.

## Decision

Each renderer exports exactly one registry object — `packages/renderer-dom/src/registry.ts`
and its siblings — built with `satisfies Vocabulary`, and an app imports the
registry for its own target explicitly. Nothing resolves a component by
filename convention or bundler configuration.

**Rejected: `Header.dom.tsx` + Vite's `resolveExtensions`.** Two reasons.
First, implicit fallback is a silent-failure mode: a missing `Header.ink.tsx`
resolves to the generic `Header.tsx` if one exists, or to nothing obvious if
it doesn't — either way it compiles and builds, and ships the wrong output,
or no diagnostic at all. Second, `tsc` has no `resolveExtensions` equivalent,
and `paths` in `tsconfig.json` does not apply to relative imports, so
type-checking each target would need package-specifier indirection or a
per-target `tsconfig.json` just to make the extension resolution visible to
the compiler — machinery whose only job is to route around the fact that the
wiring isn't explicit.

## Consequences

Adding a member to `Vocabulary` breaks every registry that doesn't yet
implement it, at the exact place — `registry.ts` — where a maintainer has to
decide what the new member means for that renderer. `tests/contracts` proves
this by mutating the vocabulary and the registries in memory and asserting on
the compiler's own diagnostics. The four cases and their exact `tsc` output
(from `tests/contracts/src/__snapshots__/contracts.test.ts.snap`, using
`renderer-dom`'s entries — `renderer-ink` and `renderer-three` report the
same shape against their own component types):

**Missing key** (`renderer-dom/missing-key` — deleting `DividingLine` from the registry object):

```
Type '{ Stack: ({ align, children }: StackProps) => ReactElement; Header: ({ children }: HeaderProps) => ReactElement; Paragraph: ({ children }: ParagraphProps) => ReactElement; }' does not satisfy the expected type 'Vocabulary'.
  Property 'DividingLine' is missing in type '{ Stack: ({ align, children }: StackProps) => ReactElement; Header: ({ children }: HeaderProps) => ReactElement; Paragraph: ({ children }: ParagraphProps) => ReactElement; }' but required in type 'Vocabulary'.
```

**Typo'd excess key** (`renderer-dom/excess-key`, TS2561 — `DivdingLine` instead of `DividingLine`):

```
Object literal may only specify known properties, but 'DivdingLine' does not exist in type 'Vocabulary'. Did you mean to write 'DividingLine'?
```

**New `Vocabulary` member** (`renderer-dom/new-vocabulary-member`, TS1360 — adding `Quote` to the contract):

```
Type '{ Stack: ({ align, children }: StackProps) => ReactElement; Header: ({ children }: HeaderProps) => ReactElement; Paragraph: ({ children }: ParagraphProps) => ReactElement; DividingLine: () => ReactElement; }' does not satisfy the expected type 'Vocabulary'.
  Property 'Quote' is missing in type '{ Stack: ({ align, children }: StackProps) => ReactElement; Header: ({ children }: HeaderProps) => ReactElement; Paragraph: ({ children }: ParagraphProps) => ReactElement; DividingLine: () => ReactElement; }' but required in type 'Vocabulary'.
```

**New `VerticalAlign` member** (`renderer-dom/new-vertical-align-member`, TS1360 —
adding `'stretch'` to `VERTICAL_ALIGN`; reported at `Stack.tsx`'s total map, not
at the registry, because that is where the renderer actually decides what
the new member means):

```
Type '{ top: "flex-start"; middle: "center"; bottom: "flex-end"; }' does not satisfy the expected type 'Record<"top" | "middle" | "bottom" | "stretch", JustifyContent | undefined>'.
  Property 'stretch' is missing in type '{ top: "flex-start"; middle: "center"; bottom: "flex-end"; }' but required in type 'Record<"top" | "middle" | "bottom" | "stretch", JustifyContent | undefined>'.
```

**2026-09-25:** making `tests/contracts`'s diagnostic assertions strict
(exactly one diagnostic, not "at least one") showed this mutation also
reports a secondary TS7053 at the total map's index expression — the
`justifyContent` lookup goes implicitly `any` once its key type no longer
covers `'stretch'`. `expectDiagnosticsWithCodes` (`tests/contracts/src/program.ts`)
now allows that one secondary code alongside the primary TS1360.

Judging that output honestly, as UX, since the plan treats the error text
itself as a design surface:

- **Good.** The missing-key and new-member diagnostics both name the exact
  missing property in a second line, after the type mismatch — a
  contributor doesn't have to diff two object types by eye to find what's
  absent. TS2561's "Did you mean to write 'DividingLine'?" is genuine,
  autocorrect-quality UX for the typo case, and costs nothing to get.
- **Neutral-to-good.** The `VerticalAlign` diagnostic surfaces at
  `Stack.tsx`'s `justifyContent` map, not at some central vocabulary file —
  that is the right place, because that map is where the renderer commits to
  a concrete meaning for the new value.
- **Poor.** TS1360's first line restates the _entire_ inferred object-literal
  type — every existing component's full signature — before naming the one
  property that's actually missing. At four vocabulary members this is
  already a wall of text a contributor has to read past; it will only get
  more noisy as the vocabulary grows, since the restated type grows with it
  while the useful information (the one missing property) does not.

One further property worth recording: `tsc` reports one diagnostic per
affected file per run, not one and then stop. Adding a `Vocabulary` member
and running `tsc` once surfaces every registry's gap simultaneously — the
full blast radius of a vocabulary change is visible in a single invocation,
not discovered by fixing one file, rerunning, and finding the next.

## Expiry

This holds while there are a handful of registries and the vocabulary stays
small enough that TS1360's whole-object-type restatement is merely
noisy rather than genuinely unreadable. Reconsider if: the registry count or
vocabulary size grows enough that the diagnostic wall of text becomes a real
review cost (at which point a purpose-built lint rule or a TypeScript
version with a better `satisfies` mismatch message would be the fix, not
reintroducing implicit resolution); or if TypeScript ships a `satisfies`
diagnostic that reports only the delta instead of the whole shape.
