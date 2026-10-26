import type { ReactElement } from 'react';
import type { StackProps, VerticalAlign } from '@lts/vocabulary';
import { Container, type ContainerProperties } from '@react-three/uikit';
import { theme } from './theme.ts';

/**
 * Total map from {@link VerticalAlign} to uikit's `justifyContent`. A
 * `satisfies Record<VerticalAlign, ...>` map, never a `switch` — adding a
 * member to `VERTICAL_ALIGN` then fails to compile here until this map is
 * updated. Mirrors `renderer-dom`'s `Stack.tsx`.
 */
const justifyContent = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
} satisfies Record<VerticalAlign, ContainerProperties['justifyContent']>;

/**
 * The vocabulary's only layout primitive, built on uikit's Yoga-backed
 * `Container`: a fixed-height column spanning the full width and height of
 * `Surface`'s panel (`theme.panel.height`, so the two can't drift apart),
 * with `align` driving main-axis placement via {@link justifyContent}.
 */
export function Stack({ align, children }: StackProps): ReactElement {
  return (
    <Container
      width="100%"
      height={theme.panel.height}
      flexDirection="column"
      alignItems="center"
      justifyContent={justifyContent[align]}
      gap={theme.stack.gap}
      padding={theme.stack.padding}
    >
      {children}
    </Container>
  );
}
