import type net from 'node:net';
import { stripVTControlCharacters } from 'node:util';
import type { Client as SshClient, ClientChannel, PseudoTtyOptions } from 'ssh2';
import ssh2 from 'ssh2';
import { afterEach } from 'vitest';
import { createServer, type CreateServerOptions, type TerminalServer } from './create-server.ts';
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
export const PAGE_TEXT = 'Write it once, render it everywhere.';
const GENEROUS_MS = 5000;
// Above each test's own waits plus cleanup (closing the server is bounded
// at 5 s), so a broken handler fails with its own message, never with
// Vitest's timeout.
export const TEST_TIMEOUT_MS = 30_000;
export const PTY: PseudoTtyOptions = { term: 'xterm', cols: 80, rows: 24 };

/** What a shell channel has sent so far, and whether it has ended. */
export interface Watched {
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
export async function until(
  watched: Watched,
  done: () => boolean,
  ms = GENEROUS_MS,
): Promise<void> {
  const deadline = Date.now() + ms;
  while (!done() && watched.ended === undefined) {
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${String(ms)}ms; shell output so far:\n${watched.text()}`);
    }
    await sleep(10);
  }
}

export function shell(
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

/** The server's live connection count (how many slots the `maxConnections` cap sees). */
function connectionCount(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.getConnections((error, count) => {
      if (error) {
        reject(error);
      } else {
        resolve(count);
      }
    });
  });
}

/** Polls the server's connection count until it reaches `target` or `ms` passes, returning the last count seen. */
export async function waitForConnectionCount(
  server: net.Server,
  target: number,
  ms: number,
): Promise<number> {
  const deadline = Date.now() + ms;
  let count = await connectionCount(server);
  while (count !== target && Date.now() < deadline) {
    await sleep(20);
    count = await connectionCount(server);
  }
  return count;
}

/** A client, a listening server, and the clients to tear down, shared by the SSH test files. */
export interface SshHarness {
  startServer: (overrides?: Partial<CreateServerOptions>) => TerminalServer;
  serve: (overrides?: Partial<CreateServerOptions>) => Promise<number>;
  serveServer: (
    overrides?: Partial<CreateServerOptions>,
  ) => Promise<{ server: net.Server; port: number }>;
  connect: (port: number) => Promise<SshClient>;
}

/**
 * Sets up a server-and-client harness for one test file: a fresh client
 * list and one server per test, all torn down in an `afterEach` it registers.
 */
export function setupSshTests(): SshHarness {
  const clients: SshClient[] = [];
  let closeAfter: (() => Promise<void>) | undefined;

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.destroy();
    }
    await closeAfter?.();
    closeAfter = undefined;
  });

  /** One server per test, with every limit generous but the ones given. */
  function startServer(overrides: Partial<CreateServerOptions> = {}): TerminalServer {
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

  async function serveServer(
    overrides: Partial<CreateServerOptions> = {},
  ): Promise<{ server: net.Server; port: number }> {
    const { server } = startServer(overrides);
    const port = await listen(server);
    closeAfter = () => closeServer(server);
    return { server, port };
  }

  async function serve(overrides: Partial<CreateServerOptions> = {}): Promise<number> {
    return (await serveServer(overrides)).port;
  }

  async function connect(port: number): Promise<SshClient> {
    const client = new Client();
    clients.push(client);
    await connectReady(client, port);
    return client;
  }

  return { startServer, serve, serveServer, connect };
}
