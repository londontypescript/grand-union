import type { Vocabulary } from '@lts/vocabulary';
import { DividingLine } from './DividingLine.tsx';
import { Header } from './Header.tsx';
import { Paragraph } from './Paragraph.tsx';
import { Quote } from './Quote.tsx';
import { Stack } from './Stack.tsx';

/**
 * The react-three-fiber implementation of {@link Vocabulary}. `satisfies
 * Vocabulary` (rather than `: Vocabulary`) keeps this object's literal type
 * while still checking it against the contract: a missing or misspelled key
 * is a compile error here. See `renderer-dom`'s `registry.ts`.
 *
 * These components draw into `Surface`'s uikit panel — they do not, and
 * must not, create their own `Canvas` or root layout node.
 */
export const three = { Stack, Header, Paragraph, DividingLine, Quote } satisfies Vocabulary;
