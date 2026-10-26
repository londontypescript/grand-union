import { useEffect, useState } from 'react';
import { useStdout } from 'ink';
import { theme } from './theme.ts';

/** The measurements `Stack` and `DividingLine` both need from the terminal. */
export interface TerminalSize {
  readonly rows: number;
  readonly columns: number;
  /** `columns` minus horizontal padding, capped at the readable measure. */
  readonly contentWidth: number;
}

/**
 * A stream with no window size yet (no controlling terminal) reports `0`,
 * not `undefined` — `??` wouldn't catch that. Ink's own `getWindowSize`
 * utility falls back the same way, rather than rendering a zero-width or
 * zero-height frame that looks like nothing happened.
 */
function positiveOr(value: number | undefined, fallback: number): number {
  return value !== undefined && value > 0 ? value : fallback;
}

function measure(stdout: { readonly columns?: number; readonly rows?: number }): TerminalSize {
  const columns = positiveOr(stdout.columns, theme.layout.fallbackColumns);
  const rows = positiveOr(stdout.rows, theme.layout.fallbackRows);
  const contentWidth = Math.max(
    1,
    Math.min(columns - theme.layout.paddingX * 2, theme.layout.measure),
  );
  return { rows, columns, contentWidth };
}

/**
 * The current terminal size, tracking resize for the lifetime of the
 * component. Ink's `useStdout` returns whatever stream `render()` was given
 * — `process.stdout` for `apps/terminal`'s `local.tsx`, or the per-session
 * channel adapter for `apps/terminal`'s `server.ts` — so this hook works
 * unchanged in both.
 */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState(() => measure(stdout));

  useEffect(() => {
    function handleResize(): void {
      setSize(measure(stdout));
    }
    // The stream may have been resized between the initial render and this
    // effect running (or subscribing to a different stdout instance).
    handleResize();
    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  return size;
}
