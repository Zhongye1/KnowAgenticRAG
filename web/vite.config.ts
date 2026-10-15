/// <reference types="vite/client" />

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import type { PluginOption } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import inspector from 'vite-plugin-dev-inspector';
import { defineConfig as defineVitestConfig } from 'vitest/config';

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // 浏览器只访问同源路径，跨服务转发由这里的代理完成：容器内指向服务名，宿主机指向 localhost。
  const apiTarget = env.VITE_API_URL || 'http://localhost:5050';
  const minioTarget = env.VITE_MINIO_URL || 'http://localhost:9000';

  return {
    base: './',
    plugins: [
      // data-v-inspector
      inspector({
        enabled: ISDEV,
        toggleButtonVisibility: 'always',
        launchEditor: 'code',
      }),
      stripFragmentInspector(),
      // 启用 React Compiler，编译期自动 memoization
      react({ compiler: true }),
    ],
    resolve: {
      tsconfigPaths: true,
      alias: {
        '@': path.resolve(rootDir, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '^/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        // 后端返回相对对象 URL（MINIO_PUBLIC_URL 默认 /minio），此处去掉前缀转发给 MinIO。
        '^/minio/public/': {
          target: minioTarget,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/minio/, ''),
        },
      },
      watch: {
        usePolling: true,
        ignored: ['**/node_modules/**', '**/dist/**'],
      },
    },
    preview: {
      port: 5173,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './test/setup-tests.ts',
      exclude: ['**/node_modules/**', '**/e2e/**'],
      // 默认按 CPU 数开满 worker；本机同时跑 docker 栈与浏览器验证时，
      // 几十个 jsdom 文件互相抢核会把 userEvent 用例顶过 5 秒默认预算（假失败）。
      // 限到一半核数，换稳定性；用例自身的超时预算不因此放宽。
      maxWorkers: '50%',
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
  } satisfies ReturnType<typeof defineVitestConfig>;
});
