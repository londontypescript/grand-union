// `pnpm dev:terminal:connect`: opens an ssh session to the terminal server
// this checkout runs, on the port the resolver gives it (scripts/ports.ts).
// The prototype ran the same ssh command as a shell one-liner. Host-key
// checking is off because the dev server's key is local and is regenerated
// whenever its .data folder is cleared.
//
// ssh gets an argument list, never a shell string, so nothing in the
// environment can add a command to it. Node strips the types as it loads
// the file (tsconfig.json's erasableSyntaxOnly).

import { spawnSync } from 'node:child_process';

import { resolvePorts } from './ports.ts';

/** The arguments ssh is run with: the SSH port `env` resolves to, on localhost. */
export function sshArgs(env: Parameters<typeof resolvePorts>[0]): string[] {
  return [
    '-p',
    String(resolvePorts(env).ssh),
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-o',
    'LogLevel=ERROR',
    'localhost',
  ];
}

// Only when Node runs this file itself, never when a test imports it.
if (import.meta.main) {
  try {
    const result = spawnSync('ssh', sshArgs(process.env), { stdio: 'inherit' });
    if (result.error !== undefined) {
      throw result.error;
    }
    process.exitCode = result.status ?? 1;
  } catch (error) {
    process.stderr.write(
      `ssh-connect: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
