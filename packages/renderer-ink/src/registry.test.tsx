import { EventEmitter } from 'node:events';
import { stripVTControlCharacters } from 'node:util';
import type { ReactElement } from 'react';
import { render as inkRender } from 'ink';
import { render as renderForTest } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { VERTICAL_ALIGN, type VerticalAlign } from '@lts/vocabulary';
import { ink } from './registry.ts';

// What a reader sees from each component: its text, the divider, and, for
// Stack, where it places its children. Colour and weight are styling, so
// escape sequences are stripped before anything is compared.

/** The text `ink-testing-library` renders for `element`, which needs no fixed size. */
function renderText(element: ReactElement): string {
  const { lastFrame, unmount } = renderForTest(element);
  const frame = lastFrame() ?? '';
  unmount();
  return stripVTControlCharacters(frame);
}

/**
 * `ink-testing-library` 4.0.0's stdout is 100 columns with no rows, so
 * placement and wrapping, which depend on both, render through Ink's own
 * `render` into this fixed-size stand-in instead, as `apps/terminal`'s
 * home test does.
 */
class FixedSizeStdout extends EventEmitter {
  readonly isTTY = true;
  readonly frames: string[] = [];

  constructor(
    readonly columns: number,
    readonly rows: number,
  ) {
    super();
  }

  write = (frame: string): boolean => {
    this.frames.push(frame);
    return true;
  };
}

/** Nothing here reads input, so every method is a no-op. */
class InertStdin extends EventEmitter {
  readonly isTTY = true;

  setRawMode(): void {
    // No input is sent, so there is no mode to switch.
  }

  ref(): void {
    // Never a real handle, so nothing to keep alive.
  }

  unref(): void {
    // See `ref`.
  }
}

/** The lines `element` renders at `columns` × `rows`. `debug: true` makes
 * every commit a whole frame, so the last write is the full screen. */
function renderLines(element: ReactElement, columns: number, rows: number): string[] {
  const stdout = new FixedSizeStdout(columns, rows);
  const stdin = new InertStdin();
  const instance = inkRender(element, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  // Read before unmounting: unmount writes one more frame that isn't content.
  const frame = stdout.frames.at(-1) ?? '';
  instance.unmount();
  return stripVTControlCharacters(frame).split('\n');
}

describe('ink text leaves', () => {
  it('Header renders its text', () => {
    expect(renderText(<ink.Header>London TypeScript</ink.Header>)).toBe('London TypeScript');
  });

  it('Paragraph renders its text', () => {
    expect(renderText(<ink.Paragraph>One vocabulary.</ink.Paragraph>)).toBe('One vocabulary.');
  });

  it('Quote renders its text behind a left border', () => {
    expect(renderText(<ink.Quote>Write it once.</ink.Quote>)).toBe('│ Write it once.');
  });

  it('DividingLine renders a line of ─ across the content width', () => {
    // 40 columns less 2 of padding each side.
    expect(renderLines(<ink.DividingLine />, 40, 1)).toEqual(['─'.repeat(36)]);
  });
});

describe('ink Stack', () => {
  const ROWS = 12;

  function contentRows(align: VerticalAlign): { first: number; last: number } {
    const lines = renderLines(
      <ink.Stack align={align}>
        <ink.Header>First</ink.Header>
        <ink.Paragraph>Second</ink.Paragraph>
      </ink.Stack>,
      40,
      ROWS,
    );
    expect(lines).toHaveLength(ROWS);
    const first = lines.findIndex((line) => line.includes('First'));
    expect(first, `"First" not found in:\n${lines.join('\n')}`).toBeGreaterThanOrEqual(0);
    expect(lines[first + 2], 'one blank row of gap, then "Second"').toContain('Second');
    return { first, last: first + 2 };
  }

  // Where the content sits in the 12-row frame, as blank rows above and below.
  const expectPlacement = {
    top: ({ first }) => {
      expect(first, 'top: no blank row above the content').toBe(0);
    },
    middle: ({ first, last }) => {
      const below = ROWS - 1 - last;
      expect(
        Math.abs(first - below),
        'middle: as many blank rows above as below',
      ).toBeLessThanOrEqual(1);
      expect(first, 'middle: blank rows above the content').toBeGreaterThan(0);
    },
    bottom: ({ last }) => {
      expect(last, 'bottom: no blank row below the content').toBe(ROWS - 1);
    },
  } satisfies Record<VerticalAlign, (rows: { first: number; last: number }) => void>;

  it.each(VERTICAL_ALIGN)('align=%s places its children there', (align) => {
    expectPlacement[align](contentRows(align));
  });
});

describe('ink wrapping', () => {
  // At 14 columns Ink breaks this text after "once,", at a space, and
  // without trimming the next line would start with that space.
  const TEXT = 'Write it once, render it everywhere.';

  it('Paragraph: no wrapped line starts with the space the wrap broke at', () => {
    const lines = renderLines(<ink.Paragraph>{TEXT}</ink.Paragraph>, 14, 5).filter(
      (line) => line.trim().length > 0,
    );

    expect(lines.length, 'the text wraps onto several lines').toBeGreaterThan(1);
    expect(lines.join(' ').split(/\s+/).filter(Boolean), 'every word survives').toEqual(
      TEXT.split(' '),
    );
    expect(
      lines.filter((line) => line.startsWith(' ')),
      'wrapped lines that start with a space',
    ).toEqual([]);
  });
});
