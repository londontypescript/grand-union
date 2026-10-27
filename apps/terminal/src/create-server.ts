import net from 'node:net';
import type { ClientInfo, Connection } from 'ssh2';
import ssh2 from 'ssh2';
import type { VerticalAlign } from '@lts/vocabulary';
import { encodeLogField } from './log-field.ts';
import { attachSession, callIfPresent } from './session.ts';
import { SessionLimiter } from './session-limiter.ts';

// See `host-key.ts` for why this is a default import destructured at
// runtime rather than `import { Server } from 'ssh2'`.
const { Server } = ssh2;

// Bounds how long `shutdown` waits for clients to close on their own before
// destroying whatever sockets are left — a stuck or unresponsive client
// can't hold the process open past this. Overridable per-instance so tests
// can prove the deadline fires without a real 5 s wait.
const DEFAULT_SHUTDOWN_DEADLINE_MS = 5000;

export interface CreateServerOptions {
  readonly align: VerticalAlign;
  readonly hostKey: string;
  readonly maxSessions: number;
  /** Total concurrent TCP/SSH connections, counted from accept to close. */
  readonly maxConnections: number;
  /** A connection must reach `ready` (key exchange + auth) within this. */
  readonly handshakeTimeoutMs: number;
  /** A connection with no open shell must open one within this. */
  readonly preShellTimeoutMs: number;
  /** Caps `session` channels opened on one connection. */
  readonly maxSessionsPerConnection: number;
  /** How long `shutdown` waits for sockets to close before destroying them. */
  readonly shutdownDeadlineMs?: number;
  readonly log?: (line: string) => void;
}

/** `1.2.3.4:56789` — used only for concise connect/disconnect logging. */
function describeClient(info: ClientInfo): string {
  return `${info.ip}:${String(info.port)}`;
}

/** Finds the raw socket matching `info` among sockets still mid-handshake and clears its deadline. */
function clearHandshakeTimer(pending: Map<net.Socket, NodeJS.Timeout>, info: ClientInfo): void {
  for (const [socket, timer] of pending) {
    if (socket.remoteAddress === info.ip && socket.remotePort === info.port) {
      clearTimeout(timer);
      pending.delete(socket);
      return;
    }
  }
}

/** The accepted socket whose peer address matches `info`, among those still
 *  open — how a connection's own socket is found without ssh2's private
 *  `_sock` (a remote port is unique per live TCP connection). */
function socketFor(sockets: ReadonlySet<net.Socket>, info: ClientInfo): net.Socket | undefined {
  for (const socket of sockets) {
    if (socket.remoteAddress === info.ip && socket.remotePort === info.port) {
      return socket;
    }
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves once every socket currently in `sockets` has fired `close`. */
function whenAllClosed(sockets: ReadonlySet<net.Socket>): Promise<void> {
  const pending = new Set(sockets);
  if (pending.size === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    for (const socket of pending) {
      socket.once('close', () => {
        pending.delete(socket);
        if (pending.size === 0) {
          resolve();
        }
      });
    }
  });
}

export interface TerminalServer {
  readonly server: net.Server;
  /**
   * Stops accepting new connections, ends every open shell through its own
   * `endSession` — the same goodbye/exit/cleanup that `q`, Ctrl-C, the idle
   * timeout, and channel close/error already run — then ends whatever is
   * left of each connection. Resolves once every socket has closed, or
   * after `shutdownDeadlineMs`, whichever comes first; anything still open
   * at that point is destroyed rather than left holding shutdown open.
   */
  readonly shutdown: () => Promise<void>;
}

/**
 * Builds the server — wired to accept any authentication and mount one ink
 * session per `shell` channel — without listening on a port. Extracted from
 * `server.ts` so tests (and any future caller) can start a server on an
 * in-memory host key and an ephemeral port instead of the real
 * `.data/host_ed25519` and `PORT`/`ALIGN` env vars.
 *
 * The listener returned is a plain `net.Server` rather than ssh2's own
 * `Server`: ssh2 only tells us about a connection once it has parsed the
 * client's identification header, which a silent socket never sends, so
 * `handshakeTimeoutMs` has to be armed at the raw TCP accept instead. Each
 * accepted socket is handed to ssh2 via its public `injectSocket`.
 */
export function createServer(options: CreateServerOptions): TerminalServer {
  const limiter = new SessionLimiter(options.maxSessions);
  const log =
    options.log ??
    ((line: string): void => {
      console.log(line);
    });

  // Every open shell's `endSession`, keyed by the connection it belongs to.
  // `shutdown` ends each one through here — never a second copy of the
  // goodbye/exit sequence — then ends the connection itself, whether or
  // not it had a shell open.
  const endSessionsByClient = new Map<Connection, Set<() => void>>();

  const sshServer = new Server({ hostKeys: [options.hostKey] }, (client, info) => {
    log(`[terminal] connect ${describeClient(info)}`);

    const endSessions = new Set<() => void>();
    endSessionsByClient.set(client, endSessions);

    let sessionCount = 0;
    let activeShells = 0;
    let preShellTimer: NodeJS.Timeout | undefined;
    // The connection's own TCP socket, found by its address once the
    // handshake is done. Used to bound its output queue and to force it
    // closed if a half-closed client won't let go.
    let connectionSocket: net.Socket | undefined;

    function armPreShellTimer(): void {
      preShellTimer = setTimeout(() => client.end(), options.preShellTimeoutMs);
    }

    client.on('authentication', (ctx) => {
      // Public, read-only site: every authentication method is accepted.
      ctx.accept();
    });

    client.on('ready', () => {
      clearHandshakeTimer(pendingHandshakes, info);
      connectionSocket = socketFor(activeSockets, info);
      armPreShellTimer();

      client.on('session', (accept, reject) => {
        if (sessionCount >= options.maxSessionsPerConnection) {
          callIfPresent(reject);
          return;
        }
        sessionCount += 1;

        attachSession(accept(), {
          align: options.align,
          limiter,
          connectionWritableLength: () => connectionSocket?.writableLength ?? 0,
          destroyConnection: () => connectionSocket?.destroy(),
          onShellStart: (endSession) => {
            clearTimeout(preShellTimer);
            activeShells += 1;
            endSessions.add(endSession);
          },
          onShellEnd: (endSession) => {
            activeShells -= 1;
            endSessions.delete(endSession);
            // No shell left open — back on the clock, same as a connection
            // that never opened one, or it could sit open forever.
            if (activeShells === 0) {
              armPreShellTimer();
            }
          },
        });
      });
    });

    client.on('close', () => {
      clearTimeout(preShellTimer);
      endSessionsByClient.delete(client);
      log(`[terminal] disconnect ${describeClient(info)}`);
    });

    client.on('error', (error: Error) => {
      // ssh2 builds the message from what the client sent when it hung up.
      log(
        `[terminal] connection error from ${describeClient(info)}: ${encodeLogField(error.message)}`,
      );
    });
  });

  const pendingHandshakes = new Map<net.Socket, NodeJS.Timeout>();
  const activeSockets = new Set<net.Socket>();

  const netServer = net.createServer((socket) => {
    activeSockets.add(socket);
    const timer = setTimeout(() => socket.destroy(), options.handshakeTimeoutMs);
    pendingHandshakes.set(socket, timer);
    socket.once('close', () => {
      clearTimeout(timer);
      pendingHandshakes.delete(socket);
      activeSockets.delete(socket);
    });
    sshServer.injectSocket(socket);
  });
  netServer.maxConnections = options.maxConnections;

  async function shutdown(): Promise<void> {
    netServer.close();

    for (const [client, endSessions] of [...endSessionsByClient]) {
      for (const endSession of [...endSessions]) {
        endSession();
      }
      client.end();
    }

    await Promise.race([
      whenAllClosed(activeSockets),
      sleep(options.shutdownDeadlineMs ?? DEFAULT_SHUTDOWN_DEADLINE_MS),
    ]);

    for (const socket of activeSockets) {
      socket.destroy();
    }
  }

  return { server: netServer, shutdown };
}
