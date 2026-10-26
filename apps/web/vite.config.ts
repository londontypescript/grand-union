import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolvePorts } from '../../scripts/ports.ts';

// The port comes from LTS_PORT_BASE (see scripts/ports.ts), so checkouts
// running side by side each get their own. `strictPort` makes a taken port
// an error rather than Vite quietly moving to the next one, which would
// leave anything expecting the resolved port talking to the wrong server.
const { web: port } = resolvePorts(process.env);

// `base: './'` keeps every asset reference relative, so this same build is
// relocatable: it loads unchanged from a plain web origin, from
// `vite preview` in `tests/render`, and from the `app://web` origin
// `@lts/desktop` serves it under (see that app's `main.ts`).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port, strictPort: true },
  preview: { port, strictPort: true },
});
