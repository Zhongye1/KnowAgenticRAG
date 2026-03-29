<template>
  <div class="flex-1 p-6 overflow-auto fade-in-container">
    <div class="max-w-4xl">
      <h2 class="text-2xl font-bold mb-6 settings-title">Ollama 设置</h2>

      <!-- 服务器配置 -->
      <div class="bg-white rounded-lg shadow p-6 mb-6 config-card">
        <h3 class="text-lg font-medium mb-4">服务器配置</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">服务器地址</label>
            <t-input
              v-model="serverUrl"
              placeholder="http://localhost:11434"
              class="transition-all duration-300"
            />
            <p class="text-xs text-gray-500 mt-1">本地模型则为: http://localhost:11434</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">连接超时（秒）</label>
            <t-input-number
              v-model="timeout"
              :min="1"
              :max="300"
              class="transition-all duration-300"
            />
          </div>
        </div>
      </div>

      <!-- 保存按钮 -->
      <div class="mt-6 save-button">
        <t-button theme="primary" class="transition-all duration-300" @click="saveSettings">
          保存设置
        </t-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

// 设置状态
const serverUrl = ref('http://localhost:11434')
const timeout = ref(30)

// 组件挂载时加载设置
onMounted(() => {
  loadSettings()
})

// 保存设置
const saveSettings = () => {
  const settings = {
    serverUrl: serverUrl.value,
    timeout: timeout.value
  }

  localStorage.setItem('ollamaSettings', JSON.stringify(settings))
  MessagePlugin.success('设置已保存')

  // 发送事件通知其他组件设置已更新
  window.dispatchEvent(
    new CustomEvent('ollamaSettingsUpdated', {
      detail: settings
    })
  )
}

// 加载设置
const loadSettings = () => {
  const savedSettings = localStorage.getItem('ollamaSettings')
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings)
      serverUrl.value = settings.serverUrl || 'http://localhost:11434'
      timeout.value = settings.timeout || 30
    } catch (e) {
      console.error('加载设置失败:', e)
      MessagePlugin.error('加载设置失败')
    }
  }
}
</script>
<style scoped>
/* 容器淡入动画 */
.fade-in-container {
  animation: fadeInUp 0.6s ease-out;
}

/* 设置标题动画 */
.settings-title {
  animation: slideInFromTop 0.5s ease-out;
}

/* 配置卡片动画 */
.config-card {
  animation: fadeInUp 0.8s ease-out 0.2s both;
}

/* 保存按钮动画 */
.save-button {
  animation: fadeInUp 0.6s ease-out 0.4s both;
}

/* 动画定义 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInFromTop {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 输入框交互增强 */
.t-input,
.t-input-number {
  transition: all 0.3s ease;
}

.t-input:focus,
.t-input-number:focus {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* 按钮悬停效果 */
.t-button {
  transition: all 0.3s ease;
}

.t-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}
</style>
