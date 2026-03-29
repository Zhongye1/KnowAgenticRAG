<template>
  <!-- 全局错误边界 + Toast 增强组件 -->
  <!-- 用法：在 App.vue 内部包裹，捕获子组件未处理的异常 -->
  <slot v-if="!hasError" />
  <div v-else class="error-boundary">
    <div class="error-boundary__card">
      <div class="error-boundary__icon">💥</div>
      <h2>页面出现错误</h2>
      <p class="error-boundary__msg">{{ errorMessage }}</p>
      <div class="error-boundary__actions">
        <button class="btn-retry" @click="retry">🔄 重新加载</button>
        <button class="btn-home" @click="goHome">🏠 返回首页</button>
      </div>
      <details class="error-boundary__detail">
        <summary>查看错误详情</summary>
        <pre>{{ errorStack }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const hasError = ref(false)
const errorMessage = ref('')
const errorStack = ref('')

onErrorCaptured((err: Error) => {
  hasError.value = true
  errorMessage.value = err.message || '未知错误'
  errorStack.value = err.stack || ''
  console.error('[ErrorBoundary] 捕获到未处理错误:', err)
  return false // 阻止继续传播
})

function retry() {
  hasError.value = false
  errorMessage.value = ''
  errorStack.value = ''
  window.location.reload()
}

function goHome() {
  hasError.value = false
  router.push('/knowledge')
}
</script>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f9fafb;
  padding: 24px;
}
.error-boundary__card {
  max-width: 520px;
  width: 100%;
  background: white;
  border-radius: 16px;
  padding: 40px 32px;
  text-align: center;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
}
.error-boundary__icon {
  font-size: 48px;
  margin-bottom: 16px;
}
.error-boundary__card h2 {
  font-size: 20px;
  color: #111827;
  margin: 0 0 8px;
}
.error-boundary__msg {
  color: #6b7280;
  font-size: 14px;
  margin-bottom: 24px;
}
.error-boundary__actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 20px;
}
.btn-retry,
.btn-home {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  border: none;
  font-weight: 500;
}
.btn-retry {
  background: #4f7ef8;
  color: white;
}
.btn-retry:hover {
  background: #3b6fd4;
}
.btn-home {
  background: #f3f4f6;
  color: #374151;
}
.btn-home:hover {
  background: #e5e7eb;
}
.error-boundary__detail {
  text-align: left;
  background: #f9fafb;
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  color: #6b7280;
}
.error-boundary__detail pre {
  margin: 8px 0 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 11px;
  color: #9ca3af;
}
</style>
