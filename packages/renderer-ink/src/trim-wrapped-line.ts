/**
 * Ink wraps text with trimming off, so a line that breaks exactly at a
 * space starts the next line with it — a one-column indent. Passed to
 * `<Transform>`, which runs once per wrapped line.
 */
export function trimWrappedLine(line: string): string {
  return line.trimStart();
}
