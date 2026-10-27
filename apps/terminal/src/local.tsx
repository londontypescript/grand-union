import type { ReactElement } from 'react';
import { home } from '@lts/pages';
import { ink } from '@lts/renderer-ink';
import type { VerticalAlign } from '@lts/vocabulary';
import { render, useApp, useInput } from 'ink';
import { resolveAlign } from './align.ts';

/** Reads `--align=<v>` from argv, e.g. `['--align=top']`. */
function readAlignFlag(argv: readonly string[]): string | undefined {
  const flag = argv.find((arg) => arg.startsWith('--align='));
  return flag?.slice('--align='.length);
}

interface AppProps {
  readonly align: VerticalAlign;
}

/**
 * Wraps `home` with a `q` exit key. Ink already exits on Ctrl+C by default
 * (`exitOnCtrlC`, on here since this renders straight to the real terminal),
 * but `q` needs an explicit `useInput` handler — this is the one place in
 * `apps/terminal` a component sits above a page, so the page itself stays a
 * pure function of the vocabulary, with no key handling of its own.
 */
function App({ align }: AppProps): ReactElement {
  const { exit } = useApp();
  useInput((input) => {
    if (input === 'q') {
      exit();
    }
  });
  return home(ink, { align });
}

render(<App align={resolveAlign(readAlignFlag(process.argv.slice(2)))} />);
