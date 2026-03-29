<template>
  <t-layout class="h-screen">
    <!-- 侧边导航 -->
    <t-aside width="232px" class="bg-white border-r border-gray-300">
      <div class="flex items-center gap-2 font-medium p-4 border-b border-gray-300">
        <span class="text-gray-800">Ollama模型管理页面</span>
      </div>

      <t-menu theme="light" :value="activeTab" @change="activeTab = $event">
        <t-menu-item v-for="tab in tabs" :key="tab.key" :value="tab.key">
          {{ tab.label }}
        </t-menu-item>
      </t-menu>
    </t-aside>

    <!-- 内容区域 -->
    <t-layout>
      <t-content class="bg-gray-50 max-h-screen overflow-auto">
        <!-- 动态组件渲染 -->
        <component :is="currentComponent" @model-downloaded="handleModelDownloaded" />
      </t-content>
    </t-layout>
  </t-layout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

//import ollama_model_pages from './Ollama_Pages/ollama_model_pages.vue'
import OllamaModelList from './OllamaModelList.vue'
import OllamaModelDownload from './OllamaModelDownload.vue'
import OllamaSettings from './OllamaSettings.vue'

//import CanvasPoint from '@/components/canvas-point-unit/CanvasPoint.vue'

// 当前活动标签
const activeTab = ref('models')

// 标签配置
const tabs = [
  { key: 'models', label: '模型列表' },
  { key: 'download', label: '下载模型' },
  { key: 'settings', label: '设置' }
]

// 组件映射
const componentMap = {
  models: OllamaModelList,
  download: OllamaModelDownload,
  settings: OllamaSettings
}

// 计算当前组件
const currentComponent = computed(() => componentMap[activeTab.value])

// Ollama服务器URL
const ollamaServerUrl = ref('http://localhost:11434')

// 事件处理
const handleModelDownloaded = () => {
  // 模型下载完成后，如果当前在模型列表页面，则刷新列表
  if (activeTab.value === 'models') {
    // 可以通过 ref 或事件总线通知模型列表组件刷新
  }
}

// 加载设置
const loadSettings = () => {
  const savedSettings = localStorage.getItem('ollamaSettings')
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings)
      ollamaServerUrl.value = settings.serverUrl || 'http://localhost:11434'
    } catch (e) {
      console.error('加载设置失败:', e)
    }
  }
}

// 监听设置更新事件
const handleSettingsUpdated = event => {
  ollamaServerUrl.value = event.detail.serverUrl || 'http://localhost:11434'
}

// API 函数
const ollamaApi = {
  // 获取模型列表
  async getModels() {
    try {
      const response = await fetch(`${ollamaServerUrl.value}/api/tags`)
      const data = await response.json()
      return data.models || []
    } catch (error) {
      console.error('获取模型列表失败:', error)
      MessagePlugin.error('获取模型列表失败')
      return []
    }
  },

  // 删除模型
  async deleteModel(name) {
    try {
      const response = await fetch(`${ollamaServerUrl.value}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      return response.ok
    } catch (error) {
      console.error('删除模型失败:', error)
      return false
    }
  },

  // 下载模型
  async downloadModel(name, onProgress) {
    try {
      const response = await fetch(`${ollamaServerUrl.value}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (onProgress) onProgress(data)
          } catch (e) {
            console.warn('解析进度数据失败:', e)
          }
        }
      }
    } catch (error) {
      console.error('下载模型失败:', error)
      throw error
    }
  },

  // 获取当前服务器URL
  getServerUrl() {
    return ollamaServerUrl.value
  }
}

import { provide } from 'vue' // 添加 provide
provide('ollamaApi', ollamaApi)

// 组件挂载时加载设置并监听更新事件
onMounted(() => {
  loadSettings()
  window.addEventListener('ollamaSettingsUpdated', handleSettingsUpdated)
})
</script>

<style scoped>
.checkbox-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.t-table__row-select) {
  padding-left: 16px;
}
</style>
