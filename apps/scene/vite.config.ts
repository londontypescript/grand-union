import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolvePorts } from '../../scripts/ports.ts';

// The scene's port comes from scripts/ports.ts, so several checkouts can run
// at once (see that file); `strictPort` makes a taken port an error rather
// than a silent move to the next free one, which the render checks would
// then miss.
const { scene: port } = resolvePorts(process.env);

// `base: './'` keeps every asset reference relative, matching `@lts/web` —
// see that app's `vite.config.ts` for why (relocatable assets).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port, strictPort: true },
  preview: { port, strictPort: true },
});
