import { EventEmitter } from 'node:events';
import type { ReactElement } from 'react';
import chalk from 'chalk';
import { render } from 'ink';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ink } from './registry.ts';

// `trimWrappedLine` strips the space Ink leaves at the start of a line that
// wrapped on a space. Over a real SSH client colour is on, so each wrapped
// line starts with an SGR escape (bold/dim/italic) and the space sits after
// it — which plain `trimStart` never reaches. These tests force colour on
// the one chalk instance Ink shares, so the components really emit those
// escapes, as they do for a client.

// ESC built at runtime so no control character is written into a regex
// literal (the lint rule forbids it). Matches one SGR colour code.
const SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

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

/** The raw frame (escapes and all) `element` renders at `columns` × `rows`. */
function renderFrame(element: ReactElement, columns: number, rows: number): string {
  const stdout = new FixedSizeStdout(columns, rows);
  const instance = render(element, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: new InertStdin() as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  const frame = stdout.frames.at(-1) ?? '';
  instance.unmount();
  return frame;
}

/** A line's leading-space count once its colour codes and any left border are removed. */
function textIndent(line: string): number {
  const text = line.replace(SGR, '').replace(/^│/, '');
  return text.length - text.trimStart().length;
}

let savedLevel: typeof chalk.level;

beforeEach(() => {
  savedLevel = chalk.level;
  // Truecolor, so dimColor/bold/italic all emit SGR, as they do for a client.
  chalk.level = 3;
});

afterEach(() => {
  chalk.level = savedLevel;
});

describe('trimWrappedLine over coloured, wrapped output', () => {
  // At 14 columns this wraps after "once," — on a space — in every one of
  // the three, so the leftover leading space shows if it isn't stripped.
  const WORDS = 'Write it once, render it everywhere.';
  const COLUMNS = 14;
  const ROWS = 8;

  const components = {
    Header: <ink.Header>{WORDS}</ink.Header>,
    Paragraph: <ink.Paragraph>{WORDS}</ink.Paragraph>,
    Quote: <ink.Quote>{WORDS}</ink.Quote>,
  } satisfies Record<string, ReactElement>;

  for (const [name, element] of Object.entries(components)) {
    it(`${name}: no wrapped line's visible text starts with the wrap's space`, () => {
      const frame = renderFrame(element, COLUMNS, ROWS);
      const lines = frame.split('\n').filter((line) => line.replace(SGR, '').trim().length > 0);

      expect(frame, 'colour is on, so the lines carry SGR escapes').toMatch(SGR);
      expect(lines.length, 'the text wrapped onto several lines').toBeGreaterThan(1);

      const indents = lines.map(textIndent);
      const [first, ...rest] = indents;
      for (const [index, indent] of rest.entries()) {
        expect(
          indent,
          `line ${String(index + 2)} is indented like the first (no leftover wrap space):\n${frame.replace(SGR, '')}`,
        ).toBe(first);
      }
    });
  }
});
