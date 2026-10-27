import { stripVTControlCharacters } from 'node:util';
import type { Client as SshClient, ClientChannel, PseudoTtyOptions } from 'ssh2';
import ssh2 from 'ssh2';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type CreateServerOptions } from './create-server.ts';
import {
  NOOP_LOG,
  closeServer,
  connectReady,
  generateHostKey,
  listen,
  sleep,
} from './ssh-test-support.ts';

// See `host-key.ts`/`create-server.ts` for why this is a default-import
// destructure rather than a named import.
const { Client } = ssh2;

// The page's quote: the capacity message also names London TypeScript, so
// the header alone can't tell the page from the refusal.
const PAGE_TEXT = 'Write it once, render it everywhere.';
const GENEROUS_MS = 5000;
// How long a shell is watched for a quit it mustn't make: a quitting byte
// ends the session within a few milliseconds.
const QUIET_MS = 1000;
// Above each test's own waits plus cleanup (closing the server is bounded
// at 5 s), so a broken handler fails with its own message, never with
// Vitest's timeout.
const TEST_TIMEOUT_MS = 30_000;
const PTY: PseudoTtyOptions = { term: 'xterm', cols: 80, rows: 24 };

/** One server per test, with every limit generous but the shell cap given. */
function startServer(overrides: Partial<CreateServerOptions> = {}) {
  return createServer({
    align: 'middle',
    hostKey: generateHostKey(),
    maxSessions: 4,
    maxConnections: 8,
    handshakeTimeoutMs: 60_000,
    preShellTimeoutMs: 60_000,
    maxSessionsPerConnection: 2,
    log: NOOP_LOG,
    ...overrides,
  });
}

// Every client a test opens, destroyed before its server is closed.
const clients: SshClient[] = [];
let closeAfter: (() => Promise<void>) | undefined;

afterEach(async () => {
  for (const client of clients.splice(0)) {
    client.destroy();
  }
  await closeAfter?.();
  closeAfter = undefined;
});

async function serve(overrides: Partial<CreateServerOptions> = {}): Promise<number> {
  const { server } = startServer(overrides);
  const port = await listen(server);
  closeAfter = () => closeServer(server);
  return port;
}

async function connect(port: number): Promise<SshClient> {
  const client = new Client();
  clients.push(client);
  await connectReady(client, port);
  return client;
}

/** What a shell channel has sent so far, and whether it has ended. */
interface Watched {
  readonly stream: ClientChannel;
  text: () => string;
  exitCode: number | undefined;
  ended: string | undefined;
}

/** Records a channel's output, exit status and end, and the end of its connection. */
function watch(client: SshClient, stream: ClientChannel): Watched {
  let raw = '';
  const watched: Watched = {
    stream,
    text: () => stripVTControlCharacters(raw),
    exitCode: undefined,
    ended: undefined,
  };
  stream.on('data', (chunk: Buffer) => {
    raw += chunk.toString('utf8');
  });
  stream.on('exit', (code: unknown) => {
    watched.exitCode = typeof code === 'number' ? code : undefined;
  });
  stream.on('close', () => {
    watched.ended ??= 'the channel closed';
  });
  client.on('close', () => {
    watched.ended ??= 'the connection closed';
  });
  client.on('error', (error: Error) => {
    watched.ended ??= `the connection failed: ${error.message}`;
  });
  return watched;
}

/** Polls until `done` holds or the shell ends, failing only past `ms`. */
async function until(watched: Watched, done: () => boolean, ms = GENEROUS_MS): Promise<void> {
  const deadline = Date.now() + ms;
  while (!done() && watched.ended === undefined) {
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${String(ms)}ms; shell output so far:\n${watched.text()}`);
    }
    await sleep(10);
  }
}

function shell(
  client: SshClient,
  pty: PseudoTtyOptions | false,
  env?: Record<string, string>,
): Promise<Watched> {
  return new Promise((resolve, reject) => {
    const callback = (error: Error | undefined, stream: ClientChannel): void => {
      if (error) {
        reject(error);
      } else {
        resolve(watch(client, stream));
      }
    };
    if (env === undefined) {
      client.shell(pty, callback);
    } else {
      client.shell(pty, { env }, callback);
    }
  });
}

/** Opens a session channel with `open` and settles with the error its request got, if any. */
function refusal(
  open: (callback: (error: Error | undefined, stream: ClientChannel) => void) => void,
): Promise<Error | undefined> {
  return new Promise((resolve) => {
    open((error) => {
      resolve(error);
    });
  });
}

describe('the concurrent-shell cap', { timeout: TEST_TIMEOUT_MS }, () => {
  it('tells a shell past the cap the server is at capacity, and exits it 1', async () => {
    const port = await serve({ maxSessions: 1 });
    const a = await shell(await connect(port), PTY);
    await until(a, () => a.text().includes(PAGE_TEXT));
    expect(a.ended, "A's shell mounts").toBeUndefined();

    const b = await shell(await connect(port), PTY);
    await until(b, () => b.text().includes(PAGE_TEXT));

    expect(b.text(), "B's shell, past the cap of 1").toContain('at capacity');
    expect(b.text(), "B's shell, past the cap of 1").not.toContain(PAGE_TEXT);
    await until(b, () => b.exitCode !== undefined);
    expect(b.exitCode, "B's exit status").toBe(1);
  });

  it('lets a new shell mount once the one holding the cap has ended', async () => {
    const port = await serve({ maxSessions: 1 });
    const a = await shell(await connect(port), PTY);
    await until(a, () => a.text().includes(PAGE_TEXT));
    a.stream.write('q');
    await until(a, () => false);
    expect(a.text(), "A's shell said goodbye").toContain('Goodbye');

    const c = await shell(await connect(port), PTY);
    await until(c, () => c.text().includes(PAGE_TEXT));

    expect(c.text(), "C's shell, after A's ended").not.toContain('at capacity');
    expect(c.text(), "C's shell, after A's ended").toContain(PAGE_TEXT);
  });
});

describe('a shell with an absent or empty size', { timeout: TEST_TIMEOUT_MS }, () => {
  it('renders the page when the client sent no pty-req', async () => {
    const watched = await shell(await connect(await serve()), false);
    await until(watched, () => watched.text().includes(PAGE_TEXT));

    expect(watched.text()).toContain(PAGE_TEXT);
  });

  it('renders the page when the client reported a 0×0 pty', async () => {
    const watched = await shell(await connect(await serve()), {
      term: 'xterm',
      cols: 0,
      rows: 0,
    });
    await until(watched, () => watched.text().includes(PAGE_TEXT));

    expect(watched.text()).toContain(PAGE_TEXT);
  });
});

describe('a shell claiming an enormous terminal', { timeout: TEST_TIMEOUT_MS }, () => {
  // Drawn at 500×200, which `session.test.ts` checks. Without that cap Ink
  // would lay out ten billion cells and exhaust this test process.
  it('renders the page when the client reported a 100000×100000 pty', async () => {
    const watched = await shell(await connect(await serve()), {
      term: 'xterm',
      cols: 100_000,
      rows: 100_000,
    });
    await until(watched, () => watched.text().includes(PAGE_TEXT));

    expect(watched.text()).toContain(PAGE_TEXT);
  });
});

describe('requests a read-only page refuses', { timeout: TEST_TIMEOUT_MS }, () => {
  it('refuses exec', async () => {
    const client = await connect(await serve());

    const error = await refusal((callback) => client.exec('ls', callback));

    expect(error, 'exec is refused').toBeInstanceOf(Error);
  });

  it('refuses a subsystem', async () => {
    const client = await connect(await serve());

    const error = await refusal((callback) => client.subsys('sftp', callback));

    expect(error, 'the sftp subsystem is refused').toBeInstanceOf(Error);
  });
});

describe('requests sent without wanting a reply', { timeout: TEST_TIMEOUT_MS }, () => {
  it('re-renders on a window-change, which wants no reply', async () => {
    const client = await connect(await serve());
    const watched = await shell(client, PTY);
    await until(watched, () => watched.text().includes(PAGE_TEXT));
    const before = watched.text().length;

    // 50 columns less 2 of padding each side.
    const divider = /(?<!─)─{46}(?!─)/;
    watched.stream.setWindow(24, 50, 0, 0);
    await until(watched, () => divider.test(watched.text().slice(before)));

    expect(
      divider.test(watched.text().slice(before)),
      `the shell re-renders at 50 columns${
        watched.ended === undefined
          ? ''
          : `, but window-change without want-reply ended it: ${watched.ended}`
      }`,
    ).toBe(true);
  });

  it('opens the shell after an env request, which wants no reply', async () => {
    const client = await connect(await serve());
    let ended: string | undefined;
    client.on('close', () => {
      ended ??= 'the connection closed';
    });
    client.on('error', (error: Error) => {
      ended ??= `the connection failed: ${error.message}`;
    });

    const opened = await shell(client, PTY, { TEST: 'value' }).catch((error: unknown) => {
      ended ??= `the shell failed to open: ${String(error)}`;
      return undefined;
    });
    if (opened !== undefined) {
      await until(opened, () => opened.text().includes(PAGE_TEXT));
    }

    expect(
      opened?.text() ?? '',
      `the shell renders${
        (ended ?? opened?.ended) === undefined
          ? ''
          : `, but env without want-reply ended the connection: ${String(ended ?? opened?.ended)}`
      }`,
    ).toContain(PAGE_TEXT);
  });
});

describe('quitting', { timeout: TEST_TIMEOUT_MS }, () => {
  it('quits on q as a single byte, but not on a paste that contains one', async () => {
    const watched = await shell(await connect(await serve()), PTY);
    await until(watched, () => watched.text().includes(PAGE_TEXT));

    for (const paste of ['xq', 'qx']) {
      watched.stream.write(paste);
      await sleep(QUIET_MS);
      expect(watched.ended, `a pasted "${paste}" leaves the shell open`).toBeUndefined();
    }

    watched.stream.write('q');
    await until(watched, () => false);
    expect(watched.text(), 'a single q says goodbye').toContain('Goodbye');
  });
});
