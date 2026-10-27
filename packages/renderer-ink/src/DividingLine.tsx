import type { ReactElement } from 'react';
import { Text } from 'ink';
import { theme } from './theme.ts';
import { useTerminalSize } from './useTerminalSize.ts';

// `DividingLineProps` carries no fields, so this implementation omits the
// parameter entirely — assignable to `(props: DividingLineProps) => ReactNode`
// by ordinary function contravariance, with no unused parameter to name.
// Mirrors `renderer-dom`'s `DividingLine.tsx`.
export function DividingLine(): ReactElement {
  const { contentWidth } = useTerminalSize();
  return <Text color={theme.color.accent}>{'─'.repeat(contentWidth)}</Text>;
}
