/// <reference types="vite/client" />

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import inspector from 'vite-plugin-dev-inspector';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const ISDEV = process.env.NODE_ENV === 'development';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    inspector({
      enabled: ISDEV,
      toggleButtonVisibility: 'always', // always默认展示切换icon；never不展示icon（使用快捷键唤醒）
      launchEditor: 'idea',
    }),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/testing/setup-tests.ts',
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      include: ['src/**'],
    },
  },
  optimizeDeps: { exclude: ['fsevents'] },
  build: {
    rolldownOptions: {
      external: ['fs/promises'],
      output: {
        codeSplitting: {
          minSize: 3500,
        },
      },
    },
  },
});
