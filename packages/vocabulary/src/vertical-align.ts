/**
 * The closed set of values `Stack`'s `align` prop accepts. A tuple, not an
 * inline union, so runtime code (tests, screenshots, CLI arg parsing) can
 * iterate the same values the type is derived from — they cannot drift
 * apart, because the type *is* derived from this tuple.
 */
export const VERTICAL_ALIGN = ['top', 'middle', 'bottom'] as const;

/**
 * Main-axis placement of a full-height column. The only layout prop in the
 * vocabulary: it is the intersection of what `react-dom` flexbox,
 * `@react-three/uikit` and Ink's Yoga layout can all express — see
 * `docs/adr/0002-layout-vocabulary-is-the-yoga-intersection.md`.
 */
export type VerticalAlign = (typeof VERTICAL_ALIGN)[number];

/**
 * Runtime guard for {@link VerticalAlign}, used wherever an align value
 * arrives untyped — a URL query string (`?align=`) or a CLI flag
 * (`--align`) — so an unrecognised value falls back to the caller's default
 * instead of reaching a renderer.
 */
export function isVerticalAlign(value: unknown): value is VerticalAlign {
  return (VERTICAL_ALIGN as readonly unknown[]).includes(value);
}
