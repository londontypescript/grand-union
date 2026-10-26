import type { ReactElement } from 'react';
import type { ParagraphProps } from '@lts/vocabulary';
import { Text } from '@react-three/uikit';
import { theme } from './theme.ts';

// `width="100%"` (rather than an intrinsic content width) is what makes this
// wrap within the panel instead of overflowing it — the r3f analogue of
// `renderer-dom`'s `max-width: 60ch` on `.lts-paragraph`.
export function Paragraph({ children }: ParagraphProps): ReactElement {
  return (
    <Text
      width="100%"
      textAlign="center"
      fontSize={theme.font.paragraph}
      color={theme.color.muted}
      lineHeight="150%"
    >
      {children}
    </Text>
  );
}
