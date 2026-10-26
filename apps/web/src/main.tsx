import { home } from '@lts/pages';
import { dom } from '@lts/renderer-dom';
import { isVerticalAlign, type VerticalAlign } from '@lts/vocabulary';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/** Reads `?align=` from the current URL, falling back to `middle`. */
function readAlign(): VerticalAlign {
  const requested = new URLSearchParams(window.location.search).get('align');
  return isVerticalAlign(requested) ? requested : 'middle';
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root element not found');
}

createRoot(container).render(<StrictMode>{home(dom, { align: readAlign() })}</StrictMode>);
