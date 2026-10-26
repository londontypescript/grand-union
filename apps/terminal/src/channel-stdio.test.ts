import { describe, expect, it } from 'vitest';
import { toCrlf } from './channel-stdio.ts';

describe('toCrlf', () => {
  it('turns every bare LF into CRLF', () => {
    expect(toCrlf('a\nb\n\nc')).toBe('a\r\nb\r\n\r\nc');
  });

  it('leaves existing CRLF pairs alone', () => {
    expect(toCrlf('a\r\nb\n')).toBe('a\r\nb\r\n');
  });
});
