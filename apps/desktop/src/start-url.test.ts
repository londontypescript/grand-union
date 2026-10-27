import { describe, expect, it } from 'vitest';
import { resolveStartUrl } from './start-url.ts';

const APP_URL = 'app://web/index.html';
const ELECTRON = ['/path/to/electron', 'dist/main.js'];

function refused(): unknown {
  return { ok: false, reason: expect.any(String) as unknown };
}

describe('resolveStartUrl', () => {
  it('loads the built app when the launcher passed no dev URL', () => {
    expect(resolveStartUrl(ELECTRON, APP_URL)).toEqual({ ok: true, url: APP_URL });
  });

  it.each(['http://localhost:6400/', 'http://127.0.0.1:6400/'])(
    'loads the dev server at %s',
    (url) => {
      expect(resolveStartUrl([...ELECTRON, `--lts-web-url=${url}`], APP_URL)).toEqual({
        ok: true,
        url,
      });
    },
  );

  it.each([
    ['https', 'https://localhost:6400/'],
    ['another host', 'http://example.com/'],
    ['a host that only starts with localhost', 'http://localhost.example.com/'],
    ['a malformed URL', 'not a url'],
    ['an empty value', ''],
  ])('refuses %s', (_label, url) => {
    expect(resolveStartUrl([...ELECTRON, `--lts-web-url=${url}`], APP_URL)).toEqual(refused());
  });

  it('refuses two dev URLs rather than picking one', () => {
    const argv = [
      ...ELECTRON,
      '--lts-web-url=http://localhost:6400/',
      '--lts-web-url=http://localhost:6401/',
    ];
    expect(resolveStartUrl(argv, APP_URL)).toEqual(refused());
  });
});
