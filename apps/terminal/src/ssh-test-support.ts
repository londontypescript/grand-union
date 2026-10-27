import { EventEmitter } from 'node:events';
import net, { type AddressInfo, type Server as NetServer } from 'node:net';
import type { Client as SshClient } from 'ssh2';

export { generateHostKey } from './host-key.ts';

export const HOST = '127.0.0.1';

/** A logger that discards every line — tests don't want connect/disconnect noise. */
export const NOOP_LOG = (): void => {
  // no-op
};

export function listen(server: NetServer): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, HOST, () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

// How long a test's server may take to close once the test has destroyed
// every client and socket it opened: far longer than closing takes, short
// enough that a connection left open fails the test instead of hanging it.
const CLOSE_TIMEOUT_MS = 5000;

export function closeServer(server: NetServer): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `timed out closing the server after ${String(CLOSE_TIMEOUT_MS)}ms: a connection is still open`,
        ),
      );
    }, CLOSE_TIMEOUT_MS);
    server.close((error) => {
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A TCP proxy in front of the server, for the two things a real `ssh2`
 * client can't do on its own:
 *
 * - **Stop reading at the TCP level** while the SSH window stays open
 *   (`pauseFromServer`): it stops draining the server→client direction, so
 *   the server's own socket queue grows. The client→server direction keeps
 *   flowing, so the client can still send resizes that make the server draw.
 * - **Ignore the server's half-close:** a FIN from either side is never
 *   forwarded and the upstream socket is `allowHalfOpen`, so when the server
 *   `end()`s a connection the server's socket stays open until the test
 *   tears the proxy down — a client that never lets go.
 *
 * Every socket it opens is destroyed by {@link TestProxy.close}.
 */
export interface TestProxy {
  readonly port: number;
  pauseFromServer: () => void;
  close: () => Promise<void>;
}

export function startProxy(targetPort: number): Promise<TestProxy> {
  const pairs: { client: net.Socket; upstream: net.Socket }[] = [];
  let paused = false;

  const forward = (from: net.Socket, to: net.Socket, gated: boolean): void => {
    from.on('data', (chunk: Buffer) => {
      if (gated && paused) {
        return;
      }
      if (!to.destroyed) {
        to.write(chunk);
      }
    });
  };

  const server = net.createServer((client) => {
    const upstream = net.connect({ host: HOST, port: targetPort, allowHalfOpen: true });
    pairs.push({ client, upstream });
    forward(client, upstream, false);
    forward(upstream, client, true);
    // A FIN is deliberately not forwarded (no `end` re-emit), so neither peer
    // learns the other half-closed; the server's own 5 s grace is what the
    // half-open test relies on. The server destroying its socket does reach
    // the client, so it sees the connection drop.
    upstream.on('close', () => client.destroy());
    const ignore = (): void => {
      // Errors on teardown are expected; `close()` cleans the sockets up.
    };
    client.on('error', ignore);
    upstream.on('error', ignore);
  });

  return new Promise((resolve) => {
    server.listen(0, HOST, () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        pauseFromServer: () => {
          paused = true;
          for (const { upstream } of pairs) {
            upstream.pause();
          }
        },
        close: () =>
          new Promise((done) => {
            for (const { client, upstream } of pairs) {
              client.destroy();
              upstream.destroy();
            }
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}

/** Connects `client` and resolves once it reaches `ready`, without opening any channel. */
export function connectReady(client: SshClient, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    client.on('error', reject);
    client.on('ready', () => {
      resolve();
    });
    client.connect({ host: HOST, port, username: 'test', password: 'test', readyTimeout: 5000 });
  });
}

/**
 * Races `event` on `emitter` against a timeout, so a limit that fails to
 * fire times out the test instead of hanging it — every wait in
 * `ssh-limits.test.ts` goes through this rather than a bare sleep.
 */
export function waitForEvent(
  emitter: EventEmitter,
  event: string,
  timeoutMs: number,
): Promise<void> {
  // Made here, not when the timer fires, so its stack names the test line
  // that waited: a test with several waits on one event shows which failed.
  const timedOut = new Error(`timed out waiting for "${event}" after ${String(timeoutMs)}ms`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(timedOut);
    }, timeoutMs);
    emitter.once(event, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
