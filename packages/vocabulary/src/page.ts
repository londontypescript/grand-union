import type { ReactElement } from 'react';
import type { VerticalAlign } from './vertical-align.ts';
import type { Vocabulary } from './vocabulary.ts';

/**
 * The parameters every page is called with. Kept to a single field
 * (`align`) deliberately — the spike's only job is to prove the registry
 * pattern, not to grow a params object.
 */
export interface PageParams {
  readonly align: VerticalAlign;
}

/**
 * A page is a function of the vocabulary, not a component tree bound to
 * one. `ui` is an ordinary argument, so a page cannot reach a component the
 * contract does not name, and the same page function renders through any
 * registry that satisfies `Vocabulary`.
 */
export type Page = (ui: Vocabulary, params: PageParams) => ReactElement;
