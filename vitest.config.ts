import { defineConfig } from 'vitest/config';

// Two projects sharing one root config: plain unit tests next to the source
// they cover, and the compiler-API contract tests, which are slower and
// deserve their own name in reporter output.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'packages/*/src/**/*.test.{ts,tsx}',
            'apps/*/src/**/*.test.{ts,tsx}',
            'scripts/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'contracts',
          environment: 'node',
          include: ['tests/contracts/src/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
