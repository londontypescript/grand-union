import type { ReactElement } from 'react';
import type { ParagraphProps } from '@lts/vocabulary';
import { Text, Transform } from 'ink';
import { trimWrappedLine } from './trim-wrapped-line.ts';

export function Paragraph({ children }: ParagraphProps): ReactElement {
  return (
    <Transform transform={trimWrappedLine}>
      <Text dimColor wrap="wrap">
        {children}
      </Text>
    </Transform>
  );
}
