# Design note — how the vocabulary grows

**Status:** under discussion, nothing here is decided
**Date:** 2026-09-20

A record of a planning conversation held after the spike landed, so the
reasoning is not lost before the decisions are made. An ADR supersedes any
part of this the moment that part is actually chosen; until then, treat every
section as a proposal with its costs attached, not as guidance.

The spike proved the mechanism: one vocabulary, four targets, totality
enforced by the compiler. What it did not answer is what happens as the
vocabulary grows past four components — which is the whole question, because
London TypeScript is a learning group and the repo's value is in being worked
on, not in being finished.

## Contribution tiers

The system should meet members at three levels of involvement. Each tier is a
strictly larger commitment, and the one below it stays available.

1. **Write a page from existing primitives.** No architecture to learn. One
   file, composed of `ui.*`, rendered by every target. This is the common case
   and must stay genuinely easy — by the time the repo is public it should ship
   with enough primitives to cover the obvious content (articles, member bios,
   talk listings) without anyone needing tier 2.
2. **Add a primitive.** Add a member to `Vocabulary`, and the compiler names
   every renderer that now has a gap and what each must return. The teaching
   mechanism is the error message: it cannot be skipped, faked or forgotten,
   and it produces a checklist no maintainer had to write.
3. **Write a renderer.** Implement the whole contract for a new target. The
   compiler generates the checklist; the finish line is unambiguous.

Two consequences follow.

**Do not build a `new:primitive` scaffold.** It would make tier 2 faster by
removing exactly the compiler errors that do the teaching.

**A renderer need not be merged here.** A registry is just an object satisfying
`Vocabulary`. A member can publish `@their-name/renderer-plaintext` from their
own repo against the published contract. That is a better ask for an
experienced contributor than "send us a PR", and it is an argument for
publishing `@lts/vocabulary` to npm earlier than `PLAN.md` currently assumes —
today the plan parks publication until a second project needs it.

## Cost grows per primitive, not per page

Worth stating plainly, because it is easy to get backwards. A new page costs
one file and renders everywhere. A new _primitive_ costs one implementation per
renderer. So the multiplier applies to new kinds of content, not to content.

The bet is therefore that the primitive set **saturates**: that after some
number of primitives, pages multiply freely and the vocabulary stops growing.
That is measurable, and worth watching from the first real content — track the
ratio of new pages to new primitives. If the vocabulary settles at roughly a
dozen or fifteen and pages then accumulate without touching it, the per-renderer
cost was a one-off investment amortised across every page anyone ever writes.
If every third page needs a new primitive, it has not saturated, and the
vocabulary is too narrow to describe what members actually want to publish.

## Renderers interpret; the vocabulary carries meaning

The intersection is of **meanings**, not of **capabilities**.

The spike's rule — nothing enters the vocabulary that r3f cannot honour — was
right for layout, where all three renderers share Yoga. Applied to content it
caps the site at what a terminal can draw, which would be the wrong trade: it
makes the least capable renderer the ceiling for everyone.

The alternative is that the vocabulary carries all of a component's data, and
each renderer decides how to present it. An image in a terminal might be
dot-matrix art, or the alt text in a bordered box, or nothing at all — and a
renderer could even decide at runtime, since modern terminals advertise sixel
or Kitty graphics support. None of that belongs in the contract.

What this buys: the vocabulary stays small (which saturation needs), and each
renderer becomes a design artefact in its own right. Two members can implement
`Image` differently and both be correct. For a learning group, the argument
about which is better is the point.

What it costs:

- **Props must be data-complete for the weakest interpretation.** `Image({ src })`
  is unrenderable in a terminal — alt text cannot be invented. The discipline
  moves from "which components exist", which the compiler checks, to "does
  every prop carry enough for every interpretation", which it cannot.
- **Divergence becomes invisible.** Totality is checked; interpretation is not.
  A `Link` that renders its text and silently drops its destination type-checks
  perfectly. This is the behavioural-correspondence gap ADR 0003 admits to, and
  renderer freedom widens it.
- **Renderer-specific props must stay forbidden.** The moment `inkVariant` or
  `showImageIn3D` appears in the contract, platform resolution is back through
  the side door and the vocabulary stops meaning one thing.

## The minimum data contract: the accessibility tree

The proposal that resolves "how much data is enough": **props must be
sufficient to construct the component's accessibility-tree node** — its role,
its accessible name, and any state that role requires.

Why ARIA rather than a house rule:

- Role, name and state is exactly "what does this mean", independent of how it
  is drawn. It is renderer-agnostic by construction.
- It is a real specification. A member learns something that transfers outside
  this repo, which matters for a learning group more than internal consistency
  does.
- It gives a crisp test for data-completeness: can the node be built from the
  props alone? `Image({ src })` fails immediately, which is the right answer.
- A screen reader and a text-only renderer want the same thing. Requiring
  every component to carry enough for a terminal makes the DOM output
  accessible by construction — a better argument for the SSH target than
  novelty is.

**How not to apply it.** No `aria-*` props in the contract. Those are
DOM-flavoured, meaningless to PDF or r3f, and would be renderer-specific props
by another name; the first rule of ARIA is that native semantics beat ARIA
attributes anyway. Instead each component _declares_ its role and where its
accessible name comes from, and its props carry what that role requires:

| Component          | Role                    | Accessible name                  |
| ------------------ | ----------------------- | -------------------------------- |
| `Header`           | heading                 | its children                     |
| `Paragraph`        | paragraph               | its children                     |
| `DividingLine`     | separator               | none                             |
| `Stack`            | presentational grouping | none                             |
| `Link` (proposed)  | link                    | its children, plus a destination |
| `Image` (proposed) | img                     | a required `alt`                 |

The dom renderer emits real semantics, ink speaks the name, PDF prints it, a
plaintext renderer prints that and nothing else.

**Where it stops.** ARIA has concepts with no analogue here — live regions,
focus management, expanded/collapsed state. Those matter only if the vocabulary
grows interactive widgets, and are out of scope until it does.

## Declared degradations

A renderer may drop presentation, and may even drop a component entirely — a
member may want a deliberately austere text-only renderer, and that is a
legitimate thing to build and show off. Styling is not a degradation at all:
colour, weight and spacing already belong to each renderer's `theme.ts`, so a
monochrome renderer is exercising a freedom the design grants it.

What must not happen is a silent gap. The compiler guarantees a renderer
_answers_ for every component; this makes the answer legible:

```ts
type Degradation =
  { kind: 'full' } | { kind: 'substituted'; note: string } | { kind: 'omitted'; note: string };

export const inkDegradations = {
  Image: { kind: 'substituted', note: 'alt text in a bordered box; no sixel' },
} satisfies Degradations; // Partial<Record<keyof Vocabulary, Degradation>>
```

This is disclosure, not permission. It renders into the README as a capability
matrix — renderers against primitives — which doubles as an invitation to add
a column, and gives a vocabulary PR a concrete question to answer per renderer.

## The correspondence test

The strongest consequence of the ARIA proposal: the DOM output's accessibility
tree and the ink output's text should contain the same accessible names, in the
same order.

- Playwright's `toMatchAriaSnapshot` yields the dom tree.
- The ink text snapshots already exist.
- Assert the same names, in sequence, in both.

No pixels, no screenshots, fast and deterministic. It partially closes the gap
ADR 0003 names — until now the only answer was screenshots and human eyes — and
it scales to every future renderer, including one a member publishes
themselves: implement the contract, pass the correspondence check, and the
renderer is demonstrably faithful rather than merely compiling.

It also removes the need for a special rule protecting navigation. A link's
name and destination are part of its node, so preserving the accessibility tree
preserves navigation automatically.

## Next primitives, and the next renderer

The primitives a written article actually needs, in rough order of how much
they will hurt:

- **`Link`** — the first primitive with behaviour rather than appearance. DOM
  has `href`, a terminal has OSC 8 escape sequences or a printed URL, r3f has a
  click raycast. The honest test of whether the vocabulary can carry
  interaction at all.
- **`List`** and **`CodeBlock`** — what a meetup site needs (talks, schedules,
  snippets), and all three current renderers should manage them.
- **A second page**, because the tier-1 promise is "write one file, get every
  target", and that has only ever been proven for a page built alongside the
  system.

**A PDF renderer is the strongest candidate for the fourth target**, because it
produces something the group would actually use: a monthly collection of
member-written articles, emailed to subscribers and printed for the table at
events. `@react-pdf/renderer` lays out with Yoga, so it sits inside the
intersection ADR 0002 describes and the layout vocabulary should port with
little argument — which makes it a weaker falsification test than a non-Yoga
renderer, and a much better product.

Its real contribution is a constraint no current target has: **pagination**.
PDF is the first surface with physical pages, and `align: 'bottom'` has no
obvious meaning across a four-page A4 document. Bottom of which page? That is
likely the first genuine case for a `Surface`-level concern rather than a
vocabulary addition — the distinction ADR 0002 predicted would eventually come
up. It also tests the "theme belongs to the renderer" decision properly, since
print wants dark text on white, the opposite of every screen target.

Running in Node, it can be generated in CI on a schedule, and its render checks
can assert on page count and extracted text rather than pixels.

## Open questions

- Does `Link` force something awkward into the vocabulary? If so, the
  interaction model needs its own ADR before any interactive primitive lands.
- What does `align` mean on a paginated surface?
- When is `@lts/vocabulary` published, given tier 3 depends on it?
- How does the cost of render checks scale as primitives multiply? The
  correspondence test helps; screenshots still do not scale linearly.
- Does the accessibility-tree contract hold for a primitive that is purely
  decorative, where the correct accessible name is none at all?

## What the spike already settled

For contrast, and so this note is not mistaken for reopening them: the registry
pattern (ADR 0001), layout as the Yoga intersection with r3f as arbiter
(ADR 0002), pages as functions of the vocabulary (ADR 0003), and React pinned
by the narrowest renderer (ADR 0004). Nothing in this note requires changing
any of them.
