import type { ReactElement } from 'react';
import type { QuoteProps } from '@lts/vocabulary';

export function Quote({ children }: QuoteProps): ReactElement {
  return <blockquote className="lts-quote">{children}</blockquote>;
}
