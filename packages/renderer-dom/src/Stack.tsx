import type { CSSProperties, ReactElement } from 'react';
import type { StackProps, VerticalAlign } from '@lts/vocabulary';

/**
 * Total map from {@link VerticalAlign} to CSS `justify-content`. A `satisfies
 * Record<VerticalAlign, ...>` map, never a `switch` — adding a member to
 * `VERTICAL_ALIGN` then fails to compile here until this map is updated.
 */
const justify = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
} satisfies Record<VerticalAlign, CSSProperties['justifyContent']>;

export function Stack({ align, children }: StackProps): ReactElement {
  return (
    <main className="lts-stack" style={{ justifyContent: justify[align] }}>
      {children}
    </main>
  );
}
