import { VERTICAL_ALIGN, type VerticalAlign } from '@lts/vocabulary';

export interface Region {
  readonly low: number;
  readonly high: number;
}

/**
 * The fraction of a full-height container (0 = its top, 1 = its bottom)
 * that a given {@link VerticalAlign} value's content centre is expected to
 * fall within, with `margin` either side.
 *
 * Derived from the value's *position and `VERTICAL_ALIGN`'s length*, not
 * from the literal string: `'top'` being index 0 of 3 members means
 * "expect the centre in the top third", `'bottom'` being index 2 of 3
 * means "in the bottom third". This is what lets `web.spec.ts` and
 * `scene.spec.ts` iterate `VERTICAL_ALIGN` generically instead of writing
 * one assertion per named value, and keeps working unchanged if the union
 * ever grows past three members.
 */
export function expectedRegion(align: VerticalAlign, margin = 0.08): Region {
  const index = VERTICAL_ALIGN.indexOf(align);
  const count = VERTICAL_ALIGN.length;
  return {
    low: Math.max(0, index / count - margin),
    high: Math.min(1, (index + 1) / count + margin),
  };
}

/**
 * Asserts that content centres, checked in `VERTICAL_ALIGN`'s own declared
 * order, strictly increase (move further down a full-height container each
 * time). That order is top-to-bottom by construction (`['top', 'middle',
 * 'bottom']` — see `packages/vocabulary/src/vertical-align.ts`), so this
 * check alone is equivalent to asserting `centroid(top) < centroid(middle)
 * < centroid(bottom)` without ever naming those values directly: iterating
 * `VERTICAL_ALIGN` in order and feeding each measurement through `check`.
 *
 * It is a second line behind {@link expectedRegion}, not the first: `top`
 * and `bottom` swapped in a renderer's justify map put each value's content
 * in the wrong third, so the region check fails before this one is
 * reached. What only this check catches is a misordering that every region
 * check lets through, such as two neighbouring values whose centres fall
 * in the overlap the region margin allows, the wrong way round; the specs'
 * break-it for it reverses the order they iterate `VERTICAL_ALIGN` in.
 */
export class MonotonicOrder {
  private previous: { readonly align: VerticalAlign; readonly centre: number } | undefined;
  private comparisonCount = 0;

  check(align: VerticalAlign, centre: number): void {
    const previous = this.previous;
    if (previous !== undefined) {
      this.comparisonCount += 1;
      if (!(centre > previous.centre)) {
        throw new Error(
          `expected ${align}'s content centre (${centre.toFixed(3)}) to sit below ` +
            `${previous.align}'s (${previous.centre.toFixed(3)}) — VERTICAL_ALIGN's declared ` +
            'order implies each later member places content further down',
        );
      }
    }
    this.previous = { align, centre };
  }

  /**
   * How many pairwise comparisons {@link check} has made. A caller that
   * iterates `VERTICAL_ALIGN` and calls `check` once per value should see
   * this equal `VERTICAL_ALIGN.length - 1`; asserting that is what catches
   * the ordering check being skipped entirely (e.g. calls silently landing
   * on separate `MonotonicOrder` instances) rather than merely not failing.
   */
  get comparisons(): number {
    return this.comparisonCount;
  }
}
