import type { ReactElement } from 'react';
import type { QuoteProps } from '@lts/vocabulary';
import { Container, Text } from '@react-three/uikit';
import { theme } from './theme.ts';

export function Quote({ children }: QuoteProps): ReactElement {
  return (
    <Container
      maxWidth="100%"
      borderLeftWidth={3}
      borderColor={theme.color.accent}
      paddingLeft={16}
    >
      <Text fontSize={theme.font.paragraph} color={theme.color.foreground}>
        {children}
      </Text>
    </Container>
  );
}
