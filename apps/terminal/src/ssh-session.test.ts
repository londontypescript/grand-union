import type { ClientChannel } from 'ssh2';
import { describe, expect, it } from 'vitest';
import {
  PAGE_TEXT,
  PTY,
  TEST_TIMEOUT_MS,
  setupSshTests,
  shell,
  until,
} from './ssh-client-support.ts';
import { sleep } from './ssh-test-support.ts';

const { serve, connect } = setupSshTests();

// How long a shell is watched for a quit it mustn't make: a quitting byte
// ends the session within a few milliseconds.
const QUIET_MS = 1000;

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
