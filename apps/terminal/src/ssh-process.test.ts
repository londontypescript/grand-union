import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { HOST, generateHostKey, sleep } from './ssh-test-support.ts';

// `server.ts` run as its own process, as `dev:server` runs it, but through
// `node --import tsx` rather than the `tsx` command: the command starts a
// second process and relays signals to it, so these tests would measure tsx
// rather than the server, and killing it can leave the server running.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const SERVER = fileURLToPath(new URL('server.ts', import.meta.url));
const RUNTIME_TSCONFIG = fileURLToPath(new URL('../tsconfig.runtime.json', import.meta.url));

// Starting takes about half a second, stopping a few milliseconds (measured
// locally); each wait is more than ten times that.
const STARTUP_MS = 15_000;
const STOP_MS = 5000;
// The server's own shutdown deadline, which a stuck visitor holds it to.
const SHUTDOWN_DEADLINE_MS = 5000;
// Above each test's own waits plus cleanup, so a failure has its own
// message, never Vitest's timeout.
const TEST_TIMEOUT_MS = 60_000;

// One of this machine's own non-loopback IPv4 addresses: a server bound to
// every interface answers on it, one bound to loopback refuses it.
const NETWORK_ADDRESS = Object.values(networkInterfaces())
  .flat()
  .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address;

interface Exit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

interface Run {
  readonly child: ChildProcess;
  readonly stdout: () => string;
  readonly stderr: () => string;
  readonly exited: Promise<Exit>;
  exit: Exit | undefined;
}

const runs: Run[] = [];
const sockets: net.Socket[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.destroy();
  }
  for (const run of runs.splice(0)) {
    if (run.exit === undefined) {
      run.child.kill('SIGKILL');
      // Bounded, so a child that somehow won't die can't hang the whole run.
      await Promise.race([run.exited, sleep(STOP_MS)]);
    }
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'terminal-process-'));
  dirs.push(dir);
  return dir;
}

/** A host key in a fresh temp dir, so no test touches `apps/terminal/.data`. */
function hostKeyFile(): string {
  const keyPath = path.join(tempDir(), 'host_ed25519');
  writeFileSync(keyPath, generateHostKey(), { mode: 0o600 });
  return keyPath;
}

/**
 * A port nothing listens on right now. Another process could take it before
 * the server binds it; that race is accepted, and shows as EADDRINUSE on the
 * server's stderr, never as a hang.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, HOST, () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => {
        resolve(port);
      });
    });
  });
}

/** A valid LTS_PORT_BASE whose SSH port, base + 2, is free right now. */
async function freeBase(): Promise<number> {
  for (;;) {
    const base = (await freePort()) - 2;
    if (base >= 1024 && base <= 65500) {
      return base;
    }
  }
}

/** Starts the server with `set` on top of this process's environment, less
 * the variables these tests decide. `exec` overrides the node binary, so a
 * test can make the spawn itself fail. */
function start(set: Readonly<Record<string, string>>, exec: string = process.execPath): Run {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key !== 'PORT' && key !== 'LTS_PORT_BASE' && key !== 'LTS_HOST_KEY_PATH',
    ),
  );
  const child = spawn(exec, ['--import', 'tsx', SERVER], {
    cwd: PACKAGE_DIR,
    env: { ...inherited, TSX_TSCONFIG_PATH: RUNTIME_TSCONFIG, ...set },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const run: Run = {
    child,
    stdout: () => stdout,
    stderr: () => stderr,
    exited: new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        run.exit = { code, signal };
        resolve(run.exit);
      });
      child.once('error', (error) => {
        // A failed spawn fires `error` and then no `exit`, so settle the run
        // here too; otherwise every wait on it, cleanup included, would hang.
        stderr += `\n[spawn error] ${error.message}`;
        run.exit = { code: null, signal: null };
        resolve(run.exit);
      });
    }),
    exit: undefined,
  };
  runs.push(run);
  return run;
}

function describeRun(run: Run): string {
  return `stdout:\n${run.stdout()}\nstderr:\n${run.stderr()}`;
}

/** Waits until `matches` holds on the server's stdout, failing if it exits first or `ms` passes. */
async function untilStdout(run: Run, matches: RegExp, ms: number): Promise<RegExpExecArray> {
  const deadline = Date.now() + ms;
  for (;;) {
    const found = matches.exec(run.stdout());
    if (found) {
      return found;
    }
    if (run.exit !== undefined) {
      throw new Error(
        `the server exited (${JSON.stringify(run.exit)}) before ${String(matches)}; ${describeRun(run)}`,
      );
    }
    if (Date.now() > deadline) {
      throw new Error(`no ${String(matches)} within ${String(ms)}ms; ${describeRun(run)}`);
    }
    await sleep(10);
  }
}

/** The port the server says it listens on. */
async function listeningPort(run: Run): Promise<number> {
  const [, port] = await untilStdout(run, /\[terminal\] listening on [\d.]+:(\d+)\n/, STARTUP_MS);
  return Number(port);
}

/** Resolves with the server's exit, failing with `why` if it hasn't exited within `ms`. */
async function exitWithin(run: Run, ms: number, why: string): Promise<Exit> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      resolve(undefined);
    }, ms);
  });
  const exit = await Promise.race([run.exited, timedOut]);
  clearTimeout(timer);
  if (exit === undefined) {
    throw new Error(`${why}, but it was still running after ${String(ms)}ms; ${describeRun(run)}`);
  }
  return exit;
}

/** Connects to `port` and resolves once the SSH identification line arrives, sending nothing back. */
function identifiedSocket(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: HOST, port });
    sockets.push(socket);
    let received = '';
    const timer = setTimeout(() => {
      reject(
        new Error(`no SSH identification from port ${String(port)} within ${String(STOP_MS)}ms`),
      );
    }, STOP_MS);
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on('data', (chunk: Buffer) => {
      received += chunk.toString('latin1');
      if (received.includes('SSH-2.0-')) {
        clearTimeout(timer);
        resolve(socket);
      }
    });
  });
}

describe('the server process: its port', { timeout: TEST_TIMEOUT_MS }, () => {
  it('exits 1 naming PORT when it is not a port', async () => {
    const run = start({ PORT: 'abc', LTS_HOST_KEY_PATH: hostKeyFile() });

    const exit = await exitWithin(run, STARTUP_MS, 'PORT=abc should stop the server');

    expect(exit, `the exit for PORT=abc; ${describeRun(run)}`).toEqual({ code: 1, signal: null });
    expect(run.stderr()).toContain('[terminal] invalid PORT "abc"');
  });

  it('listens on LTS_PORT_BASE + 2 when PORT is unset', async () => {
    const base = await freeBase();
    const run = start({ LTS_PORT_BASE: String(base), LTS_HOST_KEY_PATH: hostKeyFile() });

    const port = await listeningPort(run);

    expect(port, `LTS_PORT_BASE=${String(base)}`).toBe(base + 2);
    await identifiedSocket(base + 2);
  });

  it('listens on PORT when both PORT and LTS_PORT_BASE are set', async () => {
    const wanted = await freePort();
    const base = await freeBase();
    const run = start({
      PORT: String(wanted),
      LTS_PORT_BASE: String(base),
      LTS_HOST_KEY_PATH: hostKeyFile(),
    });

    expect(await listeningPort(run), `PORT=${String(wanted)}, LTS_PORT_BASE=${String(base)}`).toBe(
      wanted,
    );
    await identifiedSocket(wanted);
  });

  // Skipped only on a machine with no network interface but loopback.
  it.skipIf(NETWORK_ADDRESS === undefined)(
    'refuses a connection to this machine’s network address, not only loopback',
    async () => {
      const run = start({ PORT: String(await freePort()), LTS_HOST_KEY_PATH: hostKeyFile() });
      const port = await listeningPort(run);

      const outcome = await new Promise<string>((resolve) => {
        const socket = net.createConnection({ host: NETWORK_ADDRESS, port });
        sockets.push(socket);
        socket.on('connect', () => {
          resolve('connected');
        });
        socket.on('error', (error: NodeJS.ErrnoException) => {
          resolve(error.code ?? error.message);
        });
      });

      expect(outcome, `a connection to ${String(NETWORK_ADDRESS)}:${String(port)}`).toBe(
        'ECONNREFUSED',
      );
    },
  );
});

describe('the server process: its host key', { timeout: TEST_TIMEOUT_MS }, () => {
  it('exits non-zero naming LTS_HOST_KEY_PATH when that file is not a key', async () => {
    const keyPath = path.join(tempDir(), 'host_ed25519');
    writeFileSync(keyPath, 'not a valid key', { mode: 0o600 });
    const run = start({ PORT: String(await freePort()), LTS_HOST_KEY_PATH: keyPath });

    const exit = await exitWithin(
      run,
      STARTUP_MS,
      `LTS_HOST_KEY_PATH=${keyPath} holds no key, so the server should stop`,
    );

    expect(exit.code, `the exit code for a bad host key; ${describeRun(run)}`).not.toBe(0);
    expect(run.stderr()).toContain(keyPath);
  });
});

describe('the server process: stopping', { timeout: TEST_TIMEOUT_MS }, () => {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    it(`exits 0 on ${signal}`, async () => {
      const run = start({ PORT: String(await freePort()), LTS_HOST_KEY_PATH: hostKeyFile() });
      await listeningPort(run);

      run.child.kill(signal);

      const exit = await exitWithin(run, STOP_MS, `${signal} should stop the server`);
      expect(exit, `the exit after ${signal}; ${describeRun(run)}`).toEqual({
        code: 0,
        signal: null,
      });
    });
  }

  it('exits 1 on a second signal while shutdown waits for a stuck visitor', async () => {
    const run = start({ PORT: String(await freePort()), LTS_HOST_KEY_PATH: hostKeyFile() });
    const port = await listeningPort(run);
    // Connected and identified by the server, but never answering: shutdown
    // waits for it until its deadline.
    await identifiedSocket(port);

    run.child.kill('SIGINT');
    await untilStdout(run, /\[terminal\] shutting down\n/, STOP_MS);
    run.child.kill('SIGINT');

    // Waits past the shutdown deadline, so a server that ignores the second
    // signal is seen exiting 0 there rather than timing out here.
    const exit = await exitWithin(
      run,
      SHUTDOWN_DEADLINE_MS + STOP_MS,
      'a second SIGINT should stop the server',
    );
    expect(exit, `the exit after a second SIGINT; ${describeRun(run)}`).toEqual({
      code: 1,
      signal: null,
    });
  });
});

describe('the server process: a spawn that fails', { timeout: TEST_TIMEOUT_MS }, () => {
  it('settles the run instead of hanging when the child cannot be spawned', async () => {
    // A node binary that does not exist: `spawn` fires `error`, never `exit`.
    const missingExec = path.join(tempDir(), 'no-such-node');
    const run = start(
      { PORT: String(await freePort()), LTS_HOST_KEY_PATH: hostKeyFile() },
      missingExec,
    );

    const exit = await exitWithin(run, STOP_MS, 'a failed spawn should settle the run');

    expect(exit, `the run settles with a null exit; ${describeRun(run)}`).toEqual({
      code: null,
      signal: null,
    });
    expect(run.stderr(), 'the spawn error is recorded').toContain('spawn error');
  });
});
