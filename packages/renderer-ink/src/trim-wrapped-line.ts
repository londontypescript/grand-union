// A run of leading SGR colour codes (`ESC [ … m`), then the whitespace that
// follows them. ESC (U+001B) is built at runtime so it isn't written as a
// control character inside a regex literal, which the lint rule forbids.
const LEADING_SGR_SPACE = new RegExp(`^((?:${String.fromCharCode(27)}\\[[0-9;]*m)*)\\s+`);

/**
 * Ink wraps text with trimming off, so a line that breaks exactly at a
 * space starts the next line with it — a one-column indent. Passed to
 * `<Transform>`, which runs once per wrapped line.
 *
 * With colour on (every client over SSH), the line starts with the SGR
 * escape(s) for its style, and that space sits *after* them, where a plain
 * `trimStart` never reaches. So the leading escapes are kept and the space
 * that follows them is stripped. The pattern matches only the `ESC [ … m`
 * codes the components here emit, not arbitrary control sequences.
 */
export function trimWrappedLine(line: string): string {
  return line.replace(LEADING_SGR_SPACE, '$1');
}
