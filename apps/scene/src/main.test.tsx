import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as pages from '@lts/pages';
import * as registry from '@lts/renderer-three';
import * as surface from '@lts/renderer-three/Surface';
import { VERTICAL_ALIGN, type VerticalAlign } from '@lts/vocabulary';

// main.tsx does its work when it is imported: it finds #root, reads ?align=
// and renders. The browser boundary is faked here (react-dom/client's
// createRoot, document and window.location) so the test can see what it
// renders, and where; drawing the scene for real needs WebGL, which the
// Playwright render checks cover.

// vi.mock is hoisted above the imports, so the fakes it hands out are too.
const { render, createRoot } = vi.hoisted(() => {
  const render = vi.fn<(node: ReactNode) => void>();
  // Typed with the container it is given, so the test can check which one.
  const createRoot = vi.fn<(container: unknown) => { render: typeof render }>(() => ({ render }));
  return { render, createRoot };
});

vi.mock('react-dom/client', () => ({ createRoot }));

const root = { id: 'root' };

async function start(search: string, rootElement: unknown = root): Promise<void> {
  vi.stubGlobal('window', { location: { search } });
  vi.stubGlobal('document', {
    getElementById: (id: string) => (id === 'root' ? rootElement : null),
  });
  await import('./main.tsx');
}

// What main.tsx should render for `align`.
const expected = (align: VerticalAlign): ReactNode => (
  <StrictMode>
    <surface.Surface>{pages.home(registry.three, { align })}</surface.Surface>
  </StrictMode>
);

// Each test imports main.tsx afresh, since it does its work on import. The
// modules it renders with are handed back as the ones this file already
// imported, under Node's own globals: evaluated again under the fake
// window, the scene's libraries would probe it for a browser, and the
// element types would no longer be the ones `expected` builds with.
beforeEach(() => {
  vi.resetModules();
  vi.doMock('@lts/pages', () => pages);
  vi.doMock('@lts/renderer-three', () => registry);
  vi.doMock('@lts/renderer-three/Surface', () => surface);
  render.mockClear();
  createRoot.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scene startup', () => {
  it.each(VERTICAL_ALIGN)(
    'renders home with the three registry in Surface into #root for ?align=%s',
    async (align) => {
      await start(`?align=${align}`);

      expect(createRoot).toHaveBeenCalledExactlyOnceWith(root);
      expect(render).toHaveBeenCalledExactlyOnceWith(expected(align));
    },
  );

  it.each(['', '?align=sideways'])('falls back to middle for %j', async (search) => {
    await start(search);

    expect(render).toHaveBeenCalledExactlyOnceWith(expected('middle'));
  });

  it('throws when the page has no #root', async () => {
    await expect(start('', null)).rejects.toThrow('#root element not found');
    expect(createRoot).not.toHaveBeenCalled();
  });
});
