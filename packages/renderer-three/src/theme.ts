/**
 * Visual tokens for this renderer only. Deliberately not shared with
 * `renderer-dom` or `renderer-ink` yet — see `docs/architecture.md`. Mirrors
 * `renderer-dom`'s palette (dark background, TS-blue accent, light text);
 * sizes are expressed in uikit's pixel-like units, scaled into three.js
 * world units by `panel.pixelSize` (applied once, on the root panel in
 * `Surface.tsx`, and inherited by every descendant).
 */
export const theme = {
  color: {
    background: '#0b0f19',
    panel: '#12182b',
    foreground: '#e6e9f0',
    muted: '#9aa4b8',
    accent: '#3178c6',
  },
  panel: {
    width: 960,
    height: 560,
    pixelSize: 0.0042,
    borderRadius: 20,
    borderWidth: 2,
  },
  stack: {
    padding: 56,
    gap: 28,
  },
  font: {
    header: 34,
    paragraph: 17,
  },
} as const;
