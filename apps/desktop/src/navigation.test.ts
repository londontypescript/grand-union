import { describe, expect, it } from 'vitest';
import { isAllowedNavigation } from './navigation.ts';

const APP_START = 'app://web/index.html';
const DEV_START = 'http://localhost:6400/';

describe('isAllowedNavigation from the built app', () => {
  it('allows another page of the app', () => {
    expect(isAllowedNavigation('app://web/x', APP_START)).toBe(true);
  });

  it.each([
    ['another host on the app scheme', 'app://other/'],
    ['a website', 'https://example.com/'],
    ['a local file', 'file:///etc/passwd'],
  ])('refuses %s', (_label, target) => {
    expect(isAllowedNavigation(target, APP_START)).toBe(false);
  });
});

describe('isAllowedNavigation from the web dev server', () => {
  it('allows the same origin', () => {
    expect(isAllowedNavigation('http://localhost:6400/about', DEV_START)).toBe(true);
  });

  it('refuses another port', () => {
    expect(isAllowedNavigation('http://localhost:6401/', DEV_START)).toBe(false);
  });

  it('refuses the built app', () => {
    expect(isAllowedNavigation('app://web/index.html', DEV_START)).toBe(false);
  });
});

describe('isAllowedNavigation with a URL that does not parse', () => {
  it('refuses it', () => {
    expect(isAllowedNavigation('not a url', APP_START)).toBe(false);
  });
});
