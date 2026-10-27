import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppPath } from './resolve-app-path.ts';

// Absolute, so every expected path below is the same on any platform.
const ROOT = resolve('/apps', 'web', 'dist');

function served(...segments: string[]): ReturnType<typeof resolveAppPath> {
  return { ok: true, filePath: join(ROOT, ...segments) };
}

function refused(status: 400 | 403): unknown {
  return { ok: false, status, reason: expect.any(String) as unknown };
}

describe('resolveAppPath', () => {
  it('maps the root to index.html', () => {
    expect(resolveAppPath('app://web/', ROOT)).toEqual(served('index.html'));
  });

  it('resolves a normal asset', () => {
    expect(resolveAppPath('app://web/assets/app.js', ROOT)).toEqual(served('assets', 'app.js'));
  });

  it('decodes the path, so an encoded space names the file with a space', () => {
    expect(resolveAppPath('app://web/assets/a%20b.js', ROOT)).toEqual(served('assets', 'a b.js'));
  });

  it('rejects the ..%2Fdist-x sibling-prefix escape', () => {
    // Decodes to `/../dist-x/f`, which resolves to a directory that merely
    // starts with `dist` as a string, not one under it: exactly what
    // `startsWith(root)` with no separator let through.
    expect(resolveAppPath('app://web/..%2Fdist-x/f', ROOT)).toEqual(refused(403));
  });

  it('leaves plain .. traversal under the root (the URL parser already collapses it)', () => {
    // `new URL()` normalizes a literal `..` path segment before this module
    // ever sees it, so the request never gets a chance to climb above ROOT.
    expect(resolveAppPath('app://web/../../etc/passwd', ROOT)).toEqual(served('etc', 'passwd'));
  });

  it('rejects an encoded traversal', () => {
    // `%2F` (an encoded slash) survives URL parsing undecoded, unlike a
    // literal `..` segment, so the escape only appears once this module
    // decodes it. That is why containment is checked after decoding, not
    // left to the URL parser.
    expect(resolveAppPath('app://web/..%2F..%2Fetc/passwd', ROOT)).toEqual(refused(403));
  });

  it('decodes once, not twice: ..%252Fx names a file literally called ..%2Fx', () => {
    // Decoding a second time would turn `%2F` into a slash and the request
    // into `/../x`, outside the root.
    expect(resolveAppPath('app://web/..%252Fx', ROOT)).toEqual(served('..%2Fx'));
  });

  it('rejects a malformed escape with a 400 result, not a throw', () => {
    expect(() => resolveAppPath('app://web/%E0%A4%A', ROOT)).not.toThrow();
    expect(resolveAppPath('app://web/%E0%A4%A', ROOT)).toEqual(refused(400));
  });

  it('keeps an absolute-looking request path under the root', () => {
    // A leading `/` in the request must never be treated the way
    // `path.resolve` would treat it (discarding ROOT entirely); joining
    // keeps it as a relative segment under ROOT instead.
    expect(resolveAppPath('app://web//etc/passwd', ROOT)).toEqual(served('etc', 'passwd'));
  });

  it('rejects another host on the app scheme', () => {
    expect(resolveAppPath('app://other/index.html', ROOT)).toEqual(refused(403));
  });

  it('rejects another scheme with the app host', () => {
    expect(resolveAppPath('http://web/index.html', ROOT)).toEqual(refused(403));
  });
});
