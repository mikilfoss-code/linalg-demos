// eslint.config.mjs
import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

export default [
  // 1) Ignore build output, deps, etc.
  { ignores: ['dist/**', 'node_modules/**'] },

  // 2) ESLint's base recommended rules (real linting)
  js.configs.recommended,

  // 3) Your project rules for browser/ESM code
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // examples you might want:
      // 'no-console': 'warn',
      // 'no-debugger': 'warn',
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  // 4) MUST be last: disables formatting rules that conflict with Prettier
  eslintConfigPrettier,
];
