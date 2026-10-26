import { Canvas } from '@react-three/fiber';
import { Container } from '@react-three/uikit';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { Surface } from './Surface.tsx';
import { theme } from './theme.ts';

// Surface is called as a function and the tree it returns is read, as in
// registry.test.tsx: drawing it needs WebGL, which the Playwright render
// checks cover. What is checked is what a viewer sees: a canvas holding the
// themed, bordered panel, with the page inside that panel.

type Props = Readonly<Record<string, unknown>> & { readonly children?: ReactNode };

const page = <Container key="page" />;

function surface(): ReactElement<Props> {
  const tree: ReactNode = Surface({ children: page });
  if (!isValidElement<Props>(tree)) {
    throw new Error('Surface returned no element');
  }
  return tree;
}

// The panel: the canvas's one direct uikit Container.
function panel(canvas: ReactElement<Props>): ReactElement<Props> {
  const panels = Children.toArray(canvas.props.children).filter(
    (child): child is ReactElement<Props> => isValidElement(child) && child.type === Container,
  );
  expect(panels, 'the canvas should hold exactly one uikit panel').toHaveLength(1);
  const [found] = panels;
  if (found === undefined) {
    throw new Error('no panel');
  }
  return found;
}

describe('three Surface', () => {
  it('is an r3f Canvas', () => {
    expect(surface().type).toBe(Canvas);
  });

  it('holds a themed, bordered panel', () => {
    expect(panel(surface()).props).toMatchObject({
      pixelSize: theme.panel.pixelSize,
      width: theme.panel.width,
      height: theme.panel.height,
      backgroundColor: theme.color.panel,
      borderRadius: theme.panel.borderRadius,
      borderWidth: theme.panel.borderWidth,
      borderColor: theme.color.accent,
    });
  });

  it('puts its children inside the panel', () => {
    expect(panel(surface()).props.children).toBe(page);
  });
});
