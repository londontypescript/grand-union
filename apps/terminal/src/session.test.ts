import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeSession, closeShell, type FakeChannel } from './session-test-support.ts';

// `session.ts`'s IDLE_TIMEOUT_MS, which it doesn't export.
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const GOODBYE = 'Goodbye from London TypeScript.';

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

describe('an env request that wants a reply', () => {
  it('is refused', () => {
    expect(new FakeSession().env('TEST', 'value')).toEqual({ accepted: 0, rejected: 1 });
  });
});
