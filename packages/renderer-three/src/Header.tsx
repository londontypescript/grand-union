import type { ReactElement } from 'react';
import type { HeaderProps } from '@lts/vocabulary';
import { Text } from '@react-three/uikit';
import { theme } from './theme.ts';

export function Header({ children }: HeaderProps): ReactElement {
  return (
    <Text
      width="100%"
      textAlign="center"
      fontSize={theme.font.header}
      fontWeight="bold"
      color={theme.color.foreground}
    >
      {children}
    </Text>
  );
}
