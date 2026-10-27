// Characters that could forge a log line or act on the terminal of whoever
// reads the log: Unicode's control characters (`Cc`: the C0 controls such
// as line breaks and ESC, DEL, and the C1 controls), the line and paragraph
// separators, and every bidirectional control (`Bidi_Control`: the
// marks, embeddings, overrides and isolates that reorder what a reader
// sees).
const UNSAFE = /[\p{Cc}\p{Bidi_Control}\u2028\u2029]/gu;

// Long enough for any message ssh2 writes itself; a client's own
// disconnect text can be far longer.
const MAX_LENGTH = 200;
const CUT_MARKER = '…[cut]';

/**
 * `text`, which a client chose, made safe for one log line: every unsafe
 * character written as a `\u{…}` escape, then cut to 200 characters.
 */
export function encodeLogField(text: string): string {
  const escaped = text.replace(UNSAFE, (char) => `\\u{${(char.codePointAt(0) ?? 0).toString(16)}}`);
  // Counted in code points, so a cut never splits a surrogate pair.
  const characters = Array.from(escaped);
  return characters.length > MAX_LENGTH
    ? `${characters.slice(0, MAX_LENGTH).join('')}${CUT_MARKER}`
    : escaped;
}
