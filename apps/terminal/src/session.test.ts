import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeSession, closeShell, type FakeChannel } from './session-test-support.ts';

// `session.ts`'s IDLE_TIMEOUT_MS, which it doesn't export.
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const GOODBYE = 'Goodbye from London TypeScript.';
// The page's quote: the capacity message also names London TypeScript.
const PAGE_TEXT = 'Write it once, render it everywhere.';

// Every shell a test opens, ended in `afterEach` so no Ink instance outlives it.
const open: FakeChannel[] = [];

function shellOn(session: FakeSession): FakeChannel {
  const channel = session.shell();
  open.push(channel);
  return channel;
}

afterEach(() => {
  for (const channel of open.splice(0)) {
    closeShell(channel);
  }
  vi.useRealTimers();
});

/**
 * Moves fake time on a minute at a time, letting promises settle between
 * steps, so every timer due along the way fires in order. Never
 * `runAllTimers`, which would also run Ink's own timers to exhaustion.
 */
async function advanceMinutes(minutes: number): Promise<void> {
  for (let step = 0; step < minutes; step += 1) {
    await vi.advanceTimersByTimeAsync(MINUTE_MS);
  }
}

describe('a shell left idle', () => {
  it('ends with the goodbye once the idle timeout passes with no input', async () => {
    vi.useFakeTimers();
    const channel = shellOn(new FakeSession());

    await advanceMinutes(IDLE_TIMEOUT_MS / MINUTE_MS - 1);
    expect(channel.text(), 'no goodbye before the idle timeout').not.toContain(GOODBYE);

    await advanceMinutes(2);
    expect(channel.text(), 'the goodbye once the idle timeout has passed').toContain(GOODBYE);
    expect(channel.exitCodes, 'exit status 0 once idle').toEqual([0]);
  });

  it('starts the idle timeout again on every input', async () => {
    vi.useFakeTimers();
    const channel = shellOn(new FakeSession());

    await advanceMinutes(9);
    channel.push(Buffer.from('x'));
    await advanceMinutes(9);
    expect(channel.text(), 'no goodbye 9 minutes after the last input').not.toContain(GOODBYE);

    await advanceMinutes(2);
    expect(channel.text(), 'the goodbye 11 minutes after the last input').toContain(GOODBYE);
  });
});

describe('the size a shell starts at', () => {
  it('is 80×24 when the client sent no pty-req', () => {
    const channel = shellOn(new FakeSession());

    expect({ columns: channel.columns, rows: channel.rows }).toEqual({ columns: 80, rows: 24 });
  });

  it('is 80×24 when the client reported a 0×0 pty', () => {
    const session = new FakeSession();
    expect(session.pty(0, 0), 'the 0×0 pty-req is accepted').toEqual({ accepted: 1, rejected: 0 });

    const channel = shellOn(session);

    expect({ columns: channel.columns, rows: channel.rows }).toEqual({ columns: 80, rows: 24 });
  });

  it('is the size the client reported in pty-req', () => {
    const session = new FakeSession();
    session.pty(100, 30);

    const channel = shellOn(session);

    expect({ columns: channel.columns, rows: channel.rows }).toEqual({ columns: 100, rows: 30 });
  });
});

// Past the 500×200 cap, but small enough that Ink can still draw it if the
// cap is missing: the billions of cells a client can ask for would take the
// test run down instead of failing these tests.
const PAST_THE_CAP = { cols: 1000, rows: 400 };

describe('a size past 500×200', () => {
  it('is cut to 500×200 when the client reports it in pty-req', () => {
    const session = new FakeSession();
    session.pty(PAST_THE_CAP.cols, PAST_THE_CAP.rows);

    const channel = shellOn(session);

    expect({ columns: channel.columns, rows: channel.rows }).toEqual({ columns: 500, rows: 200 });
  });

  it('is cut to 500×200 when the client reports it in window-change', () => {
    const session = new FakeSession();
    const channel = shellOn(session);

    session.windowChange(PAST_THE_CAP.cols, PAST_THE_CAP.rows);

    expect({ columns: channel.columns, rows: channel.rows }).toEqual({ columns: 500, rows: 200 });
  });
});

describe('a window-change to the size the shell already has', () => {
  // Ink lays the whole page out again on every resize event, even when the
  // frame it then draws is the one already on screen.
  it('is not passed on to Ink', () => {
    const session = new FakeSession();
    const channel = shellOn(session);
    let resizes = 0;
    channel.on('resize', () => {
      resizes += 1;
    });

    session.windowChange(0, 0);
    session.windowChange(80, 24);
    session.windowChange(120, 40);
    session.windowChange(120, 40);

    expect(resizes, 'resize events for 0×0 and 80×24 at 80×24, then 120×40 twice').toBe(1);
  });
});

describe('an env request that wants a reply', () => {
  it('is refused', () => {
    expect(new FakeSession().env('TEST', 'value')).toEqual({ accepted: 0, rejected: 1 });
  });
});

describe('a shell whose client set too small a maximum packet size', () => {
  // ssh2's Channel._write slices output by this size; 0 spins its loop
  // forever on the first write. Tested at the handler boundary, since the
  // ssh2 client can't declare a 0 packet size over the wire, and a
  // FakeChannel can't hang. 100 is below the floor, above 0.
  it('is refused before any output and takes no shell slot', () => {
    const session = new FakeSession({ maxSessions: 1 });

    const refused = session.shell(100);
    expect(refused.text(), 'nothing is written to a channel with too small a packet size').toBe('');
    expect(refused.closedByServer, 'the channel is closed').toBe(true);

    // The slot it would have taken is still free.
    expect(shellOn(session).text(), 'a normal shell still mounts').toContain(PAGE_TEXT);
  });
});
