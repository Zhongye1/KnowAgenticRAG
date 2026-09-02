/// <reference types="vite/client" />

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import type { PluginOption } from 'vite';
import { defineConfig } from 'vitest/config';
import inspector from 'vite-plugin-dev-inspector';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const ISDEV = process.env.NODE_ENV === 'development';

/**
 * vite-plugin-dev-inspector 会给 JSX 元素注入 `data-v-inspector` 定位属性，
 * 但 React.Fragment 只接受 key/children，携带该属性会触发
 * "Invalid prop `data-v-inspector` supplied to `React.Fragment`"。
 * 该插件未过滤 `<Fragment>`/`<React.Fragment>`（Vue 模板侧有 EXCLUDE_TAG，
 * JSX 侧漏掉了），这里在 React 编译前把这些属性从 Fragment 打开标签上剥掉。
 */
function stripFragmentInspector(): PluginOption {
  return {
    name: 'strip-fragment-dev-inspector',
    enforce: 'pre',
    transform(code) {
      if (!code.includes('data-v-inspector') || !code.includes('Fragment')) {
        return null;
      }
      const next = code.replace(
        /(<(?:React\.)?Fragment\b[^>]*?)\s+data-v-inspector="[^"]*"(\s*\/?>)/g,
        '$1$2',
      );
      return next === code ? null : next;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    inspector({
      enabled: ISDEV,
      toggleButtonVisibility: 'always', // always默认展示切换icon；never不展示icon（使用快捷键唤醒）
      launchEditor: 'code',
    }),
    stripFragmentInspector(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    port: 5000,
  },
  preview: {
    port: 5000,
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
