import type { ReactElement } from 'react';
import type { StackProps, VerticalAlign } from '@lts/vocabulary';
import { Box, type BoxProps } from 'ink';
import { theme } from './theme.ts';
import { useTerminalSize } from './useTerminalSize.ts';

/**
 * Total map from {@link VerticalAlign} to Ink's `justifyContent`. A
 * `satisfies Record<VerticalAlign, ...>` map, never a `switch` — adding a
 * member to `VERTICAL_ALIGN` then fails to compile here until this map is
 * updated. Mirrors `renderer-dom`'s and `renderer-three`'s `Stack.tsx`.
 */
const justifyContent = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
} satisfies Record<VerticalAlign, BoxProps['justifyContent']>;

/**
 * The vocabulary's only layout primitive: a full-height column (`height`
 * from {@link useTerminalSize}, tracking terminal resize) with `align`
 * driving main-axis placement. Content is constrained to a readable measure
 * and centered horizontally, mirroring `renderer-dom`'s `60ch` main and
 * `renderer-three`'s fixed-width panel.
 */
export function Stack({ align, children }: StackProps): ReactElement {
  const { rows, contentWidth } = useTerminalSize();

  return (
    <Box
      flexDirection="column"
      width="100%"
      height={rows}
      alignItems="center"
      justifyContent={justifyContent[align]}
      paddingX={theme.layout.paddingX}
    >
      <Box flexDirection="column" width={contentWidth} alignItems="center" gap={1}>
        {children}
      </Box>
    </Box>
  );
}
