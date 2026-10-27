import { extname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { app, BrowserWindow, protocol } from 'electron';
import { isAllowedNavigation } from './navigation.ts';
import { APP_HOST, APP_SCHEME, resolveAppPath } from './resolve-app-path.ts';
import { resolveStartUrl } from './start-url.ts';

// Mirrors renderer-dom's page background (packages/renderer-dom/src/styles.css)
// and `.lts-stack`'s CSS background. Hardcoded here, not imported, because
// the Electron shell must not depend on any renderer package — see
// docs/architecture.md's dependency direction (apps depend on a renderer,
// never the other way; `@lts/desktop` isn't a renderer consumer at all, it
// only loads the *built* dom bundle at runtime).
const BACKGROUND_COLOR = '#0b0f19';
const WINDOW_TITLE = 'London TypeScript';

// The built `@lts/web` bundle is served under `app://web/` (APP_SCHEME and
// APP_HOST). Chosen over `loadFile('.../index.html')` (a `file://` URL)
// because Chromium gives `file://` documents an opaque `'null'` origin, and
// refuses to fetch an ES module script (`<script type="module">`, what
// `@lts/web`'s Vite build emits) over `file://` at all — module fetches
// always run in `cors` mode, which has no origin to check `file://` against.
// A registered "standard" scheme instead gives the loaded page a real,
// non-opaque origin (`app://web`), so the module script loads normally with
// no change to `@lts/web`'s own build. `apps/web/dist` is served as-is; a
// plain browser hitting it via `vite preview` or a static host never sees
// `app://` at all.
const APP_START_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

// Directory `@lts/web`'s build writes to. Resolved relative to the *built*
// main process (`apps/desktop/dist/main.js`, so `__dirname` here is
// `apps/desktop/dist`) — `../../web/dist` from there is `apps/web/dist`.
const WEB_DIST = join(__dirname, '../../web/dist');

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function mimeType(path: string): string {
  return MIME_TYPES[extname(path)] ?? 'application/octet-stream';
}

/** Logs why the shell can't go on, and exits 1. */
function fail(message: string): void {
  process.stderr.write(`desktop: ${message}\n`);
  app.exit(1);
}

/**
 * Serves `apps/web/dist` over `app://web/...`. Registered as a "standard,
 * secure" scheme below, which is what gives it a real origin instead of
 * `file://`'s opaque one — see the comment on `APP_START_URL` above. Path
 * resolution and containment live in `resolve-app-path.ts`; only the path
 * it returns is read, and a failed read is a 404 that doesn't echo it.
 */
async function handleAppRequest(request: Request): Promise<Response> {
  const resolved = resolveAppPath(request.url, WEB_DIST);
  if (!resolved.ok) {
    return new Response(resolved.reason, { status: resolved.status });
  }

  try {
    const contents = await readFile(resolved.filePath);
    return new Response(new Uint8Array(contents), {
      headers: { 'Content-Type': mimeType(resolved.filePath) },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function createWindow(startUrl: string): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: BACKGROUND_COLOR,
    title: WINDOW_TITLE,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The loaded page is a static built React app with no reason to open new
  // windows; deny every request rather than special-case allowed targets.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Keep the window on the app it started on: a stray link, or a server
  // redirect, leaving the app is blocked (see navigation.ts).
  const keepOnApp = (event: { readonly url: string; preventDefault(): void }): void => {
    if (!isAllowedNavigation(event.url, startUrl)) {
      event.preventDefault();
    }
  };
  window.webContents.on('will-navigate', keepOnApp);
  window.webContents.on('will-redirect', keepOnApp);

  // A page that doesn't load leaves an empty window: say why and exit
  // rather than drop the rejection.
  window.loadURL(startUrl).catch((error: unknown) => {
    fail(`could not load ${startUrl}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

const start = resolveStartUrl(process.argv, APP_START_URL);
if (start.ok) {
  // Must run before `app.whenReady()` — Electron only honours scheme
  // privileges registered at module load, before the app is ready.
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);

  void app.whenReady().then(() => {
    protocol.handle(APP_SCHEME, (request) => handleAppRequest(request));
    createWindow(start.url);
  });

  // A single-window utility shell, not a full desktop app — quits on every
  // platform rather than following macOS's stay-alive-with-no-windows
  // convention. Reconsider if the shell grows a menu bar or more than one window.
  app.on('window-all-closed', () => {
    app.quit();
  });
} else {
  fail(start.reason);
}
