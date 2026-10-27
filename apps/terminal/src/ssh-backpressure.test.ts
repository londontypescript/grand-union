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

const { serveServer, connect } = setupSshTests();

// The page's header; unlike the quote, the capacity notice doesn't contain
// it, so a replacement shell showing it really rendered the page.
const HEADER_TEXT = 'London TypeScript';

// The socket-overflow teardown must fill the SSH window and then the 1 MiB
// queue — many small 500×200 frames while the socket backs up — measured at
// ~17.6 s locally, so the deadline is ~10×.
const BACKLOG_MS = 180_000;

// The channel-overflow teardown is prompt (the connection is destroyed, ~6 s
// including the flood). This deadline sits well below the ~60 s that the
// bug's slow fallback close takes without the fix, so the fix's prompt
// teardown is what the test proves, not that slow path.
const CHANNEL_TEARDOWN_MS = 45_000;

describe(
  'a client that stops reading its SSH channel',
  { timeout: CHANNEL_TEARDOWN_MS + TEST_TIMEOUT_MS },
  () => {
    it('has the whole connection destroyed and its slot freed once 1 MiB waits in the channel', async () => {
      const { server, port } = await serveServer({ maxSessions: 1, maxConnections: 1 });
      const watched = await shell(await connect(port), { term: 'xterm', cols: 500, rows: 24 });
      await until(watched, () => watched.text().includes(PAGE_TEXT));

      // The client stops reading the channel, so ssh2 stops granting the
      // server window credit and the server's writes queue in the channel.
      watched.stream.pause();
      const deadline = Date.now() + CHANNEL_TEARDOWN_MS;
      let width = 500;
      while (watched.ended === undefined && Date.now() < deadline) {
        for (let i = 0; i < 10; i += 1) {
          width = width === 500 ? 400 : 500;
          watched.stream.setWindow(24, width, 0, 0);
        }
        await sleep(10);
      }

      expect(
        watched.ended,
        'the connection is torn down when the channel queue overflows',
      ).toBeDefined();
      // The slot is freed: the connection count falls back to 0 and a fresh
      // client gets the real page, not the capacity notice.
      expect(await waitForConnectionCount(server, 0, TEST_TIMEOUT_MS), 'the slot is freed').toBe(0);
      const next = await shell(await connect(port), PTY);
      await until(next, () => next.text().includes(HEADER_TEXT));
      expect(next.text(), 'a new shell renders the page, not the capacity notice').toContain(
        HEADER_TEXT,
      );
      expect(next.text()).not.toContain('at capacity');
    });
  },
);

describe(
  'a client that stops reading at the TCP level',
  { timeout: BACKLOG_MS + TEST_TIMEOUT_MS },
  () => {
    it('has the connection destroyed by the socket-overflow path, and its slot freed', async () => {
      // Deadlines far beyond the test's own window, so no unrelated timer
      // (handshake, pre-shell) can tear the connection down and mask a broken
      // socket bound; only the 1 MiB socket queue can end this connection.
      const { server, port } = await serveServer({
        maxSessions: 1,
        maxConnections: 1,
        handshakeTimeoutMs: 600_000,
        preShellTimeoutMs: 600_000,
      });
      const proxy = await startProxy(port);
      try {
        const watched = await shell(await connect(proxy.port), {
          term: 'xterm',
          cols: 500,
          rows: 200,
        });
        await until(watched, () => watched.text().includes(PAGE_TEXT));

        // Stop draining server→client at the TCP level. The SSH window still
        // has credit (it is larger than the 1 MiB socket bound), so the
        // channel never backs up — only the socket queue grows — and resizes
        // (client→server) keep the server drawing into it.
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

        // Destroyed, not gracefully closed: the backed-up socket is reset, so
        // the client sees a failure rather than a goodbye-then-close.
        expect(watched.ended, 'the connection is torn down').toBeDefined();
        expect(watched.ended, 'it was destroyed (a reset), i.e. the socket-overflow path').toMatch(
          /failed/,
        );
        expect(await waitForConnectionCount(server, 0, TEST_TIMEOUT_MS), 'the slot is freed').toBe(
          0,
        );

        // A fresh client, straight to the server, gets the real page.
        const next = await shell(await connect(port), PTY);
        await until(next, () => next.text().includes(HEADER_TEXT));
        expect(next.text(), 'the freed slot lets a new shell render the page').toContain(
          HEADER_TEXT,
        );
        expect(next.text()).not.toContain('at capacity');
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
