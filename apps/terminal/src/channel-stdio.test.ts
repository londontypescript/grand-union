import { Duplex } from 'node:stream';
import type { ServerChannel } from 'ssh2';
import { describe, expect, it } from 'vitest';
import { toCrlf, toPtyStdio, type BacklogGuard } from './channel-stdio.ts';
import { FakeChannel } from './session-test-support.ts';

const MIB = 1024 * 1024;

/** A guard that counts overflows and reads a fixed connection queue length. */
function recordingGuard(connectionWritableLength = 0): BacklogGuard & { count: () => number } {
  let overflows = 0;
  return {
    count: () => overflows,
    connectionWritableLength: () => connectionWritableLength,
    onOverflow: () => {
      overflows += 1;
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

  it('overflows once more than 1 MiB waits in the channel itself', () => {
    const channel = new StalledChannel();
    const guard = recordingGuard();
    const stdio = toPtyStdio(channel as unknown as ServerChannel, { cols: 80, rows: 24 }, guard);

    const kibibyte = 'x'.repeat(1024);
    for (let written = 0; written < 1024; written += 1) {
      stdio.write(kibibyte);
    }
    expect(guard.count(), 'no overflow with exactly 1 MiB waiting').toBe(0);

    stdio.write('x');
    expect(guard.count(), 'one overflow once more than 1 MiB waits in the channel').toBe(1);
  });

  it('overflows when the socket queue passes 1 MiB though the channel is empty', () => {
    // A channel that drains every write (writableLength stays 0), but the
    // connection socket behind it is backed up past the bound.
    const channel = new FakeChannel();
    const guard = recordingGuard(MIB + 1);
    const stdio = toPtyStdio(channel as unknown as ServerChannel, { cols: 80, rows: 24 }, guard);

    stdio.write('x');

    expect(guard.count(), 'one overflow from the connection socket').toBe(1);
  });

  it('writes nothing more, but settles later callbacks, once it has overflowed', async () => {
    const channel = new StalledChannel();
    const guard = recordingGuard();
    const stdio = toPtyStdio(channel as unknown as ServerChannel, { cols: 80, rows: 24 }, guard);

    const kibibyte = 'x'.repeat(1024);
    for (let written = 0; written <= 1024; written += 1) {
      stdio.write(kibibyte);
    }
    const queuedAtOverflow = channel.writableLength;
    expect(guard.count(), 'it has overflowed').toBe(1);

    expect(stdio.write('more'), 'a write after overflow is refused').toBe(false);
    expect(channel.writableLength, 'and nothing more is queued').toBe(queuedAtOverflow);

    // A dropped write still settles its callback, so Ink's unmount barrier
    // (which waits on one) isn't left hanging behind the stalled channel.
    const settled = await new Promise<boolean>((resolve) => {
      stdio.write('later', () => {
        resolve(true);
      });
      queueMicrotask(() => {
        setTimeout(() => {
          resolve(false);
        }, 0);
      });
    });
    expect(settled, "a dropped write's callback is called").toBe(true);
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
