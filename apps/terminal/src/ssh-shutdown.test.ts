import net from 'node:net';
import type { Client as SshClient, ClientChannel } from 'ssh2';
import ssh2 from 'ssh2';
import { describe, expect, it } from 'vitest';
import { createServer, type CreateServerOptions } from './create-server.ts';
import { HOST, NOOP_LOG, connectReady, generateHostKey, listen } from './ssh-test-support.ts';

// See `host-key.ts`/`create-server.ts` for why this is a default-import
// destructure rather than a named import.
const { Client } = ssh2;

const GENEROUS_MS = 2000;

/** Generous defaults for every limit but the one each test overrides. */
function testOptions(overrides: Partial<CreateServerOptions> = {}): CreateServerOptions {
  return {
    align: 'middle',
    hostKey: generateHostKey(),
    maxSessions: 4,
    maxConnections: 4,
    handshakeTimeoutMs: GENEROUS_MS,
    preShellTimeoutMs: GENEROUS_MS,
    maxSessionsPerConnection: 2,
    log: NOOP_LOG,
    ...overrides,
  };
}

function openShell(client: SshClient): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    client.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (error, stream) => {
      if (error) {
        reject(error);
      } else {
        resolve(stream);
      }
    });
  });
}

/** Races `promise` against a timeout, so a shutdown that hangs fails the test instead of the run. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for ${label} after ${String(ms)}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function waitForClose(target: SshClient | ClientChannel, ms: number, label: string): Promise<void> {
  return withTimeout(
    new Promise((resolve) => {
      target.once('close', () => {
        resolve();
      });
    }),
    ms,
    label,
  );
}

/** A raw socket that connects but never speaks — stands in for a client that never closes its own side. */
function silentSocket(port: number): net.Socket {
  const socket = net.createConnection({ host: HOST, port });
  socket.resume();
  return socket;
}

function getConnectionCount(server: net.Server): Promise<number> {
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

/**
 * The client-side `connect` event alone races the server's own accept —
 * `shutdown` only sees a socket once the server has it. Polls until the
 * server itself reports the connection, so the deadline test only starts
 * timing once there is actually something for it to wait out.
 */
async function waitForServerToAccept(server: net.Server, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  for (;;) {
    if ((await getConnectionCount(server)) > 0) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `timed out waiting for the server to accept the connection after ${String(ms)}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('ssh shutdown', () => {
  it('says goodbye and closes the channel and connection for an open shell, then refuses new connections', async () => {
    const { server, shutdown } = createServer(testOptions());
    const port = await listen(server);
    const client = new Client();

    try {
      await connectReady(client, port);
      const stream = await openShell(client);
      await withTimeout(
        new Promise<void>((resolve) => {
          stream.once('data', () => {
            resolve();
          });
        }),
        GENEROUS_MS,
        'first shell data',
      );

      let goodbye = '';
      stream.on('data', (chunk: Buffer) => {
        goodbye += chunk.toString('utf8');
      });

      const channelClosed = waitForClose(stream, GENEROUS_MS, 'channel close');
      const clientClosed = waitForClose(client, GENEROUS_MS, 'client close');

      await withTimeout(shutdown(), GENEROUS_MS, 'shutdown');

      await channelClosed;
      await clientClosed;
      expect(goodbye).toContain('Goodbye');

      const refused = new Client();
      const refusal = new Promise<void>((resolve, reject) => {
        refused.on('error', () => {
          resolve();
        });
        refused.on('ready', () => {
          reject(new Error('expected the new connection to be refused'));
        });
      });
      refused.connect({ host: HOST, port, username: 'test', password: 'test', readyTimeout: 500 });
      await withTimeout(refusal, GENEROUS_MS, 'new connection refusal');
    } finally {
      client.end();
    }
  });

  it('closes an authenticated connection that has no open shell', async () => {
    const { server, shutdown } = createServer(testOptions());
    const port = await listen(server);
    const client = new Client();

    try {
      await connectReady(client, port);
      const clientClosed = waitForClose(client, GENEROUS_MS, 'client close');

      await withTimeout(shutdown(), GENEROUS_MS, 'shutdown');

      await clientClosed;
    } finally {
      client.end();
    }
  });

  it('resolves within the deadline even when a client never closes its own side', async () => {
    // A generous handshake timeout so the *deadline* is what ends the
    // stuck socket — if it didn't, the test would still pass by luck via
    // that unrelated timer, hiding a broken deadline.
    const { server, shutdown } = createServer(
      testOptions({ shutdownDeadlineMs: 200, handshakeTimeoutMs: 10_000 }),
    );
    const port = await listen(server);
    const stuck = silentSocket(port);

    try {
      await waitForServerToAccept(server, GENEROUS_MS);

      const started = Date.now();
      await withTimeout(shutdown(), GENEROUS_MS, 'shutdown');
      expect(Date.now() - started).toBeLessThan(GENEROUS_MS);
    } finally {
      stuck.destroy();
    }
  });
});
