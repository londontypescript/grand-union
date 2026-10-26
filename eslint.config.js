import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.tsbuildinfo',
      '**/__snapshots__/**',
      'apps/terminal/.data/**',
      '.claude/worktrees/**',
      'pnpm-lock.yaml',
    ],
  },

  js.configs.recommended,

  // Baseline TypeScript linting for every .ts/.tsx file, including config
  // files that sit outside any package's tsconfig (eslint.config.js itself,
  // vite.config.ts, ...).
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
  },

  // Type-aware linting, scoped to `src/**` — the directories each package's
  // tsconfig.json actually `include`s, so `projectService` can resolve a
  // project for every file this applies to.
  {
    files: ['**/src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.flat.recommended.rules,
  },

  // web and scene run in the browser; terminal and desktop are Node processes.
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/scene/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },

  {
    files: ['apps/terminal/src/**/*.{ts,tsx}', 'apps/desktop/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['tests/**/*.{ts,tsx}', 'scripts/**/*.{ts,tsx}', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
