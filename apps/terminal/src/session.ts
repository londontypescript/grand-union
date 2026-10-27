import { home } from '@lts/pages';
import { ink } from '@lts/renderer-ink';
import type { VerticalAlign } from '@lts/vocabulary';
import { render } from 'ink';
import type { Session } from 'ssh2';
import { asNodeStdio, resizePtyStdio, toPtyStdio } from './channel-stdio.ts';
import type { SessionLimiter } from './session-limiter.ts';

// A channel that never sent a `pty-req` (e.g. a client piping output
// somewhere) gets this size rather than `0×0`.
const DEFAULT_SIZE = { cols: 80, rows: 24 };

// The largest terminal a shell is drawn for. Ink lays out every cell of the
// terminal on each render, so a client mustn't choose how many there are.
const MAX_COLS = 500;
const MAX_ROWS = 200;

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

// The single byte a plain (non-paste) keypress of `q` or Ctrl+C ('\x03',
// ETX) arrives as — checked against `data.length === 1` so a pasted string
// that merely contains one of these characters doesn't trigger an exit.
const QUIT_BYTES = new Set([0x71, 0x03]);

export interface SessionOptions {
  readonly align: VerticalAlign;
  readonly limiter: SessionLimiter;
  /**
   * Called once a shell actually mounts — not for a busy-capacity bounce —
   * with the shell's own `endSession`, so a caller (graceful shutdown) can
   * end it the same way `q`/Ctrl-C/idle/close/error already do, without a
   * second copy of the goodbye/exit/cleanup sequence.
   */
  readonly onShellStart?: (endSession: () => void) => void;
  /** Called once that shell ends, pairing every `onShellStart`. */
  readonly onShellEnd?: (endSession: () => void) => void;
}

/**
 * A pty-req/window-change can legitimately report `0` for `cols`/`rows`
 * (no window size established yet, e.g. a client with no controlling
 * terminal of its own) — `ink`'s own `getWindowSize` utility treats a
 * falsy size the same way, falling back rather than rendering a
 * zero-height frame that looks like nothing happened.
 */
function positiveOr(value: number, fallback: number): number {
  return value > 0 ? value : fallback;
}

/**
 * The size a shell is drawn at for one a client reported in `pty-req` or
 * `window-change`: `0` falls back to 80×24, and anything past 500×200 is
 * cut to it, so a larger window shows the page laid out for 500×200.
 */
function normaliseSize(cols: number, rows: number): { cols: number; rows: number } {
  return {
    cols: Math.min(positiveOr(cols, DEFAULT_SIZE.cols), MAX_COLS),
    rows: Math.min(positiveOr(rows, DEFAULT_SIZE.rows), MAX_ROWS),
  };
}

/**
 * Calls `fn` if it exists. `@types/ssh2` types every session sub-request's
 * `accept`/`reject` as an always-present function, but ssh2's actual
 * runtime (`lib/server.js`'s `CHANNEL_REQUEST` handler) only constructs
 * them when the client's request set `want_reply` — `window-change`
 * conventionally doesn't, so `accept` arrives as `undefined` there in
 * practice (confirmed against a real client: `ssh2`'s own
 * `ClientChannel#setWindow` triggers exactly this). Declaring the parameter
 * type as optional here, once, means every call site below is an honest
 * `callIfPresent(accept)` rather than a cast or an `as`/`?.` mismatch with
 * what the listener's own declared type says.
 */
export function callIfPresent(fn: (() => void) | undefined): void {
  fn?.();
}

/**
 * Wires one SSH `Session` (one `session` channel-open request) to the
 * ink/vocabulary pipeline. `pty`/`window-change` track terminal size ahead
 * of and during a shell; `shell` mounts an ink instance bound to the
 * channel; `exec`/`subsystem`/`env` are rejected outright — this is a
 * read-only text page, not a remote shell.
 */
export function attachSession(session: Session, options: SessionOptions): void {
  let size = DEFAULT_SIZE;
  let onResize: ((cols: number, rows: number) => void) | undefined;

  session.on('pty', (accept, reject, info) => {
    size = normaliseSize(info.cols, info.rows);
    callIfPresent(accept);
  });

  session.on('window-change', (accept, reject, info) => {
    callIfPresent(accept);
    const next = normaliseSize(info.cols, info.rows);
    onResize?.(next.cols, next.rows);
  });

  session.on('exec', (accept, reject) => {
    callIfPresent(reject);
  });
  session.on('subsystem', (accept, reject) => {
    callIfPresent(reject);
  });
  session.on('env', (accept, reject) => {
    callIfPresent(reject);
  });

  session.on('shell', (accept) => {
    if (!options.limiter.tryAcquire()) {
      const busyChannel = accept();
      busyChannel.write(
        'London TypeScript terminal is at capacity — please try again shortly.\r\n',
      );
      busyChannel.exit(1);
      busyChannel.end();
      return;
    }

    const channel = accept();
    const stdio = toPtyStdio(channel, size);
    const nodeStdio = asNodeStdio(stdio);
    onResize = (cols, rows) => {
      // Ink would lay the page out again only to draw the frame it shows.
      if (cols === stdio.columns && rows === stdio.rows) {
        return;
      }
      resizePtyStdio(stdio, cols, rows);
    };

    const instance = render(home(ink, { align: options.align }), {
      stdout: nodeStdio,
      stdin: nodeStdio,
      stderr: nodeStdio,
      exitOnCtrlC: false,
      patchConsole: false,
      // Ink otherwise reads the *server's* environment (e.g. `CI=true`) to
      // decide this, and renders nothing until exit. The client on the other
      // end of an SSH shell is always an interactive terminal.
      interactive: true,
    });

    let ended = false;
    let idleTimer = setTimeout(endSession, IDLE_TIMEOUT_MS);
    options.onShellStart?.(endSession);

    function endSession(): void {
      if (ended) {
        return;
      }
      ended = true;
      clearTimeout(idleTimer);
      instance.unmount();
      try {
        channel.write('\r\nGoodbye from London TypeScript.\r\n');
        channel.exit(0);
        channel.end();
      } catch {
        // The channel may already be closing (e.g. the client disconnected
        // first) — the unmount and timer cleanup above are what matter.
      }
      options.limiter.release();
      options.onShellEnd?.(endSession);
    }

    channel.on('data', (data: Buffer) => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(endSession, IDLE_TIMEOUT_MS);
      if (data.length === 1 && QUIT_BYTES.has(data[0] ?? -1)) {
        endSession();
      }
    });

    channel.on('close', endSession);
    channel.on('error', endSession);
  });
}
