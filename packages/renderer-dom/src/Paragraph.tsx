import type { ReactElement } from 'react';
import type { ParagraphProps } from '@lts/vocabulary';

export function Paragraph({ children }: ParagraphProps): ReactElement {
  return <p className="lts-paragraph">{children}</p>;
}
