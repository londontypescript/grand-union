import type { ReactElement } from 'react';
import { Container } from '@react-three/uikit';
import { theme } from './theme.ts';

// `DividingLineProps` carries no fields, so this implementation omits the
// parameter entirely — see `renderer-dom`'s `DividingLine.tsx` for the same
// reasoning.
export function DividingLine(): ReactElement {
  return <Container width="100%" height={2} backgroundColor={theme.color.accent} opacity={0.6} />;
}
