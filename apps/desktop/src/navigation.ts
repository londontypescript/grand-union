/**
 * Whether the window may navigate (or be redirected) from the page it
 * started on, `startUrl`, to `targetUrl`: only within the same app.
 *
 * For the built app (`app://web/...`) that means the same scheme and host.
 * It can't be an origin comparison: Node's URL parser doesn't know `app:`
 * is a standard scheme, so `new URL('app://web/x').origin` is `"null"` and
 * would match nothing, not even the app itself. For the web dev server
 * (`http:`) it is the origin. Anything else, or a URL that doesn't parse,
 * is refused.
 */
export function isAllowedNavigation(targetUrl: string, startUrl: string): boolean {
  let target: URL;
  let start: URL;
  try {
    target = new URL(targetUrl);
    start = new URL(startUrl);
  } catch {
    return false;
  }

  if (start.protocol === 'http:') {
    return target.origin === start.origin;
  }
  if (start.protocol === 'app:') {
    return target.protocol === start.protocol && target.host === start.host;
  }
  return false;
}
