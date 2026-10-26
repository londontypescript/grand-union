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
    const stdio = toPtyStdio(channel as unknown as ServerChannel, { cols: 80, rows: 24 });

    // Each form of `write` Ink or a stream helper may call.
    stdio.write('a\nb\n');
    stdio.write('c\n', 'utf8');
    stdio.write('d\n', () => undefined);

    expect(channel.text()).toBe('a\r\nb\r\nc\r\nd\r\n');
  });
});
