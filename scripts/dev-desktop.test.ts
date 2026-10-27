import { describe, expect, it } from 'vitest';

import { devDesktop, type LauncherDeps } from './dev-desktop.ts';

const ENV = { LTS_PORT_BASE: '6400' };
const WEB_URL = 'http://localhost:6400/';
const MESSAGE = 'start `pnpm dev:web` first (expected it on port 6400)';

const BUILD = ['pnpm', ['--filter', '@lts/desktop', 'build']];
const ELECTRON = [
  'pnpm',
  ['--filter', '@lts/desktop', 'exec', 'electron', 'dist/main.js', `--lts-web-url=${WEB_URL}`],
];

type Fetch = LauncherDeps['fetch'];

/** A web server answering every request with `status`. Like the real
 * fetch, it follows a redirect unless told `redirect: 'manual'`. */
function answering(status: number): Fetch {
  return (url, init) => {
    expect(url).toBe(WEB_URL);
    const followed = status >= 300 && status < 400 && init.redirect !== 'manual';
    return Promise.resolve(new Response(null, { status: followed ? 200 : status }));
  };
}

const refusing: Fetch = () =>
  Promise.reject(new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') }));

/** A server that accepts the connection and never answers: only the
 * request's own signal ends the wait. */
const hanging: Fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    const signal = init.signal;
    signal?.addEventListener('abort', () => {
      reject(signal.reason as Error);
    });
  });

interface Launch {
  readonly code: number;
  readonly runs: unknown[];
  readonly stderr: string;
}

/** Runs the launcher with `fetch`, each child exiting with the next of
 * `exitCodes` (or throwing, for a spawn error). */
async function launch(fetch: Fetch, exitCodes: (number | Error)[] = []): Promise<Launch> {
  const runs: unknown[] = [];
  let stderr = '';
  const code = await devDesktop({
    env: ENV,
    fetch,
    run: (command, args) => {
      runs.push([command, args]);
      const next = exitCodes.shift() ?? 0;
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, runs, stderr };
}

describe('devDesktop probe', () => {
  it.each([
    ['a refused connection', refusing],
    ['a redirect', answering(302)],
    ['a server error', answering(500)],
  ])('fails on %s with the message, running nothing', async (_label, fetch) => {
    const result = await launch(fetch);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(MESSAGE);
    expect(result.runs).toEqual([]);
  });

  it('gives up on a server that never answers', async () => {
    const result = await launch(hanging);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(MESSAGE);
    expect(result.runs).toEqual([]);
  }, 5_000);

  it('builds, then starts Electron on the dev server, when the server answers 200', async () => {
    const result = await launch(answering(200));
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.runs).toEqual([BUILD, ELECTRON]);
  });
});

describe('devDesktop children', () => {
  it('never starts Electron when the build fails, and exits with its code', async () => {
    const result = await launch(answering(200), [2]);
    expect(result.code).toBe(2);
    expect(result.runs).toEqual([BUILD]);
  });

  it("exits with Electron's non-zero exit code", async () => {
    const result = await launch(answering(200), [0, 3]);
    expect(result.code).toBe(3);
    expect(result.runs).toEqual([BUILD, ELECTRON]);
  });

  it('fails, naming the error, when a child cannot be started', async () => {
    const result = await launch(answering(200), [new Error('spawn pnpm ENOENT')]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('spawn pnpm ENOENT');
    expect(result.runs).toEqual([BUILD]);
  });
});
