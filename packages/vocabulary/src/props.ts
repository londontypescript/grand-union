import type { ReactNode } from 'react';
import type { VerticalAlign } from './vertical-align.ts';

/**
 * Props for `Stack`, the vocabulary's only layout primitive: a full-height
 * column whose children are placed along the main axis by `align`.
 */
export interface StackProps {
  readonly align: VerticalAlign;
  readonly children: ReactNode;
}

/**
 * Props for `Header`. Text leaves take `string`, not `ReactNode` — r3f and
 * Ink both need a plain string to lay text out, and `ReactNode` would let a
 * page pass markup one renderer cannot draw.
 */
export interface HeaderProps {
  readonly children: string;
}

/**
 * Props for `Paragraph`. See {@link HeaderProps} for why this is `string`,
 * not `ReactNode`.
 */
export interface ParagraphProps {
  readonly children: string;
}

/**
 * Props for `DividingLine`. A leaf with no content: `children?: never` makes
 * `<ui.DividingLine>text</ui.DividingLine>` a compile error rather than
 * something a renderer silently drops.
 */
export interface DividingLineProps {
  readonly children?: never;
}

/** Props for `Quote`: a quoted passage. Text leaves take `string`. */
export interface QuoteProps {
  readonly children: string;
}
