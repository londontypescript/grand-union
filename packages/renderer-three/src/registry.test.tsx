import { Container, Text } from '@react-three/uikit';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { VERTICAL_ALIGN, type VerticalAlign } from '@lts/vocabulary';
import { three } from './registry.ts';
import { theme } from './theme.ts';

// The tests never draw: drawing needs a WebGL canvas, which the Playwright
// render checks cover. Each component is called as a function and the uikit
// element tree it returns is read: the element types, the text a reader
// would see, the theme values it draws with, and where Stack places its
// children.

type Props = Readonly<Record<string, unknown>> & { readonly children?: ReactNode };
type TreeElement = ReactElement<Props>;

function element(node: ReactNode): TreeElement {
  if (!isValidElement<Props>(node)) {
    throw new Error(`expected an element, got ${node === null ? 'null' : typeof node}`);
  }
  return node;
}

// The strings among an element's descendants, in reading order.
function texts(node: ReactNode): string[] {
  const found: string[] = [];
  Children.forEach(node, (child) => {
    if (typeof child === 'string') {
      found.push(child);
    } else if (isValidElement<Props>(child)) {
      found.push(...texts(child.props.children));
    }
  });
  return found;
}

describe('three text leaves', () => {
  it('Header draws its text as bold uikit Text in the header size', () => {
    const header = element(three.Header({ children: 'London TypeScript' }));

    expect(header.type).toBe(Text);
    expect(texts(header)).toEqual(['London TypeScript']);
    expect(header.props).toMatchObject({
      fontSize: theme.font.header,
      fontWeight: 'bold',
      color: theme.color.foreground,
    });
  });

  it('Paragraph draws its text as uikit Text in the paragraph size', () => {
    const paragraph = element(three.Paragraph({ children: 'One vocabulary.' }));

    expect(paragraph.type).toBe(Text);
    expect(texts(paragraph)).toEqual(['One vocabulary.']);
    expect(paragraph.props).toMatchObject({
      fontSize: theme.font.paragraph,
      color: theme.color.muted,
    });
  });

  it('Quote draws its text as uikit Text inside an accent-bordered Container', () => {
    const quote = element(three.Quote({ children: 'Write it once.' }));

    expect(quote.type).toBe(Container);
    expect(quote.props).toMatchObject({ borderColor: theme.color.accent });
    const inner = element(quote.props.children);
    expect(inner.type).toBe(Text);
    expect(texts(quote)).toEqual(['Write it once.']);
  });

  it('DividingLine draws an accent Container with no text', () => {
    const line = element(three.DividingLine());

    expect(line.type).toBe(Container);
    expect(line.props).toMatchObject({ backgroundColor: theme.color.accent });
    expect(texts(line)).toEqual([]);
  });
});

describe('three Stack', () => {
  const justifyContent = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  } satisfies Record<VerticalAlign, string>;

  it.each(VERTICAL_ALIGN)(
    'align=%s is a panel-high column placing its children with the matching justifyContent',
    (align) => {
      const stack = element(
        three.Stack({
          align,
          children: [
            <three.Header key="first">First</three.Header>,
            <three.Paragraph key="second">Second</three.Paragraph>,
          ],
        }),
      );

      expect(stack.type).toBe(Container);
      expect(stack.props).toMatchObject({
        flexDirection: 'column',
        height: theme.panel.height,
        justifyContent: justifyContent[align],
      });
      expect(Children.toArray(stack.props.children).map((child) => element(child).type)).toEqual([
        three.Header,
        three.Paragraph,
      ]);
    },
  );
});
