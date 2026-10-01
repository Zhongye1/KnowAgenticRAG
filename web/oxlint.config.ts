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
      version: '19.2.8',
    },
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    'coverage',
    'generators',
    'e2e',
    '*.hbs',
    // 契约生成物由生成器负责格式，不参与人工 lint
    'src/apis/generated',
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
