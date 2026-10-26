import { readFileSync } from 'node:fs';

/** Reads a source file as UTF-8. Small wrapper so mutation helpers don't each import `node:fs`. */
export function readSource(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf8');
}

/**
 * Replaces the one occurrence of `target` in `source` with `replacement`.
 * Throws if `target` is missing or appears more than once — a mutation
 * helper that silently no-ops when the repo's source changes shape would
 * turn these tests into false confidence instead of a real check.
 */
export function replaceOnce(
  source: string,
  target: string,
  replacement: string,
  context: string,
): string {
  const first = source.indexOf(target);
  if (first === -1) {
    throw new Error(`Mutation target not found in ${context}:\n${target}`);
  }
  const second = source.indexOf(target, first + target.length);
  if (second !== -1) {
    throw new Error(`Mutation target is not unique in ${context}:\n${target}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + target.length);
}

const REGISTRY_LITERAL = /\{([^{}]*)\}(\s*satisfies\s+Vocabulary)/;

function splitEntries(inner: string): string[] {
  return inner
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Removes `key` from a registry's `{ A, B, C } satisfies Vocabulary` object
 * literal — regardless of key order or whitespace — so a subsequent
 * type-check reports the resulting missing-property diagnostic.
 */
export function removeRegistryKey(source: string, key: string, context: string): string {
  const match = REGISTRY_LITERAL.exec(source);
  if (!match) {
    throw new Error(`Could not find "{ ... } satisfies Vocabulary" in ${context}`);
  }
  const [whole, inner = '', suffix = ''] = match;
  const entries = splitEntries(inner);
  if (!entries.includes(key)) {
    throw new Error(`Key "${key}" not found among [${entries.join(', ')}] in ${context}`);
  }
  const remaining = entries.filter((entry) => entry !== key);
  const replacement = `{ ${remaining.join(', ')} }${suffix}`;
  return source.slice(0, match.index) + replacement + source.slice(match.index + whole.length);
}

/**
 * Adds an extra, unrecognised property to a registry's `satisfies
 * Vocabulary` object literal, reusing `reuseValue` as its value so the
 * *only* problem with the literal is the excess key.
 */
export function addExcessRegistryKey(
  source: string,
  excessKey: string,
  reuseValue: string,
  context: string,
): string {
  const match = REGISTRY_LITERAL.exec(source);
  if (!match) {
    throw new Error(`Could not find "{ ... } satisfies Vocabulary" in ${context}`);
  }
  const [whole, inner = '', suffix = ''] = match;
  const entries = splitEntries(inner);
  if (!entries.includes(reuseValue)) {
    throw new Error(`"${reuseValue}" not found among [${entries.join(', ')}] in ${context}`);
  }
  const replacement = `{ ${[...entries, `${excessKey}: ${reuseValue}`].join(', ')} }${suffix}`;
  return source.slice(0, match.index) + replacement + source.slice(match.index + whole.length);
}
