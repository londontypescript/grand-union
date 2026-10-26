import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the repo root, computed from this file's own location. */
const REPO_ROOT = path.resolve(here, '../../..');

export function fromRoot(...segments: string[]): string {
  return path.join(REPO_ROOT, ...segments);
}
