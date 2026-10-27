// Which URL the window loads first. Normally the built app over `app://`;
// only `pnpm dev:desktop` (scripts/dev-desktop.ts) points it at the web dev
// server, by passing `--lts-web-url=<url>` on Electron's command line.
//
// The dev URL comes from that argument alone, never from the environment,
// so a stray variable in the shell can't send `pnpm start` somewhere else.
// And it must be plain http on this machine: the dev server is local, and
// anything else is a mistake or an attempt to load a remote page into the
// shell.

const DEV_URL_FLAG = '--lts-web-url=';
const LOOPBACK_HOSTS: readonly string[] = ['localhost', '127.0.0.1'];

export type StartUrl =
  { readonly ok: true; readonly url: string } | { readonly ok: false; readonly reason: string };

/** The dev server's URL from `argv` when the launcher passed one, else
 * `appUrl`; or why the argument is refused. */
export function resolveStartUrl(argv: readonly string[], appUrl: string): StartUrl {
  const devUrls = argv
    .filter((arg) => arg.startsWith(DEV_URL_FLAG))
    .map((arg) => arg.slice(DEV_URL_FLAG.length));

  const [raw, ...rest] = devUrls;
  if (raw === undefined) {
    return { ok: true, url: appUrl };
  }
  if (rest.length > 0) {
    return { ok: false, reason: `${DEV_URL_FLAG}<url> was given more than once` };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: `${DEV_URL_FLAG}"${raw}" is not a URL` };
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.includes(url.hostname)) {
    return {
      ok: false,
      reason: `${DEV_URL_FLAG}"${raw}" must be http on localhost or 127.0.0.1`,
    };
  }
  return { ok: true, url: url.href };
}
