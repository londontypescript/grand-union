import type { Vocabulary } from '@lts/vocabulary';
import { DividingLine } from './DividingLine.tsx';
import { Header } from './Header.tsx';
import { Paragraph } from './Paragraph.tsx';
import { Quote } from './Quote.tsx';
import { Stack } from './Stack.tsx';
import './styles.css';

/**
 * The react-dom implementation of {@link Vocabulary}. `satisfies Vocabulary`
 * (rather than `: Vocabulary`) keeps this object's literal type — so callers
 * see the concrete component types — while still checking it against the
 * contract: a missing or misspelled key is a compile error here.
 */
export const dom = { Stack, Header, Paragraph, DividingLine, Quote } satisfies Vocabulary;
