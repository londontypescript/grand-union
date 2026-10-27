import { isAbsolute, join, normalize, relative, sep } from 'node:path';

// The scheme and host the built `@lts/web` bundle is served under (see
// main.ts for why it's a custom scheme rather than `file://`). Only requests
// for exactly this origin are served.
export const APP_SCHEME = 'app';
export const APP_HOST = 'web';

/** A request URL resolved to a file inside `rootDir`, safe to read. */
interface ResolvedAppPath {
  readonly ok: true;
  readonly filePath: string;
}

/** A request URL that must not be served, and the status it maps to. */
interface RejectedAppPath {
  readonly ok: false;
  readonly status: 400 | 403;
  readonly reason: string;
}

export type AppPathResult = ResolvedAppPath | RejectedAppPath;

/**
 * Maps a request URL to a file under `rootDir`, or rejects it. Pure and
 * electron-free so it can be unit-tested directly; `main.ts` turns a
 * rejection into an HTTP-style response.
 *
 * Containment is lexical, by path segment: the decoded path must stay under
 * `rootDir` once joined and normalized. It doesn't resolve symlinks, so it
 * assumes `rootDir` is trusted build output: a symlink placed inside it
 * could point outside, and reading the returned path would follow it.
 */
export function resolveAppPath(requestUrl: string, rootDir: string): AppPathResult {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return { ok: false, status: 400, reason: 'malformed request URL' };
  }

  // Only the app's own origin is served. `host` rather than `hostname`, so
  // `app://web:1/` (a port) is refused too.
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) {
    return { ok: false, status: 403, reason: 'not the app origin' };
  }

  let decodedPath: string;
  try {
    // Decode once, before any routing decision: deciding on the still-encoded
    // pathname (or decoding twice) is how an escape like `..%2Fdist-x` slips
    // past a check that only sees the literal text `..%2F`.
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return { ok: false, status: 400, reason: 'malformed percent-encoding' };
  }

  const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath;
  const root = normalize(rootDir);
  const filePath = normalize(join(root, requestedPath));

  // `path.relative` is separator-aware, unlike `startsWith(root)`: a sibling
  // directory such as `dist-x` shares `dist`'s prefix as a string but not as
  // a path, so relative() correctly walks it out via a leading `..`.
  const rel = relative(root, filePath);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return { ok: false, status: 403, reason: 'outside the web root' };
  }

  return { ok: true, filePath };
}
