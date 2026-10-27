// `pnpm dev:desktop`: opens the Electron shell on the web dev server this
// checkout runs (`pnpm dev:web`), on the port the resolver gives it
// (scripts/ports.ts), so the shell gets the dev server's hot reload.
// `pnpm --filter @lts/desktop start` is the other way in, and always loads
// the built app over `app://`.
//
// It checks the dev server answers first, then builds the main process and
// starts Electron with the server's URL as `--lts-web-url=<url>`, the one
// place the shell takes a dev URL from (apps/desktop/src/start-url.ts).
//
// Children get argument lists, never a shell string, so nothing in the
// environment can add a command to them. Node strips the types as it loads
// the file (tsconfig.json's erasableSyntaxOnly).

import { spawnSync } from 'node:child_process';

import { resolvePorts } from './ports.ts';

// Long enough for a dev server on this machine to answer; short enough that
// a port held by something that never answers fails promptly.
const PROBE_TIMEOUT_MS = 2_000;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Runs a child to completion and gives its exit code; throws when it
 * can't be started. */
type RunChild = (command: string, args: readonly string[]) => number;

export interface LauncherDeps {
  readonly env: Parameters<typeof resolvePorts>[0];
  readonly fetch: FetchLike;
  readonly run: RunChild;
  readonly stderr: (text: string) => void;
}

/** True when `url` answers 200 itself within the timeout. A redirect isn't
 * followed: whatever answers on the port must be the dev server. */
async function answers(url: string, fetch: FetchLike): Promise<boolean> {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    await response.body?.cancel();
    return response.status === 200;
  } catch {
    return false;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Probes the dev server, builds, starts Electron on it; resolves to the
 * launcher's exit code. */
export async function devDesktop(deps: LauncherDeps): Promise<number> {
  const port = resolvePorts(deps.env).web;
  const url = `http://localhost:${String(port)}/`;

  if (!(await answers(url, deps.fetch))) {
    deps.stderr(
      `dev-desktop: start \`pnpm dev:web\` first (expected it on port ${String(port)})\n`,
    );
    return 1;
  }

  try {
    const built = deps.run('pnpm', ['--filter', '@lts/desktop', 'build']);
    if (built !== 0) {
      return built;
    }
    return deps.run('pnpm', [
      '--filter',
      '@lts/desktop',
      'exec',
      'electron',
      'dist/main.js',
      `--lts-web-url=${url}`,
    ]);
  } catch (error) {
    deps.stderr(`dev-desktop: ${describe(error)}\n`);
    return 1;
  }
}

/** The real child runner: inherits this terminal, and a child killed by a
 * signal counts as a failure. */
function runChild(command: string, args: readonly string[]): number {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error !== undefined) {
    throw result.error;
  }
  return result.status ?? 1;
}

// Only when Node runs this file itself, never when a test imports it.
if (import.meta.main) {
  const stderr = (text: string): void => {
    process.stderr.write(text);
  };
  devDesktop({ env: process.env, fetch, run: runChild, stderr }).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      stderr(`dev-desktop: ${describe(error)}\n`);
      process.exitCode = 1;
    },
  );
}
