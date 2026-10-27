import type { ServerChannel } from 'ssh2';

/**
 * The fields Ink 7.1.1 actually reads on the `stdout`/`stdin` it's given,
 * verified against its `build/ink.js` and `build/components/App.js`:
 * `columns`/`rows` for layout (`getWindowSize`), `isTTY` to pick interactive
 * mode and gate `useInput`'s raw-mode handshake, and `setRawMode`/`ref`/
 * `unref`, which that handshake calls once `isTTY` is true. Everything else
 * Ink needs — `write`, `on`/`off`/`addListener`/`removeListener`, `emit`,
 * `unshift`, `setEncoding` — already exists on `ServerChannel` as a real
 * `Duplex`; this type only adds what a channel doesn't have.
 */
export interface PtyStdio extends ServerChannel {
  columns: number;
  rows: number;
  isTTY: true;
  setRawMode(mode: boolean): void;
  ref(): this;
  unref(): this;
}

type WriteCallback = (error: Error | null | undefined) => void;

// The most output that may wait in a channel for its client. Ink writes
// whether or not the client grants window credit, so without a bound a
// client that stops reading would make ssh2 queue output without end.
const MAX_QUEUED_OUTPUT_BYTES = 1024 * 1024;

/**
 * Translates every bare `\n` to `\r\n` — the job a real pty's `ONLCR`
 * output flag does. An SSH client in raw mode moves the cursor down on
 * `\n` without returning it to column 0, and there is no server-side pty
 * here to add the `\r`, so without this every line starts where the last
 * one ended. Existing `\r\n` pairs are left as they are.
 */
export function toCrlf(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}

/**
 * Decorates an SSH `ServerChannel` in place with the extra fields
 * {@link PtyStdio} needs, so the *same* object can serve as Ink's `stdout`,
 * `stdin` and `stderr` — matching how a real terminal is one file
 * descriptor playing all three roles. `initial` comes from the session's
 * `pty-req` (or the 80×24 default for a channel that never sent one).
 * String writes get `\n` → `\r\n` translation (see {@link toCrlf}); Ink
 * only ever writes strings. `onBacklog` is called after any write that
 * leaves more than 1 MiB queued in the channel.
 */
export function toPtyStdio(
  channel: ServerChannel,
  initial: { readonly cols: number; readonly rows: number },
  onBacklog: () => void,
): PtyStdio {
  const stdio = channel as PtyStdio;
  stdio.columns = initial.cols;
  stdio.rows = initial.rows;
  stdio.isTTY = true;
  stdio.setRawMode = () => {
    // There is no server-side tty whose mode could be flipped — the client
    // put its own terminal into raw mode when it sent `pty-req`. Present
    // only so `useInput`'s raw-mode handshake (which calls this
    // unconditionally once `isTTY` is true) has something to call.
  };
  const write = channel.write.bind(channel);
  stdio.write = (
    chunk: unknown,
    encoding?: BufferEncoding | WriteCallback,
    callback?: WriteCallback,
  ): boolean => {
    const data = typeof chunk === 'string' ? toCrlf(chunk) : chunk;
    const flushed =
      typeof encoding === 'function'
        ? write(data, encoding)
        : write(data, encoding ?? 'utf8', callback);
    if (channel.writableLength > MAX_QUEUED_OUTPUT_BYTES) {
      onBacklog();
    }
    return flushed;
  };
  stdio.ref = () => stdio;
  stdio.unref = () => stdio;
  return stdio;
}

/** Applies a client-reported resize (`window-change`) and notifies Ink via the `resize` event `useStdout` consumers subscribe to. */
export function resizePtyStdio(stdio: PtyStdio, cols: number, rows: number): void {
  stdio.columns = cols;
  stdio.rows = rows;
  stdio.emit('resize');
}

/**
 * The one cast this module exists to isolate. Ink's `render()` types demand
 * a full `NodeJS.WriteStream` / `NodeJS.ReadStream` (Node's
 * `tty.WriteStream` / `tty.ReadStream`) — `clearLine`, `cursorTo`,
 * `getColorDepth`, and dozens of other control-sequence methods Ink 7.1.1
 * never calls (see {@link PtyStdio}'s doc comment for what it actually
 * reads). Implementing that whole surface for an SSH channel would be stub
 * methods with no real behaviour behind them, so instead this function
 * names the gap once, here, and casts through `unknown` at this single,
 * searchable site — every call site passes a real `PtyStdio`, never an
 * arbitrary value.
 */
export function asNodeStdio(stdio: PtyStdio): NodeJS.WriteStream & NodeJS.ReadStream {
  return stdio as unknown as NodeJS.WriteStream & NodeJS.ReadStream;
}
