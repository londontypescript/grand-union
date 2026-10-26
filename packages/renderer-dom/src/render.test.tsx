import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VERTICAL_ALIGN, type VerticalAlign } from '@lts/vocabulary';
import { dom } from './registry.ts';

// What a reader sees from each component: its tag, the text it was given,
// and, for Stack, where it places its children. Attributes other than
// Stack's `justify-content` are styling, so the patterns skip over them.
const render = (element: ReactElement): string => renderToStaticMarkup(element);

describe('dom text leaves', () => {
  it('Header renders its text in an <h1>', () => {
    expect(render(<dom.Header>London TypeScript</dom.Header>)).toMatch(
      /^<h1\b[^>]*>London TypeScript<\/h1>$/,
    );
  });

  it('Paragraph renders its text in a <p>', () => {
    expect(render(<dom.Paragraph>One vocabulary.</dom.Paragraph>)).toMatch(
      /^<p\b[^>]*>One vocabulary\.<\/p>$/,
    );
  });

  it('Quote renders its text in a <blockquote>', () => {
    expect(render(<dom.Quote>Write it once.</dom.Quote>)).toMatch(
      /^<blockquote\b[^>]*>Write it once\.<\/blockquote>$/,
    );
  });

  it('DividingLine renders an <hr>', () => {
    expect(render(<dom.DividingLine />)).toMatch(/^<hr\b[^>]*\/>$/);
  });
});

describe('dom Stack', () => {
  const justifyContent = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  } satisfies Record<VerticalAlign, string>;

  it.each(VERTICAL_ALIGN)(
    'align=%s places its children with the matching justify-content',
    (align) => {
      const html = render(
        <dom.Stack align={align}>
          <dom.Header>First</dom.Header>
          <dom.Paragraph>Second</dom.Paragraph>
        </dom.Stack>,
      );

      expect(html).toMatch(/^<main\b[^>]*>.*<\/main>$/);
      expect(html).toContain(`justify-content:${justifyContent[align]}`);
      expect(html).toMatch(/<h1\b[^>]*>First<\/h1><p\b[^>]*>Second<\/p>/);
    },
  );
});
