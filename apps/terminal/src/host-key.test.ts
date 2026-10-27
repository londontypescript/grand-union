import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateHostKey, loadOrCreateHostKey } from './host-key.ts';

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

describe('loadOrCreateHostKey', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'terminal-host-key-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws naming the file when what it holds is not a private key', () => {
    const keyPath = path.join(dir, 'host_ed25519');
    writeFileSync(keyPath, 'not a valid key');

    expect(() => loadOrCreateHostKey(keyPath)).toThrow(
      `Host key at ${keyPath} is not a valid private key`,
    );
  });

  it('generates a missing key under a missing directory, readable only by its owner, then reads the same key back', () => {
    const keyPath = path.join(dir, 'missing', 'host_ed25519');

    const created = loadOrCreateHostKey(keyPath);

    expect(statSync(keyPath).mode & 0o777, 'file mode').toBe(0o600);
    expect(loadOrCreateHostKey(keyPath), 'the key read back on the second call').toBe(created);
  });
});
