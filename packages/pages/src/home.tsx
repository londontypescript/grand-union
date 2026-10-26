import type { Page } from '@lts/vocabulary';

/**
 * The spike's only page. Composed purely of `ui.*` — no intrinsic JSX
 * elements (`<div>`, `<span>`, ...) are allowed here; that rule is enforced
 * by ESLint on `packages/pages/**`, not by the `Page` type, since every JSX
 * element has the same TypeScript type regardless of its tag.
 */
export const home: Page = (ui, { align }) => (
  <ui.Stack align={align}>
    <ui.Header>London TypeScript</ui.Header>
    <ui.Paragraph>
      One vocabulary, three renderers: this page is defined once against `Stack`, `Header`,
      `Paragraph`, `DividingLine` and `Quote`, then rendered by react-dom, react-three-fiber and Ink
      without being rewritten for any of them.
    </ui.Paragraph>
    <ui.DividingLine />
    <ui.Paragraph>ssh -p 2222 londontypescript.org to see this page rendered as text.</ui.Paragraph>
    <ui.Quote>Write it once, render it everywhere.</ui.Quote>
  </ui.Stack>
);
