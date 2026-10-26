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

  // The dependency direction from docs/architecture.md. Each directory sets
  // `no-restricted-imports` in exactly one block: flat config replaces a
  // rule's options when two matching blocks both set it, rather than merging.
  {
    files: ['packages/vocabulary/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@lts/*', '@lts/*/**'],
              message:
                'vocabulary is the base of the dependency graph and may not import any other @lts/* package — see docs/architecture.md',
            },
          ],
        },
      ],
    },
  },

  // The architecture rule: a page is a function of the vocabulary only.
  // Every JSX element has the same TypeScript type regardless of its tag, so
  // no signature can reject an intrinsic (`<div>`) element — this is the
  // enforcement mechanism. It sets `no-restricted-syntax` after the
  // private-member block, so it repeats `privateMemberAccess`.
  {
    files: ['packages/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...privateMemberAccess,
        {
          selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^[a-z]/]",
          message:
            'Pages may only use vocabulary components (ui.*). Intrinsic elements bypass the contract — see docs/architecture.md',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@lts/renderer-*', '@lts/renderer-*/**'],
              message:
                'pages depend on @lts/vocabulary only — a renderer registry is what pages+renderers meet in an app, not what a page imports — see docs/architecture.md',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['packages/renderer-*/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@lts/pages', '@lts/renderer-*', '@lts/renderer-*/**'],
              message:
                'renderers never import pages, and never import another renderer — see docs/architecture.md',
            },
          ],
        },
      ],
    },
  },

  prettier,
);
