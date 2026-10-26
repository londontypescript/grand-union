import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ssh2 from 'ssh2';

// `ssh2` is a CommonJS module whose named exports Node's ESM loader cannot
// always detect statically (`utils` is one it misses) — importing the
// default export and destructuring is Node's own documented workaround.
// See `server.ts` for the same pattern applied to `Server`.
const { utils } = ssh2;

const here = path.dirname(fileURLToPath(import.meta.url));

// `apps/terminal/.data` — already gitignored (see `.gitignore`), so the
// generated private key never reaches version control.
const DATA_DIR = path.resolve(here, '../.data');
const HOST_KEY_PATH = path.join(DATA_DIR, 'host_ed25519');

const MAX_KEY_GENERATION_ATTEMPTS = 10;

function defaultGenerate(): string {
  return utils.generateKeyPairSync('ed25519').private;
}

/**
 * Generates an ed25519 private key, retrying if it doesn't parse back —
 * `generateKeyPairSync` occasionally produces a key `parseKey` then rejects
 * (measured at roughly 1 in 1,000). `generate` is injectable so the retry
 * itself can be tested without real key generation.
 */
export function generateHostKey(generate: () => string = defaultGenerate): string {
  for (let attempt = 0; attempt < MAX_KEY_GENERATION_ATTEMPTS; attempt += 1) {
    const key = generate();
    if (!(utils.parseKey(key) instanceof Error)) {
      return key;
    }
  }
  throw new Error(
    `Failed to generate a parseable host key after ${String(MAX_KEY_GENERATION_ATTEMPTS)} attempts`,
  );
}

/**
 * Loads the server's persistent ed25519 host key, generating one on first
 * run so returning SSH clients don't see a host-key-changed warning between
 * restarts. Written with mode `0600` — a private key readable by anyone
 * else on the host defeats the point of having one.
 */
export function loadOrCreateHostKey(): string {
  if (existsSync(HOST_KEY_PATH)) {
    const key = readFileSync(HOST_KEY_PATH, 'utf8');
    if (utils.parseKey(key) instanceof Error) {
      throw new Error(`Host key at ${HOST_KEY_PATH} is not a valid private key`);
    }
    return key;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const key = generateHostKey();
  writeFileSync(HOST_KEY_PATH, key, { mode: 0o600 });
  return key;
}
