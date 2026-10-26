import net from 'node:net';
import type { Client as SshClient, ClientChannel } from 'ssh2';
import ssh2 from 'ssh2';
import { describe, expect, it } from 'vitest';
import { createServer, type CreateServerOptions } from './create-server.ts';
import {
  HOST,
  NOOP_LOG,
  closeServer,
  connectReady,
  generateHostKey,
  listen,
  waitForEvent,
} from './ssh-test-support.ts';

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

/**
 * A socket that sends nothing but still needs to notice the server closing
 * it — a paused Node socket buffers incoming bytes (ssh2 sends its greeting
 * unprompted) and won't surface `close` until something drains it.
 */
function rawSocket(port: number): net.Socket {
  const socket = net.createConnection({ host: HOST, port });
  socket.resume();
  return socket;
}

describe('ssh limits', () => {
  it('refuses a connection past the connection cap, then accepts once one closes', async () => {
    const { server } = createServer(testOptions({ maxConnections: 1 }));
    const port = await listen(server);
    const first = new Client();

    try {
      await connectReady(first, port);

      const second = rawSocket(port);
      await waitForEvent(second, 'close', GENEROUS_MS);

      first.end();
      await waitForEvent(first, 'close', GENEROUS_MS);

      const third = new Client();
      try {
        await connectReady(third, port);
      } finally {
        third.end();
      }
    } finally {
      first.end();
      await closeServer(server);
    }
  });

  it('closes a connection that never completes the handshake', async () => {
    const { server } = createServer(testOptions({ handshakeTimeoutMs: 150 }));
    const port = await listen(server);

    try {
      const socket = rawSocket(port);
      await waitForEvent(socket, 'close', GENEROUS_MS);
    } finally {
      await closeServer(server);
    }
  });

  it('disconnects an authenticated connection that never opens a shell', async () => {
    const { server } = createServer(testOptions({ preShellTimeoutMs: 150 }));
    const port = await listen(server);
    const client = new Client();

    try {
      await connectReady(client, port);
      await waitForEvent(client, 'close', GENEROUS_MS);
    } finally {
      client.end();
      await closeServer(server);
    }
  });

  it('re-arms the pre-shell timer once the only open shell ends', async () => {
    // The same deadline also runs before the shell opens, so it has to
    // outlast opening one on a slow CI runner; 150 ms did not. Without the
    // re-arm the connection never closes, so a longer deadline still proves it.
    const { server } = createServer(testOptions({ preShellTimeoutMs: 1000 }));
    const port = await listen(server);
    const client = new Client();

    try {
      await connectReady(client, port);
      const stream = await openShell(client);
      await waitForEvent(stream, 'data', GENEROUS_MS);

      stream.write('q');
      await waitForEvent(stream, 'close', GENEROUS_MS);

      // The shell is gone but the connection is still open — the deadline
      // should be running again, not left disarmed.
      await waitForEvent(client, 'close', GENEROUS_MS);
    } finally {
      client.end();
      await closeServer(server);
    }
  });

  it('rejects a second session channel beyond the per-connection cap, while the first still works', async () => {
    const { server } = createServer(testOptions({ maxSessionsPerConnection: 1 }));
    const port = await listen(server);
    const client = new Client();

    try {
      await connectReady(client, port);

      const firstStream = await openShell(client);
      const secondError = await openShell(client).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(secondError).toBeInstanceOf(Error);

      let firstClosed = false;
      firstStream.on('close', () => {
        firstClosed = true;
      });
      // The first channel keeps delivering the rendered page — proof it
      // was never touched by the second channel's rejection.
      await waitForEvent(firstStream, 'data', GENEROUS_MS);
      expect(firstClosed).toBe(false);
    } finally {
      client.end();
      await closeServer(server);
    }
  });
});

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
