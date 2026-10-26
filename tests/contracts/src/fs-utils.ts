import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

function isSourceFile(fileName: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => fileName.endsWith(ext)) && !fileName.includes('.test.');
}

/**
 * Every `.ts`/`.tsx` file under `dir` (recursively), excluding `*.test.ts`
 * files — the contract Program type-checks implementation code, not the
 * unit tests that happen to live next to it. Ambient `.d.ts` files match
 * too, since they end in `.ts`.
 */
export function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(entryPath));
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

/** Absolute paths of every listed source file whose content contains `needle`. */
export function findFilesContaining(dir: string, needle: string): string[] {
  return listSourceFiles(dir).filter((file) => readFileSync(file, 'utf8').includes(needle));
}

/** True if `dir` exists and is a directory. */
export function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
