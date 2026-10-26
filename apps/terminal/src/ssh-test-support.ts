import { EventEmitter } from 'node:events';
import type { AddressInfo, Server as NetServer } from 'node:net';
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
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for "${event}" after ${String(timeoutMs)}ms`));
    }, timeoutMs);
    emitter.once(event, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
