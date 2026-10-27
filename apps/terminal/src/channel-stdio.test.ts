import { Duplex } from 'node:stream';
import type { ServerChannel } from 'ssh2';
import { describe, expect, it } from 'vitest';
import { toCrlf, toPtyStdio } from './channel-stdio.ts';
import { FakeChannel } from './session-test-support.ts';

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
    const stdio = toPtyStdio(channel as unknown as ServerChannel, { cols: 80, rows: 24 }, () => {
      // Nothing waits in this channel.
    });

    // Each form of `write` Ink or a stream helper may call.
    stdio.write('a\nb\n');
    stdio.write('c\n', 'utf8');
    stdio.write('d\n', () => undefined);

    expect(channel.text()).toBe('a\r\nb\r\nc\r\nd\r\n');
  });

  it('reports a backlog once more than 1 MiB waits in the channel', () => {
    const channel = new StalledChannel();
    let backlogs = 0;
    const stdio = toPtyStdio(channel as unknown as ServerChannel, { cols: 80, rows: 24 }, () => {
      backlogs += 1;
    });

    const kibibyte = 'x'.repeat(1024);
    for (let written = 0; written < 1024; written += 1) {
      stdio.write(kibibyte);
    }
    expect(backlogs, 'backlogs reported with exactly 1 MiB waiting').toBe(0);

    stdio.write('x');
    expect(backlogs, 'backlogs reported once more than 1 MiB waits').toBe(1);
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
