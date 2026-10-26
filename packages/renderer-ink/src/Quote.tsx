import type { ReactElement } from 'react';
import type { QuoteProps } from '@lts/vocabulary';
import { Box, Text, Transform } from 'ink';
import { trimWrappedLine } from './trim-wrapped-line.ts';
import { theme } from './theme.ts';

export function Quote({ children }: QuoteProps): ReactElement {
  return (
    <Box
      borderStyle="single"
      borderLeft
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderColor={theme.color.accent}
      paddingLeft={1}
    >
      <Transform transform={trimWrappedLine}>
        <Text italic wrap="wrap">
          {children}
        </Text>
      </Transform>
    </Box>
  );
}
