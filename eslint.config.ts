import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import { flatConfigs as importXFlatConfig } from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import reactPlugin from 'eslint-plugin-react';
import { browser, es2020, node } from 'globals';
import { config, configs as tsConfigs, parser as tsParser } from 'typescript-eslint';
import type { FixupConfigArray } from '@eslint/compat';

export default config(
  // Shared configs
  js.configs.recommended,
  ...tsConfigs.recommended,
  jsxA11y.flatConfigs.recommended,
  importXFlatConfig.recommended,
  importXFlatConfig.typescript,
  eslintPluginPrettierRecommended,
  ...fixupConfigRules(new FlatCompat().extends('plugin:react-hooks/recommended') as FixupConfigArray),
  { files: ['**/*.{ts,tsx}'], ...reactPlugin.configs.flat.recommended },
  { files: ['**/*.{ts,tsx}'], ...reactPlugin.configs.flat['jsx-runtime'] },
  // Custom config
  {
    ignores: ['**/build/**', '**/dist/**', '**/node_modules/**', '**/*.min.mjs', 'chrome-extension/manifest.js'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        // `allowDefaultProject` accepts at most 8 files, and unshafted-core's suite reached that
        // ceiling — the ninth test file failed to parse rather than failing to lint, which reads
        // like a broken config rather than a full one. That suite has its own tsconfig now, so it
        // is a real project and does not consume the allowance. `packages/storage/test` still
        // does; give it the same treatment before adding an eighth file there.
        projectService: {
          allowDefaultProject: ['packages/storage/test/*.ts'],
        },
      },
      globals: {
        ...browser,
        ...es2020,
        ...node,
        chrome: 'readonly',
      },
    },
    settings: {
      react: {
        /*
         * Pinned, not 'detect', because detection is what breaks under eslint 10 (#55).
         * `eslint-plugin-react@7.37.5` resolves a detected version via `context.getFilename()`,
         * removed in eslint 10 — so every rule that asks what React version it is linting against
         * throws, and takes the whole run down with it. That is seven of the recommended rules,
         * `display-name` and `no-string-refs` among them, in all 11 packages. An explicit version
         * never enters that code path, so the whole set loads.
         *
         * The value only ever reaches `semver.satisfies` range tests, so the major is what carries
         * meaning. Keep it in step with the `react` major in the root package.json.
         */
        version: '19.0',
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // A leading underscore is how this codebase says "deliberately unused" — a prop kept for
      // call-site compatibility, a destructured value skipped over. Honour that rather than
      // making every such site carry a disable comment.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'prefer-const': 'error',
      'no-var': 'error',
      'func-style': ['error', 'expression', { allowArrowFunctions: true }],
      'arrow-body-style': ['error', 'as-needed'],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      'import-x/order': [
        'error',
        {
          'newlines-between': 'never',
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: ['index', 'sibling', 'parent', 'internal', 'external', 'builtin', 'object', 'type'],
          pathGroups: [
            {
              pattern: '@*/**',
              group: 'internal',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['type'],
        },
      ],
      'import-x/no-unresolved': 'off',
      'import-x/no-named-as-default': 'error',
      'import-x/no-named-as-default-member': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-deprecated': 'error',
      'import-x/no-duplicates': ['error', { considerQueryString: true, 'prefer-inline': false }],
      'import-x/consistent-type-specifier-style': 'error',
      'import-x/exports-last': 'error',
      'import-x/first': 'error',
      /*
       * eslint-plugin-react-hooks v7 added React Compiler rules that v5 did not have. They fired on
       * 15 sites in code this project never changed, and every fix was a restructured effect — a
       * behaviour change — so they were adopted as warnings rather than carried onto the branch in
       * front of CWS review mid-sweep.
       *
       * All 15 are paid down (#16), so they are errors now. Warnings were the right call for a
       * known debt with a ticket on it; leaving them as warnings once the debt is cleared would
       * only mean the next one goes unnoticed, since nothing fails on a warning.
       *
       * One suppression stands, in `SpotlightTour`, with its reasoning next to it: it measures DOM
       * this project does not own, so there is no ref to attach and no derivation to compute.
       */
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/refs': 'error',
      'react-hooks/preserve-manual-memoization': 'error',
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  // Overrides Rules
  {
    files: ['**/packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
);
