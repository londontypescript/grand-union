import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Member access to a `_`-prefixed name: by convention another library's
// internals, which can change in any release without notice. The prototype's
// SSH server once read a private ssh2 field instead of using its public
// `injectSocket`. Both spellings are caught, `obj._name` and `obj['_name']`;
// a computed key that is a variable (`obj[_name]`) and an import named with
// `_` (Playwright's `_electron`) are not member access to a private name.
// Not caught: a template-literal key or destructuring. Caught too: an
// object's own `_` members, so private state of our own uses `#private`
// fields, which are already a compile error to reach from outside.
const privateMemberAccess = [
  {
    selector: 'MemberExpression[computed=false] > Identifier.property[name=/^_/]',
    message:
      'Do not reach into `_`-prefixed members: they are private to their owner. Use its public API.',
  },
  {
    selector: 'MemberExpression[computed=true] > Literal.property[value=/^_/]',
    message:
      'Do not reach into `_`-prefixed members: they are private to their owner. Use its public API.',
  },
];

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
  // tsconfig.json actually `include`s — and the root's `scripts/**`, which
  // the root tsconfig.json includes, so `projectService` can resolve a
  // project for every file this applies to.
  {
    files: ['**/src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
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

  // Flat config replaces a rule's options when two matching blocks both set
  // it, rather than merging them. A later block that sets
  // `no-restricted-syntax` for any of these files must repeat
  // `privateMemberAccess` alongside its own selectors.
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...privateMemberAccess],
    },
  },

  prettier,
);
