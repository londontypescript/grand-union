import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { VERTICAL_ALIGN, type Vocabulary } from '@lts/vocabulary';
import { home } from './home.tsx';

// Stub components that render nothing: the test never renders, it reads the
// element tree `home` returns, so all a stub has to be is a distinct
// function the tree can be checked against.
const fakeUi = {
  Stack: () => null,
  Header: () => null,
  Paragraph: () => null,
  DividingLine: () => null,
  Quote: () => null,
} satisfies Vocabulary;

const stubs: ReadonlySet<unknown> = new Set(Object.values(fakeUi));

type Element = ReactElement<{ readonly children?: ReactNode }>;

// Every element in the tree, depth first, and the strings among their
// children, in reading order.
function walk(node: ReactNode): { elements: Element[]; texts: string[] } {
  const elements: Element[] = [];
  const texts: string[] = [];
  Children.forEach(node, (child) => {
    if (typeof child === 'string') {
      texts.push(child);
    } else if (isValidElement<{ readonly children?: ReactNode }>(child)) {
      elements.push(child);
      const inner = walk(child.props.children);
      elements.push(...inner.elements);
      texts.push(...inner.texts);
    }
  });
  return { elements, texts };
}

describe('home', () => {
  it('is built from vocabulary components only', () => {
    const { elements } = walk(home(fakeUi, { align: 'middle' }));

    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) {
      expect(stubs.has(element.type), `unexpected element type ${String(element.type)}`).toBe(true);
    }
  });

  it('says what the page is for', () => {
    const { texts } = walk(home(fakeUi, { align: 'middle' }));

    expect(texts).toEqual([
      'London TypeScript',
      'One vocabulary, three renderers: this page is defined once against `Stack`, `Header`, `Paragraph`, `DividingLine` and `Quote`, then rendered by react-dom, react-three-fiber and Ink without being rewritten for any of them.',
      'ssh -p 2222 londontypescript.org to see this page rendered as text.',
      'Write it once, render it everywhere.',
    ]);
  });

  it.each(VERTICAL_ALIGN)('hands align=%s to its Stack', (align) => {
    const page = home(fakeUi, { align });

    expect(page.type).toBe(fakeUi.Stack);
    expect(page.props).toMatchObject({ align });
  });
});
