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
    // 本地临时目录（截图、chrome profile、一次性探针脚本等），不进版本库也不参与 lint
    'tmp',
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
