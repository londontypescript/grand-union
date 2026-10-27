import { resolvePorts } from '../../../scripts/ports.ts';
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
// Open at once on one connection: one shell is normal use; two tolerates a
// client re-opening a session without allowing unbounded channel-open spam.
const MAX_SESSIONS_PER_CONNECTION = 2;

// PORT, or LTS_PORT_BASE + 2, or 2222: the repo's one port resolver decides.
function resolvePort(): number {
  try {
    return resolvePorts(process.env).ssh;
  } catch (error) {
    console.error(`[terminal] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const PORT = resolvePort();

// Trusted operator configuration, like PORT: the path is used as given.
const HOST_KEY_PATH = process.env['LTS_HOST_KEY_PATH'];

const { server, shutdown } = createServer({
  align: resolveAlign(process.env['ALIGN']),
  hostKey: HOST_KEY_PATH === undefined ? loadOrCreateHostKey() : loadOrCreateHostKey(HOST_KEY_PATH),
  maxSessions: MAX_CONCURRENT_SESSIONS,
  maxConnections: MAX_CONNECTIONS,
  handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS,
  preShellTimeoutMs: PRE_SHELL_TIMEOUT_MS,
  maxSessionsPerConnection: MAX_SESSIONS_PER_CONNECTION,
});

// Loopback only: this server is for local development, and its review
// found ways a hostile client could still exhaust it, so it must not be
// reachable from the network. Public hosting is a separate design (#38).
const HOST = '127.0.0.1';

server.listen(PORT, HOST, () => {
  console.log(`[terminal] listening on ${HOST}:${String(PORT)}`);
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
