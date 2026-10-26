import { describe, expect, it } from 'vitest';
import { isVerticalAlign, VERTICAL_ALIGN } from './vertical-align.ts';

describe('isVerticalAlign', () => {
  it.each(VERTICAL_ALIGN)('accepts %s', (value) => {
    expect(isVerticalAlign(value)).toBe(true);
  });

  it.each(['left', 'center', '', 'TOP', undefined, null, 0, {}])('rejects %s', (value) => {
    expect(isVerticalAlign(value)).toBe(false);
  });
});
