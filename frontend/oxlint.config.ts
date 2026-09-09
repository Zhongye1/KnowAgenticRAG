import { defineConfig } from 'oxlint';

export default defineConfig({
  env: {
    browser: true,
    node: true,
    es2022: true,
    es6: true,
  },
  plugins: [
    'eslint',
    'typescript',
    'oxc',
    'react',
    'jsx-a11y',
    'import',
    'jest',
    'vitest',
    'unicorn',
  ],
  settings: {
    react: {
      version: '18.3.1',
    },
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    'coverage',
    'public/mockServiceWorker.js',
    'generators',
    'e2e',
    '*.hbs',
  ],
  rules: {
    'typescript/no-unused-vars': ['error', { caughtErrors: 'none' }],
    'typescript/no-explicit-any': 'off',
    'typescript/no-empty-function': 'off',
    'typescript/explicit-function-return-type': 'off',
    'typescript/explicit-module-boundary-types': 'off',
    'vitest/require-mock-type-parameters': 'off',
    'import/no-cycle': 'error',
  },
});
