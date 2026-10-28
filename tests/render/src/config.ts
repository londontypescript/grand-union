import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePorts } from '../../../scripts/ports.ts';

/** Repo root, resolved relative to this file's own build location (`tests/render/src`). */
const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));
export const REPO_ROOT = join(SRC_DIR, '../../..');

/**
 * Where specs write screenshots. Defaults to a gitignored location so a
 * plain `pnpm test:render` run never dirties the tree (`docs/screenshots`
 * is committed). `pnpm screenshots:update` sets `LTS_SCREENSHOT_DIR` to
 * `docs/screenshots` to refresh that committed, curated set on purpose.
 */
const screenshotDirEnv = process.env['LTS_SCREENSHOT_DIR'];
export const SCREENSHOT_DIR = resolve(
  REPO_ROOT,
  screenshotDirEnv !== undefined && screenshotDirEnv !== ''
    ? screenshotDirEnv
    : 'tests/render/test-results/screenshots',
);

// Ports for `vite preview` of the two built apps under test, started by
// playwright.config.ts's `webServer` entries. They come from
// LTS_PORT_BASE (see scripts/ports.ts), so checkouts running the suite side
// by side each get their own pair.
const ports = resolvePorts(process.env);
export const WEB_PORT = ports.renderWeb;
export const SCENE_PORT = ports.renderScene;
export const WEB_URL = `http://localhost:${String(WEB_PORT)}`;
export const SCENE_URL = `http://localhost:${String(SCENE_PORT)}`;
