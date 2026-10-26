import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fromRoot } from './repo-paths.ts';
import { isDirectory } from './fs-utils.ts';

export interface DiscoveredRegistry {
  /** Package directory name, e.g. `renderer-dom`. */
  readonly name: string;
  /** Absolute path to the package's `src` directory. */
  readonly srcDir: string;
  /** Absolute path to the package's `src/registry.ts`. */
  readonly registryFile: string;
}

/**
 * Finds every `registry.ts` under a `packages/renderer-*` package's `src`
 * directory, so later renderers (`renderer-three`, `renderer-ink`) are
 * covered by these tests as soon as they exist — no test file needs editing
 * to add them.
 */
export function discoverRegistries(): DiscoveredRegistry[] {
  const packagesDir = fromRoot('packages');
  const entries = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('renderer-'))
    .map((entry) => entry.name)
    .sort();

  const registries: DiscoveredRegistry[] = [];
  for (const name of entries) {
    const srcDir = path.join(packagesDir, name, 'src');
    const registryFile = path.join(srcDir, 'registry.ts');
    if (isDirectory(srcDir)) {
      registries.push({ name, srcDir, registryFile });
    }
  }

  if (registries.length === 0) {
    throw new Error(
      `No packages/renderer-*/src found under ${packagesDir} — expected at least renderer-dom.`,
    );
  }

  return registries;
}
