import { resolveAlign } from './align.ts';
import { createServer } from './create-server.ts';
import { loadOrCreateHostKey } from './host-key.ts';

const MAX_CONCURRENT_SESSIONS = 64;
// Well above the shell cap — bounds memory from connections that never
// open a shell, without limiting legitimate concurrent visitors.
const MAX_CONNECTIONS = 256;
// Key exchange plus auth over the public internet; a client that hasn't
// finished by then is a scanner or a stall, not a slow visitor.
const HANDSHAKE_TIMEOUT_MS = 10_000;
// Long enough to run `ssh host` and read the prompt; short enough that
// `ssh -N` connections don't sit open indefinitely.
const PRE_SHELL_TIMEOUT_MS = 30_000;
// One shell is normal use; two tolerates a client re-opening a session
// without allowing unbounded channel-open spam on one connection.
const MAX_SESSIONS_PER_CONNECTION = 2;

function resolvePort(raw: string | undefined): number {
  const port = Number(raw ?? 2222);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`[terminal] invalid PORT "${raw ?? ''}" — must be an integer from 1 to 65535`);
    process.exit(1);
  }
  return port;
}

const PORT = resolvePort(process.env['PORT']);

const { server, shutdown } = createServer({
  align: resolveAlign(process.env['ALIGN']),
  hostKey: loadOrCreateHostKey(),
  maxSessions: MAX_CONCURRENT_SESSIONS,
  maxConnections: MAX_CONNECTIONS,
  handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS,
  preShellTimeoutMs: PRE_SHELL_TIMEOUT_MS,
  maxSessionsPerConnection: MAX_SESSIONS_PER_CONNECTION,
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[terminal] listening on 0.0.0.0:${String(PORT)}`);
});

// A host stopping the service sends one of these; visitors mid-session
// deserve the same goodbye a `q` keypress gives them, not a dropped
// connection. A second signal during shutdown means it's stuck — exit
// immediately rather than make the host wait out the shutdown deadline too.
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) {
      process.exit(1);
    }
    shuttingDown = true;
    console.log('[terminal] shutting down');
    void shutdown().then(() => {
      process.exit(0);
    });
  });
}
