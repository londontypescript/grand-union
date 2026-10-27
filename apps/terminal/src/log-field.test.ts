import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from './create-server.ts';
import { encodeLogField } from './log-field.ts';
import { HOST, closeServer, generateHostKey, listen, sleep } from './ssh-test-support.ts';

describe('encodeLogField', () => {
  it('leaves printable text alone, Unicode included', () => {
    expect(encodeLogField('Connection lost: café ✓')).toBe('Connection lost: café ✓');
  });

  it('escapes line breaks, so a message cannot start a log line of its own', () => {
    expect(encodeLogField('a\nb\r\nc')).toBe(String.raw`a\u{a}b\u{d}\u{a}c`);
  });

  it('escapes ESC and the other C0 controls, DEL and C1 controls', () => {
    expect(encodeLogField('\u001b[31mred\u001b[0m\u0007\u007f\u009b')).toBe(
      String.raw`\u{1b}[31mred\u{1b}[0m\u{7}\u{7f}\u{9b}`,
    );
  });

  it('escapes the Unicode line and paragraph separators', () => {
    expect(encodeLogField('a\u2028b\u2029c')).toBe(String.raw`a\u{2028}b\u{2029}c`);
  });

  it('escapes every Unicode bidirectional control', () => {
    // The whole Bidi_Control property: the arabic letter mark, the left- and
    // right-to-left marks, the embeddings/overrides, and the isolates.
    const bidiControls = [
      '\u061c',
      '\u200e',
      '\u200f',
      '\u202a',
      '\u202b',
      '\u202c',
      '\u202d',
      '\u202e',
      '\u2066',
      '\u2067',
      '\u2068',
      '\u2069',
    ];
    for (const control of bidiControls) {
      const code = (control.codePointAt(0) ?? 0).toString(16);
      expect(encodeLogField(`a${control}b`), `U+${code.toUpperCase()} is escaped`).toBe(
        `a\\u{${code}}b`,
      );
    }
  });

  it('cuts a long message to 200 characters and says so', () => {
    expect(encodeLogField('x'.repeat(1000))).toBe(`${'x'.repeat(200)}…[cut]`);
    expect(encodeLogField('x'.repeat(200))).toBe('x'.repeat(200));
  });

  it('counts the escapes towards the 200', () => {
    expect(encodeLogField('\n'.repeat(100))).toBe(`${String.raw`\u{a}`.repeat(40)}…[cut]`);
  });
});

/**
 * Sends the SSH identification line, then a DISCONNECT packet carrying
 * `description`. Before key exchange packets travel in the clear, so a raw
 * socket can send one, as any client could: ssh2 then reports the
 * description as an error message.
 */
function sendDisconnect(port: number, description: string): net.Socket {
  const text = Buffer.from(description, 'utf8');
  const payload = Buffer.alloc(1 + 4 + 4 + text.length + 4);
  let at = payload.writeUInt8(1, 0); // SSH_MSG_DISCONNECT
  at = payload.writeUInt32BE(2, at); // SSH_DISCONNECT_PROTOCOL_ERROR
  at = payload.writeUInt32BE(text.length, at);
  at += text.copy(payload, at);
  payload.writeUInt32BE(0, at); // empty language tag
  // uint32 length, padding-length byte, payload, then padding of at least 4
  // bytes bringing the whole packet to a multiple of 8.
  let padding = 8 - ((4 + 1 + payload.length) % 8);
  if (padding < 4) {
    padding += 8;
  }
  const packet = Buffer.alloc(4 + 1 + payload.length + padding);
  packet.writeUInt32BE(1 + payload.length + padding, 0);
  packet.writeUInt8(padding, 4);
  payload.copy(packet, 5);

  const socket = net.createConnection({ host: HOST, port });
  socket.resume();
  socket.write('SSH-2.0-log-test\r\n');
  socket.write(packet);
  return socket;
}

describe('the connection-error log line', { timeout: 30_000 }, () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it('carries a client-chosen message as one escaped, bounded line', async () => {
    const lines: string[] = [];
    const { server } = createServer({
      align: 'middle',
      hostKey: generateHostKey(),
      maxSessions: 4,
      maxConnections: 4,
      handshakeTimeoutMs: 60_000,
      preShellTimeoutMs: 60_000,
      maxSessionsPerConnection: 2,
      log: (line) => {
        lines.push(line);
      },
    });
    const port = await listen(server);
    const forged = `bye\n[terminal] connect 203.0.113.7:22\u001b[2J\u202e${'x'.repeat(500)}`;
    const socket = sendDisconnect(port, forged);
    cleanup = async () => {
      socket.destroy();
      await closeServer(server);
    };

    const deadline = Date.now() + 5000;
    let line: string | undefined;
    while ((line = lines.find((each) => each.includes('connection error'))) === undefined) {
      if (Date.now() > deadline) {
        throw new Error(`no connection-error line within 5000ms; logged:\n${lines.join('\n')}`);
      }
      await sleep(10);
    }

    expect(line, 'the line holds no line break').not.toMatch(/[\n\r\u2028\u2029]/u);
    expect(line, 'the line holds no ESC').not.toContain('\u001b');
    expect(line, 'the line holds no bidi override').not.toContain('\u202e');
    expect(line, 'the forged part, escaped').toContain(
      String.raw`bye\u{a}[terminal] connect 203.0.113.7:22\u{1b}[2J\u{202e}xxx`,
    );
    expect(line, 'the message cut to 200 characters').toMatch(/x…\[cut\]$/);
    expect(line.length, 'the line length').toBeLessThan(300);
  });
});
