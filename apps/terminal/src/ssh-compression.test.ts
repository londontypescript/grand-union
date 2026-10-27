import { Client } from 'ssh2';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PAGE_TEXT,
  PTY,
  TEST_TIMEOUT_MS,
  setupSshTests,
  shell,
  until,
} from './ssh-client-support.ts';
import { HOST, sleep } from './ssh-test-support.ts';

const { serve, connect } = setupSshTests();

const compressedClients: Client[] = [];

afterEach(() => {
  for (const client of compressedClients.splice(0)) {
    client.destroy();
  }
});

interface Negotiated {
  readonly client: Client;
  readonly compress: { readonly cs: string; readonly sc: string };
}

/** Connects a client that prefers zlib, as `ssh -C` does, and reports what was negotiated. */
function connectPreferringZlib(port: number): Promise<Negotiated> {
  const client = new Client();
  compressedClients.push(client);
  return new Promise((resolve, reject) => {
    let compress: Negotiated['compress'] | undefined;
    client.on('handshake', (negotiated) => {
      compress = { cs: negotiated.cs.compress, sc: negotiated.sc.compress };
    });
    client.on('error', reject);
    client.on('ready', () => {
      if (compress === undefined) {
        reject(new Error('ready without a handshake event'));
        return;
      }
      resolve({ client, compress });
    });
    client.connect({
      host: HOST,
      port,
      username: 'test',
      password: 'test',
      readyTimeout: 5000,
      algorithms: { compress: ['zlib@openssh.com', 'zlib', 'none'] },
    });
  });
}

describe('compression', { timeout: TEST_TIMEOUT_MS }, () => {
  it('negotiates none with a client that prefers zlib', async () => {
    const { compress } = await connectPreferringZlib(await serve());

    expect(compress, 'compression negotiated in each direction').toEqual({
      cs: 'none',
      sc: 'none',
    });
  });

  // The crash this guards against: with zlib negotiated, a dropped client
  // made the shell's teardown write into a freed compressor, throwing out of
  // a nextTick and leaking every slot its shells held.
  it('frees both slots when a client that prefers zlib drops with two shells open', async () => {
    const port = await serve({ maxSessions: 2 });
    for (let i = 0; i < 2; i += 1) {
      const { client } = await connectPreferringZlib(port);
      const watched = await shell(client, PTY);
      await until(watched, () => watched.text().includes(PAGE_TEXT));
    }
    for (const client of compressedClients.splice(0)) {
      client.destroy();
    }
    // The server sees each socket close on its own next turn.
    await sleep(200);

    const fresh = [await shell(await connect(port), PTY), await shell(await connect(port), PTY)];
    for (const watched of fresh) {
      await until(watched, () => watched.text().includes(PAGE_TEXT));
    }

    for (const [i, watched] of fresh.entries()) {
      expect(watched.text(), `fresh shell ${String(i + 1)} of 2 after the drop`).not.toContain(
        'at capacity',
      );
      expect(watched.text(), `fresh shell ${String(i + 1)} of 2 after the drop`).toContain(
        PAGE_TEXT,
      );
    }
  });
});
