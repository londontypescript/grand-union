import type { ReactNode } from 'react';
import type {
  DividingLineProps,
  HeaderProps,
  ParagraphProps,
  QuoteProps,
  StackProps,
} from './props.ts';

/**
 * The closed contract every renderer must implement in full and every page
 * may draw from and nothing else. A renderer declares its implementation as
 * `satisfies Vocabulary`, which turns a missing or typo'd component into a
 * compile error — see `@lts/renderer-dom`'s `registry.ts`.
 */
export interface Vocabulary {
  readonly Stack: (props: StackProps) => ReactNode;
  readonly Header: (props: HeaderProps) => ReactNode;
  readonly Paragraph: (props: ParagraphProps) => ReactNode;
  readonly DividingLine: (props: DividingLineProps) => ReactNode;
  readonly Quote: (props: QuoteProps) => ReactNode;
}
