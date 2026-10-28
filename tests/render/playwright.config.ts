import { defineConfig, devices } from '@playwright/test';
import { SCENE_PORT, SCENE_URL, WEB_PORT, WEB_URL } from './src/config.ts';

// Headless Chromium has no GPU by default. These flags force ANGLE's
// SwiftShader software rasteriser so WebGL initialises the same way on a
// contributor's Mac, a GPU-less Linux CI runner, and everywhere else — real
// GPU headless support varies by platform and Chromium version, which would
// make `scene.spec.ts`'s pixel measurements flaky in exactly the way that
// undermines the point of measuring them.
const SOFTWARE_WEBGL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
];

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  // Stated rather than left to Playwright's defaults, which change with CI
  // and with the machine's cores. One worker: the specs share two preview
  // servers and one software rasteriser, and contention is what makes pixel
  // timings flaky. No retries: a render check that passes on its second try
  // is reported as passing, which hides the flakiness worth seeing.
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env['CI']),
  reporter: [['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  use: {
    launchOptions: { args: SOFTWARE_WEBGL_ARGS },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Both apps must already be built (`pnpm build`) — `vite preview` serves
  // `dist/`, it does not build it.
  //
  // No `--` before the forwarded flags: `pnpm run <script> -- <args>` appends
  // a literal extra `--` ahead of <args>, which vite's arg parser then reads
  // as "stop parsing flags", silently ignoring `--port`/`--strictPort`.
  // Omitting pnpm's `--` lets the flags reach vite as plain arguments.
  //
  // Never reuse a server already on the port: whatever is listening there
  // (another checkout's preview, a stale build) isn't this checkout's build,
  // and the suite would measure it instead. A taken port fails the run; give
  // each checkout its own LTS_PORT_BASE (see scripts/ports.ts).
  webServer: [
    {
      command: `pnpm --filter @lts/web run preview --port ${String(WEB_PORT)} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @lts/scene run preview --port ${String(SCENE_PORT)} --strictPort`,
      url: SCENE_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
