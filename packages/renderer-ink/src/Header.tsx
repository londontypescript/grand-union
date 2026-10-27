import type { ReactElement } from 'react';
import type { HeaderProps } from '@lts/vocabulary';
import { Text, Transform } from 'ink';
import { trimWrappedLine } from './trim-wrapped-line.ts';

export function Header({ children }: HeaderProps): ReactElement {
  return (
    <Transform transform={trimWrappedLine}>
      <Text bold wrap="wrap">
        {children}
      </Text>
    </Transform>
  );
}
