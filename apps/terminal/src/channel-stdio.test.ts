import { Duplex } from 'node:stream';
import type { ServerChannel } from 'ssh2';
import { describe, expect, it } from 'vitest';
import { toCrlf, toPtyStdio, type BacklogGuard } from './channel-stdio.ts';
import { FakeChannel } from './session-test-support.ts';

const MIB = 1024 * 1024;

/** A guard that records every overflow and reads a fixed connection queue length. */
function recordingGuard(connectionWritableLength = 0): BacklogGuard & { overflows: string[] } {
  const overflows: string[] = [];
  return {
    overflows,
    connectionWritableLength: () => connectionWritableLength,
    onOverflow: (source) => {
      overflows.push(source);
    },
  };
}

describe('toCrlf', () => {
  it('turns every bare LF into CRLF', () => {
    expect(toCrlf('a\nb\n\nc')).toBe('a\r\nb\r\n\r\nc');
  });

  it('leaves existing CRLF pairs alone', () => {
    expect(toCrlf('a\r\nb\n')).toBe('a\r\nb\r\n');
  });
});

describe('toPtyStdio', () => {
  it('sends what Ink writes to the channel with every LF as CRLF', () => {
    const channel = new FakeChannel();
    const stdio = toPtyStdio(
      channel as unknown as ServerChannel,
      { cols: 80, rows: 24 },
      recordingGuard(),
    );

    // Each form of `write` Ink or a stream helper may call.
    stdio.write('a\nb\n');
    stdio.write('c\n', 'utf8');
    stdio.write('d\n', () => undefined);

    expect(channel.text()).toBe('a\r\nb\r\nc\r\nd\r\n');
  });

  it('overflows on "channel" once more than 1 MiB waits in the channel itself', () => {
    const channel = new StalledChannel();
    const guard = recordingGuard();
    const stdio = toPtyStdio(channel as unknown as ServerChannel, { cols: 80, rows: 24 }, guard);

    const kibibyte = 'x'.repeat(1024);
    for (let written = 0; written < 1024; written += 1) {
      stdio.write(kibibyte);
    }
    expect(guard.overflows, 'no overflow with exactly 1 MiB waiting').toEqual([]);

    stdio.write('x');
    expect(guard.overflows, 'one "channel" overflow once more than 1 MiB waits').toEqual([
      'channel',
    ]);
  });

  it('overflows on "connection" when the socket queue passes 1 MiB though the channel is empty', () => {
    // A channel that drains every write (writableLength stays 0), but the
    // connection socket behind it is backed up past the bound.
    const channel = new FakeChannel();
    const guard = recordingGuard(MIB + 1);
    const stdio = toPtyStdio(channel as unknown as ServerChannel, { cols: 80, rows: 24 }, guard);

    stdio.write('x');

    expect(guard.overflows, 'one "connection" overflow').toEqual(['connection']);
  });

  it('writes nothing more once it has overflowed', () => {
    const channel = new StalledChannel();
    const guard = recordingGuard();
    const stdio = toPtyStdio(channel as unknown as ServerChannel, { cols: 80, rows: 24 }, guard);

    const kibibyte = 'x'.repeat(1024);
    for (let written = 0; written <= 1024; written += 1) {
      stdio.write(kibibyte);
    }
    const queuedAtOverflow = channel.writableLength;
    expect(guard.overflows, 'it has overflowed').toEqual(['channel']);

    expect(stdio.write('more'), 'a write after overflow is refused').toBe(false);
    expect(channel.writableLength, 'and nothing more is queued').toBe(queuedAtOverflow);
  });
});

/** A channel whose client grants no window credit: no write ever completes, so later ones queue. */
class StalledChannel extends Duplex {
  override _read(): void {
    // Nothing is read in this test.
  }

  override _write(): void {
    // Never calls back, as ssh2 doesn't while it waits for window credit.
  }
}
