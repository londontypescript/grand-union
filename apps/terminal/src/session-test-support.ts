import { EventEmitter } from 'node:events';
import { Duplex } from 'node:stream';
import type { ServerChannel, Session } from 'ssh2';
import { attachSession } from './session.ts';
import { SessionLimiter } from './session-limiter.ts';

/**
 * A stand-in for the `ServerChannel` a shell's `accept()` returns: a real
 * `Duplex`, so Ink and `session.ts` use it as they would an SSH channel,
 * with every write and `exit` code recorded and no network behind it.
 * `columns` and `rows` start unset; `toPtyStdio` sets them in place.
 */
export class FakeChannel extends Duplex {
  readonly written: string[] = [];
  readonly exitCodes: number[] = [];
  columns: number | undefined;
  rows: number | undefined;

  override _read(): void {
    // Input is pushed by the test with `push`, never pulled.
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.written.push(chunk.toString('utf8'));
    callback();
  }

  exit(code: number): void {
    this.exitCodes.push(code);
  }

  text(): string {
    return this.written.join('');
  }
}

/** The calls `attachSession` made on one request's `accept` and `reject`. */
export interface RequestReply {
  accepted: number;
  rejected: number;
}

/**
 * One SSH `Session` as `attachSession` sees it: an `EventEmitter` the test
 * emits requests on, with the arguments ssh2 would pass for a request that
 * wants a reply.
 */
export class FakeSession {
  readonly #emitter = new EventEmitter();

  constructor(maxSessions = 1) {
    attachSession(this.#emitter as unknown as Session, {
      align: 'middle',
      limiter: new SessionLimiter(maxSessions),
    });
  }

  /** Sends `pty-req` with the size a client reported. */
  pty(cols: number, rows: number): RequestReply {
    return this.#request('pty', { cols, rows, width: 0, height: 0, term: 'xterm', modes: {} });
  }

  /** Sends `window-change`, which, as real clients send it, wants no reply. */
  windowChange(cols: number, rows: number): void {
    this.#emitter.emit('window-change', undefined, undefined, { cols, rows, width: 0, height: 0 });
  }

  /** Sends `env`, which a read-only page has no use for. */
  env(key: string, val: string): RequestReply {
    return this.#request('env', { key, val });
  }

  /** Sends `shell` and returns the channel its handler accepted. */
  shell(): FakeChannel {
    const channel = new FakeChannel();
    this.#emitter.emit('shell', () => channel as unknown as ServerChannel, undefined);
    return channel;
  }

  #request(event: string, info: object): RequestReply {
    const reply: RequestReply = { accepted: 0, rejected: 0 };
    this.#emitter.emit(
      event,
      () => {
        reply.accepted += 1;
      },
      () => {
        reply.rejected += 1;
      },
      info,
    );
    return reply;
  }
}

/** Ends a shell as a client closing its channel would, unmounting its Ink instance. */
export function closeShell(channel: FakeChannel): void {
  channel.emit('close');
  channel.destroy();
}
