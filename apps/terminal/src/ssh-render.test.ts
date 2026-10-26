import type { Client as SshClient, ClientChannel } from 'ssh2';
import ssh2 from 'ssh2';
import { Terminal } from '@xterm/headless';
import { VERTICAL_ALIGN, type VerticalAlign } from '@lts/vocabulary';
import { describe, expect, it } from 'vitest';
import { createServer } from './create-server.ts';
import { HOST, NOOP_LOG, closeServer, generateHostKey, listen, sleep } from './ssh-test-support.ts';

// See `host-key.ts`/`create-server.ts` for why this is a default-import
// destructure rather than a named import.
const { Client } = ssh2;

const HEADER_TEXT = 'London TypeScript';
const COLS = 100;
const ROWS = 30;
// Above each test's own waits (connecting and each stable frame are bounded
// at 5 s and 4 s) plus cleanup (closing the server is bounded at 5 s), so a
// broken render fails with its own message, never with Vitest's timeout.
const TEST_TIMEOUT_MS = 30_000;

type Size = Readonly<{ cols: number; rows: number }>;

interface Session {
  readonly client: SshClient;
  readonly stream: ClientChannel;
  readonly terminal: Terminal;
  /** Resolves once every chunk received so far has been parsed into `terminal`'s buffer. */
  readonly flush: () => Promise<void>;
  readonly rawText: () => string;
  readonly resize: (size: Size) => void;
}

function writeAsync(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => {
    terminal.write(data, resolve);
  });
}

function connectShell(client: SshClient, port: number, size: Size): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    client.on('error', reject);
    client.on('ready', () => {
      client.shell(
        { term: 'xterm-256color', cols: size.cols, rows: size.rows },
        (error, stream) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(stream);
        },
      );
    });
    client.connect({ host: HOST, port, username: 'test', password: 'test', readyTimeout: 5000 });
  });
}

/**
 * Opens one SSH session against a fresh `createServer` instance, wires the
 * raw bytes it receives into a headless `@xterm/headless` terminal (so
 * assertions read what a real terminal would render, not the escape
 * sequences themselves), runs `fn`, then tears everything down. Every test
 * gets its own server on an ephemeral port and its own in-memory host key.
 */
async function withSession<T>(
  align: VerticalAlign,
  size: Size,
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  const { server } = createServer({
    align,
    hostKey: generateHostKey(),
    maxSessions: 4,
    maxConnections: 4,
    handshakeTimeoutMs: 5000,
    preShellTimeoutMs: 5000,
    maxSessionsPerConnection: 4,
    log: NOOP_LOG,
  });
  const port = await listen(server);
  const client = new Client();
  // `buffer.active` (used by `readLines` below) is a proposed API in
  // @xterm/headless — opt in explicitly rather than the stable, more
  // limited surface.
  const terminal = new Terminal({ cols: size.cols, rows: size.rows, allowProposedApi: true });

  let raw = '';
  let pending = Promise.resolve();

  try {
    const stream = await connectShell(client, port, size);
    stream.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      raw += text;
      pending = pending.then(() => writeAsync(terminal, text));
    });

    return await fn({
      client,
      stream,
      terminal,
      flush: () => pending,
      rawText: () => raw,
      resize: ({ cols, rows }) => {
        terminal.resize(cols, rows);
        stream.setWindow(rows, cols, 0, 0);
      },
    });
  } finally {
    terminal.dispose();
    client.destroy();
    await closeServer(server);
  }
}

/**
 * Polls `terminal`'s buffer until `isReady` is satisfied and the rendered
 * lines stop changing for `stableMs` — the deterministic stand-in for a
 * fixed sleep, since the SSH round trip and ink's own render timing are not
 * otherwise observable from here.
 */
async function waitForStableLines(
  terminal: Terminal,
  flush: () => Promise<void>,
  isReady: (lines: readonly string[]) => boolean,
  { timeoutMs = 4000, stableMs = 150, pollMs = 20 } = {},
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot: string | undefined;
  let stableSince = Date.now();

  for (;;) {
    await flush();
    const lines = readLines(terminal);
    if (isReady(lines)) {
      const snapshot = lines.join('\n');
      if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= stableMs) {
        return lines;
      }
    } else {
      lastSnapshot = undefined;
    }

    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting for a stable, ready terminal frame. Last frame:\n${readLines(terminal).join('\n')}`,
      );
    }
    await sleep(pollMs);
  }
}

function readLines(terminal: Terminal): string[] {
  const lines: string[] = [];
  for (let row = 0; row < terminal.rows; row += 1) {
    lines.push(terminal.buffer.active.getLine(row)?.translateToString(true) ?? '');
  }
  return lines;
}

function firstNonBlankIndex(lines: readonly string[]): number {
  return lines.findIndex((line) => line.trim().length > 0);
}

function lastNonBlankIndex(lines: readonly string[]): number {
  return lines.findLastIndex((line) => line.trim().length > 0);
}

function findHeader(lines: readonly string[]): { row: number; column: number } | undefined {
  for (const [row, line] of lines.entries()) {
    const column = line.indexOf(HEADER_TEXT);
    if (column >= 0) {
      return { row, column };
    }
  }
  return undefined;
}

function expectHeaderCentered(
  lines: readonly string[],
  cols: number,
): { row: number; column: number } {
  const header = findHeader(lines);
  if (!header) {
    throw new Error(`header line not found in:\n${lines.join('\n')}`);
  }
  const expectedColumn = (cols - HEADER_TEXT.length) / 2;
  expect(Math.abs(header.column - expectedColumn)).toBeLessThanOrEqual(1);
  return header;
}

/** The wrapped lines of the paragraph immediately following the header, skipping the one blank gap row `Stack`'s `gap={1}` leaves between them. */
function firstParagraphLines(lines: readonly string[], headerRow: number): string[] {
  const rest = lines.slice(headerRow + 1);
  const gapEnd = rest.findIndex((line) => line.trim().length > 0);
  const afterGap = gapEnd === -1 ? [] : rest.slice(gapEnd);
  const paragraphEnd = afterGap.findIndex((line) => line.trim().length === 0);
  return paragraphEnd === -1 ? afterGap : afterGap.slice(0, paragraphEnd);
}

/**
 * The regression this whole file exists for: without CRLF translation, a
 * bare `\n` moves the cursor down without returning it to column 0, so each
 * wrapped line of the paragraph starts one line's worth further right than
 * the last — a visible staircase. Every line of a left-aligned wrapped
 * paragraph must start at the same column.
 */
function expectNoStaircase(paragraphLines: readonly string[]): void {
  expect(paragraphLines.length).toBeGreaterThan(1);
  const startColumns = paragraphLines.map((line) => line.length - line.trimStart().length);
  const [first, ...rest] = startColumns;
  for (const column of rest) {
    expect(column).toBe(first);
  }
}

const expectVerticalPlacement = {
  top: (lines) => {
    expect(firstNonBlankIndex(lines)).toBeLessThanOrEqual(1);
  },
  bottom: (lines) => {
    expect(lastNonBlankIndex(lines)).toBeGreaterThanOrEqual(ROWS - 2);
  },
  middle: (lines) => {
    expect(firstNonBlankIndex(lines)).toBeGreaterThan(0);
    expect(lastNonBlankIndex(lines)).toBeLessThan(ROWS - 1);
  },
} satisfies Record<VerticalAlign, (lines: readonly string[]) => void>;

describe('ssh render', () => {
  for (const align of VERTICAL_ALIGN) {
    it(
      `renders ${align} correctly over a real SSH pty`,
      async () => {
        await withSession(align, { cols: COLS, rows: ROWS }, async ({ terminal, flush }) => {
          const lines = await waitForStableLines(terminal, flush, (ls) =>
            ls.some((line) => line.includes(HEADER_TEXT)),
          );

          const header = expectHeaderCentered(lines, COLS);
          expectNoStaircase(firstParagraphLines(lines, header.row));
          expectVerticalPlacement[align](lines);
        });
      },
      TEST_TIMEOUT_MS,
    );
  }

  it(
    're-centers the header after a resize',
    async () => {
      await withSession(
        'middle',
        { cols: COLS, rows: ROWS },
        async ({ terminal, flush, resize }) => {
          await waitForStableLines(terminal, flush, (ls) =>
            ls.some((line) => line.includes(HEADER_TEXT)),
          );

          const newSize = { cols: 60, rows: ROWS };
          resize(newSize);

          const lines = await waitForStableLines(terminal, flush, (ls) => {
            const header = findHeader(ls);
            if (!header) {
              return false;
            }
            return Math.abs(header.column - (newSize.cols - HEADER_TEXT.length) / 2) <= 1;
          });

          expectHeaderCentered(lines, newSize.cols);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'ends the session and says goodbye when the client sends q',
    async () => {
      await withSession(
        'middle',
        { cols: COLS, rows: ROWS },
        async ({ terminal, flush, stream, rawText }) => {
          await waitForStableLines(terminal, flush, (ls) =>
            ls.some((line) => line.includes(HEADER_TEXT)),
          );

          const closed = new Promise<void>((resolve) => {
            stream.on('close', resolve);
          });

          stream.write('q');
          await closed;

          expect(rawText()).toContain('Goodbye');
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
