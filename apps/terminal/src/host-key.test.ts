import { describe, expect, it } from 'vitest';
import { generateHostKey } from './host-key.ts';

describe('generateHostKey', () => {
  it('retries once the generator produces an unparseable key', () => {
    const goodKey = generateHostKey();
    let calls = 0;

    const key = generateHostKey(() => {
      calls += 1;
      return calls === 1 ? 'not a valid key' : goodKey;
    });

    expect(key).toBe(goodKey);
    expect(calls).toBe(2);
  });

  it('throws once a generator that never produces a valid key exhausts its attempts', () => {
    expect(() => generateHostKey(() => 'not a valid key')).toThrow(/host key/i);
  });
});
