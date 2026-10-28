import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { REPO_ROOT, SCREENSHOT_DIR } from './config.ts';

const MAIN_PATH = join(REPO_ROOT, 'apps/desktop/dist/main.js');

// What the shell loads when no `--lts-web-url` is given (apps/desktop's
// main.ts). Restated rather than imported: the title and the header alone
// can't tell the built bundle over `app://` from an http copy of it, so the
// URL is the claim under test, and a test that imported it would agree with
// any change to it.
const APP_START_URL = 'app://web/index.html';

/**
 * The Electron binary `@lts/desktop` depends on. The root doesn't depend on
 * Electron, so Playwright's own lookup (`require('electron')` from inside
 * playwright-core) can't be relied on to find it; resolving from
 * apps/desktop's package.json finds the same one `pnpm dev:desktop` runs.
 * Electron's package exports the binary's path, and downloads the binary
 * first if it isn't there yet.
 */
function electronExecutable(): string {
  const requireFromDesktop = createRequire(join(REPO_ROOT, 'apps/desktop/package.json'));
  const executablePath: unknown = requireFromDesktop('electron');
  if (typeof executablePath !== 'string') {
    throw new Error(`the electron package exported ${typeof executablePath}, not a path`);
  }
  return executablePath;
}

test('desktop window loads the web build over app:// with the right title and header', async () => {
  const electronApp = await electron.launch({
    executablePath: electronExecutable(),
    args: [
      MAIN_PATH,
      // Electron's Chromium sandbox needs a setuid-root helper or
      // unprivileged user namespaces, neither safe to assume inside a CI
      // container under `xvfb-run` — so `--no-sandbox` applies on Linux only,
      // and only to this test's own launch, never to how `@lts/desktop`
      // itself ships or is documented to run.
      ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    ],
  });

  // Closed whatever the assertions do, so a failing one doesn't leave
  // Electron running.
  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    expect(window.url()).toBe(APP_START_URL);
    expect(await window.title()).toBe('London TypeScript');
    await expect(window.locator('h1')).toHaveText('London TypeScript');

    await window.screenshot({ path: join(SCREENSHOT_DIR, 'desktop.png') });
  } finally {
    await electronApp.close();
  }
});
