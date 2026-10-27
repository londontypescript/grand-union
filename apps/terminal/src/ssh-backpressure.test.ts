import { describe, expect, it } from 'vitest';
import {
  PAGE_TEXT,
  PTY,
  TEST_TIMEOUT_MS,
  setupSshTests,
  shell,
  until,
  waitForConnectionCount,
} from './ssh-client-support.ts';
import { sleep, startProxy } from './ssh-test-support.ts';

const { serve, serveServer, connect } = setupSshTests();

// Time for a client that stops reading to have its session torn down, with
// ten times the headroom the timing rule asks for. The server must first
// draw enough to fill the SSH window and then the 1 MiB queue; the TCP case
// (many small 500×200 frames while the socket backs up) is the slower of
// the two, measured at ~17.6 s locally, so the deadline is ~10× that.
const BACKLOG_MS = 180_000;

describe('a client that stops reading', { timeout: BACKLOG_MS + TEST_TIMEOUT_MS }, () => {
  it('has its shell ended, and the shell cap released, once 1 MiB of output waits for it', async () => {
    const port = await serve({ maxSessions: 1 });
    const watched = await shell(await connect(port), { term: 'xterm', cols: 500, rows: 24 });
    await until(watched, () => watched.text().includes(PAGE_TEXT));

    // From here on nothing is read: once 2 MiB sit unread, ssh2 stops giving
    // the server window credit, and what the server writes has to queue.
    watched.stream.pause();
    const deadline = Date.now() + BACKLOG_MS;
    let width = 500;
    while (watched.exitCode === undefined && Date.now() < deadline) {
      // Each resize makes the server draw the page again, about 2 KB of it.
      for (let i = 0; i < 10; i += 1) {
        width = width === 500 ? 400 : 500;
        watched.stream.setWindow(24, width, 0, 0);
      }
      await sleep(10);
    }

    expect(watched.exitCode, 'the exit status of the shell the client stopped reading').toBe(0);
    const next = await shell(await connect(port), PTY);
    await until(next, () => next.text().includes(PAGE_TEXT));
    expect(next.text(), 'a new shell, once that one has ended').not.toContain('at capacity');
  });
});

describe(
  'a client that stops reading at the TCP level',
  { timeout: BACKLOG_MS + TEST_TIMEOUT_MS },
  () => {
    it('has its connection destroyed and its slot freed once the socket queue passes the bound', async () => {
      const port = await serve({ maxSessions: 1 });
      const proxy = await startProxy(port);
      try {
        const watched = await shell(await connect(proxy.port), {
          term: 'xterm',
          cols: 500,
          rows: 200,
        });
        await until(watched, () => watched.text().includes(PAGE_TEXT));

        // Stop draining the server→client direction at the TCP level while
        // the SSH window stays open; keep sending resizes (client→server), so
        // the server keeps drawing into a socket whose queue now only grows.
        proxy.pauseFromServer();
        const deadline = Date.now() + BACKLOG_MS;
        let cols = 500;
        while (watched.ended === undefined && Date.now() < deadline) {
          for (let i = 0; i < 10; i += 1) {
            cols = cols === 500 ? 499 : 500;
            watched.stream.setWindow(200, cols, 0, 0);
          }
          await sleep(10);
        }

        expect(
          watched.ended,
          'the connection is torn down once its socket queue passes the bound',
        ).toBeDefined();

        // The slot is free: a fresh client, straight to the server, gets a shell.
        const next = await shell(await connect(port), PTY);
        await until(next, () => next.text().includes(PAGE_TEXT));
        expect(next.text(), 'the freed slot lets a new shell mount').not.toContain('at capacity');
      } finally {
        await proxy.close();
      }
    });
  },
);

describe(
  'a connection that completes the handshake but opens no shell',
  { timeout: TEST_TIMEOUT_MS },
  () => {
    it('has its slot freed after the grace, even if the client ignores the server close', async () => {
      const PRE_SHELL_MS = 200;
      const CLOSE_GRACE_MS = 300;
      // One connection slot, so a half-open one left holding it would lock
      // everyone out; the pre-shell end and its close grace are short here.
      const { server, port } = await serveServer({
        maxConnections: 1,
        preShellTimeoutMs: PRE_SHELL_MS,
        preShellCloseGraceMs: CLOSE_GRACE_MS,
      });
      const proxy = await startProxy(port);
      try {
        // A client that reaches `ready` and opens no shell, behind a proxy that
        // never forwards the server's FIN, so the socket would stay half-open.
        await connect(proxy.port);

        // The slot frees ~500 ms in (end + grace); poll well past that, but
        // inside the suite timeout, so a slot that never frees shows as a
        // non-zero count here rather than a Vitest timeout.
        const count = await waitForConnectionCount(server, 0, 10_000);

        expect(count, "the half-open connection's slot is freed").toBe(0);
      } finally {
        await proxy.close();
      }
    });
  },
);
