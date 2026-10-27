/**
 * Visual tokens for this renderer only. Deliberately not shared with
 * `renderer-dom` or `renderer-three` yet — see `docs/architecture.md`.
 * `color.accent` mirrors the other two renderers' TS-blue accent.
 */
export const theme = {
  color: {
    accent: '#3178C6',
  },
  layout: {
    // Horizontal padding applied to *each* side of the terminal.
    paddingX: 2,
    // Readable measure content is constrained to, mirroring `renderer-dom`'s
    // `60ch` / `renderer-three`'s panel width — picked slightly wider here
    // since a terminal column is narrower than a proportional `ch`.
    measure: 72,
    // Used only before the first real size is known (e.g. a channel with no
    // `pty-req`, per `apps/terminal`'s server) — never a real fallback in a
    // real TTY, which always reports `columns`/`rows`.
    fallbackColumns: 80,
    fallbackRows: 24,
  },
} as const;
