import { isVerticalAlign, type VerticalAlign } from '@lts/vocabulary';

const DEFAULT_ALIGN: VerticalAlign = 'middle';

/**
 * Falls back to `middle` when `raw` is `undefined` or not a valid
 * `VerticalAlign` — shared by `local.tsx`'s `--align=<v>` flag and
 * `server.ts`'s `ALIGN` environment variable.
 */
export function resolveAlign(raw: string | undefined): VerticalAlign {
  return isVerticalAlign(raw) ? raw : DEFAULT_ALIGN;
}
