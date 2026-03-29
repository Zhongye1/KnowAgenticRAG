// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(async ({ mode }) => ({
  // 生产环境不加载 devtools，减小包体积
  plugins: [
    vue(),
    svgLoader(),
    ...(mode === 'development' ? [(await import('vite-plugin-vue-devtools')).default()] : [])
  ],
  server: {
    hmr: true,
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/lens-api': {
        target: 'https://api.lens.org',
        changeOrigin: true,
        secure: false,
        rewrite: path => path.replace(/^\/lens-api/, '')
      }
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    // 提高 chunk 警告阈值（图谱库体积天然较大）
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // 手动分包：将大依赖拆出，充分利用浏览器并行加载 + 缓存
        manualChunks: {
          // Vue 核心
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          // TDesign 组件库（最大单体）
          'vendor-tdesign': ['tdesign-vue-next'],
          // 图谱可视化（sigma + graphology，体积 ~170kB）
          'vendor-graph': ['sigma', 'graphology', 'graphology-layout-forceatlas2'],
          // Markdown 渲染
          'vendor-marked': ['marked'],
          // 网络请求
          'vendor-axios': ['axios']
        }
      }
    }
  }
}))
