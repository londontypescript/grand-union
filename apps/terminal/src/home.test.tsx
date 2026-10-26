import { EventEmitter } from 'node:events';
import { home } from '@lts/pages';
import { ink } from '@lts/renderer-ink';
import { VERTICAL_ALIGN, type VerticalAlign } from '@lts/vocabulary';
import { render as inkRender } from 'ink';
import { render as renderForTest } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

const COLUMNS = 80;
const ROWS = 24;

/**
 * A fixed-size stdout for ink's real `render()`, standing in for
 * `ink-testing-library`'s own stub. `ink-testing-library@4.0.0` hardcodes
 * `columns` to `100` and has no `rows` at all (see its `build/index.js`),
 * so it can't produce the fixed 80×24 frame these snapshots need — hence
 * this small test-only stub instead, per the note in `docs/architecture.md`
 * that types prove totality, not behavioural correspondence; this is the
 * narrow rendering check that covers the gap, for `ink` specifically. It
 * mirrors `ink-testing-library`'s own stub shape (an `EventEmitter` with
 * `columns`/`rows` and a `write` that records frames) closely enough to
 * serve the same role, without touching `Stack`'s or `DividingLine`'s
 * contract to accept an injected size.
 */
class FixedSizeStdout extends EventEmitter {
  readonly columns = COLUMNS;
  readonly rows = ROWS;
  readonly isTTY = true;
  readonly frames: string[] = [];

  write = (frame: string): boolean => {
    this.frames.push(frame);
    return true;
  };

  lastFrame(): string | undefined {
    return this.frames.at(-1);
  }
}

/** A minimal stdin: nothing in `home` reads input, so every method is a no-op. */
class InertStdin extends EventEmitter {
  readonly isTTY = true;

  setRawMode(): void {
    // No input is ever sent in this test — nothing to switch modes on.
  }

  ref(): void {
    // Nothing keeps the process alive here; this stub is never a real handle.
  }

  unref(): void {
    // See `ref` above.
  }
}

/**
 * Renders `home(ink, { align })` at a fixed 80×24 and returns its last
 * frame as plain lines. `debug: true` (matching `ink-testing-library`'s own
 * default) makes every commit its own standalone write, so the last one is
 * always the full, clean frame rather than a cursor-reposition diff.
 */
function renderHomeLines(align: VerticalAlign): string[] {
  const stdout = new FixedSizeStdout();
  const stdin = new InertStdin();

  const instance = inkRender(home(ink, { align }), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  // Captured *before* unmounting: unmount's own cleanup (restoring the
  // cursor) writes one more frame that isn't page content, which would
  // otherwise become the new "last" frame.
  const frame = stdout.lastFrame() ?? '';
  instance.unmount();

  return frame.split('\n');
}

function firstContentLineIndex(lines: readonly string[]): number {
  return lines.findIndex((line) => line.trim().length > 0);
}

function lastContentLineIndex(lines: readonly string[]): number {
  return lines.findLastIndex((line) => line.trim().length > 0);
}

describe('home renders through the ink registry', () => {
  // `ink-testing-library` can't be given a fixed size (see `FixedSizeStdout`
  // above), but it's still the right tool for a size-independent smoke
  // test: the registry's real components, through its own `render`, produce
  // the page's actual text.
  it('renders the header and the ssh hint text', () => {
    const { lastFrame, unmount } = renderForTest(home(ink, { align: 'middle' }));
    const frame = lastFrame() ?? '';
    unmount();

    expect(frame).toContain('London TypeScript');
    expect(frame).toContain('ssh -p 2222 londontypescript.org');
  });

  for (const align of VERTICAL_ALIGN) {
    it(`matches the ${align} snapshot at 80x24`, () => {
      expect(renderHomeLines(align).join('\n')).toMatchSnapshot();
    });
  }

  it('top: the header sits on the first non-blank line', () => {
    const lines = renderHomeLines('top');
    const first = firstContentLineIndex(lines);

    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(1);
    expect(lines[first]).toContain('London TypeScript');
  });

  it('bottom: the last content line sits at the bottom of the 24-row frame', () => {
    const lines = renderHomeLines('bottom');
    const last = lastContentLineIndex(lines);

    expect(last).toBeGreaterThanOrEqual(ROWS - 2);
  });

  it('middle: content has blank padding above and below', () => {
    const lines = renderHomeLines('middle');
    const first = firstContentLineIndex(lines);
    const last = lastContentLineIndex(lines);

    expect(first).toBeGreaterThan(0);
    expect(last).toBeLessThan(ROWS - 1);
  });
});
