<template>
  <div class="flex-1 p-6 overflow-auto">
    <!-- 操作按钮 -->
    <div class="flex gap-4 mb-6 items-center">
      <t-button
        class="transition-all table-container duration-300"
        variant="outline"
        :loading="loading"
        @click="refreshModels"
      >
        刷新模型列表
      </t-button>
      <t-button
        class="table-container transition-all duration-300"
        variant="outline"
        :disabled="selectedModels.length === 0"
        @click="deleteSelected"
      >
        删除模型 ({{ selectedModels.length }})
      </t-button>
      <t-checkbox
        v-model="isAllSelected"
        class="table-container transition-all duration-300"
        :indeterminate="isIndeterminate"
        @change="handleSelectAll"
      >
        全选
      </t-checkbox>
      <span v-if="pinnedModels.length > 0" class="text-sm text-blue-500 font-medium ml-2"
        >📌 {{ pinnedModels.length }} 个已置顶</span
      >
    </div>

    <!-- 置顶模型区 -->
    <div v-if="pinnedModels.length > 0" class="pinned-models-section mb-4">
      <div class="pinned-models-header">📌 置顶模型</div>
      <div class="pinned-models-list">
        <div v-for="model in pinnedModels" :key="model.name" class="pinned-model-item">
          <span class="pinned-model-name">{{ model.name }}</span>
          <span class="pinned-model-size text-gray-400 text-xs ml-2">{{
            formatSize(model.size)
          }}</span>
          <button class="unpin-model-btn" title="取消置顶" @click="togglePinModel(model)">✕</button>
        </div>
      </div>
    </div>

    <!-- 模型表格 -->
    <div class="bg-white rounded-lg shadow table-container">
      <t-table
        :data="models"
        :columns="columns"
        :loading="loading"
        row-key="name"
        :selected-row-keys="selectedModels"
        :pagination="{ disabled: true }"
        size="medium"
        hover
        @select-change="onSelectChange"
      >
        <!-- 表格模板插槽 -->
        <template #row-select="{ row }">
          <t-checkbox
            :checked="selectedModels.includes(row.name)"
            @change="checked => handleRowSelect(checked, row)"
          />
        </template>
        <template #size="{ row }">
          {{ formatSize(row.size) }}
        </template>
        <template #modified_at="{ row }">
          {{ formatTime(row.modified_at) }}
        </template>
        <template #digest="{ row }">
          <span class="font-mono text-gray-600">{{ row.digest?.slice(0, 8) }}</span>
        </template>
        <template #operation="{ row }">
          <t-space>
            <t-button
              :class="['z-10', pinnedModelNames.has(row.name) ? 'text-blue-600' : 'text-gray-500']"
              variant="text"
              size="small"
              :title="pinnedModelNames.has(row.name) ? '取消置顶' : '置顶'"
              @click="togglePinModel(row)"
            >
              {{ pinnedModelNames.has(row.name) ? '📌' : '置顶' }}
            </t-button>
            <t-button
              class="z-10 bg-red-600 text-white :hover:bg-red-700"
              variant="text"
              size="small"
              @click="deleteModel(row.name)"
              >删除</t-button
            >
          </t-space>
        </template>
      </t-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject, onMounted, onUnmounted } from 'vue'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'

// 注入共享的 API 服务
const ollamaApi = inject('ollamaApi')

// 组件内部状态
const loading = ref(false)
const models = ref([])
const selectedModels = ref([])

// 置顶功能
const MODEL_PIN_KEY = 'model_pinned_names'
const pinnedModelNames = ref(new Set(JSON.parse(localStorage.getItem(MODEL_PIN_KEY) || '[]')))

const togglePinModel = model => {
  const s = new Set(pinnedModelNames.value)
  if (s.has(model.name)) {
    s.delete(model.name)
    MessagePlugin.info(`「${model.name}」已取消置顶`)
  } else {
    s.add(model.name)
    MessagePlugin.success(`「${model.name}」已置顶`)
  }
  pinnedModelNames.value = s
  localStorage.setItem(MODEL_PIN_KEY, JSON.stringify([...s]))
}

const pinnedModels = computed(() => models.value.filter(m => pinnedModelNames.value.has(m.name)))

// 计算属性
const isAllSelected = ref(false)
const isIndeterminate = computed(() => {
  return selectedModels.value.length > 0 && selectedModels.value.length < models.value.length
})

// 表格列配置
// 表格列配置
const columns = [
  {
    colKey: 'row-select',
    type: 'multiple',
    width: 50,
    fixed: 'left',
    className: 'checkbox-cell'
    //checkProps: ({ row }) => ({ disabled: false }),
  },
  {
    title: '模型名称',
    colKey: 'name',
    width: 300
  },
  {
    title: '模型大小',
    colKey: 'size',
    width: 150
  },
  {
    title: 'ID',
    colKey: 'digest',
    width: 150
  },
  {
    title: '下载时间',
    colKey: 'modified_at',
    width: 150
  },
  {
    title: '操作',
    colKey: 'operation',
    width: 120
  }
]

// 方法实现
// 方法

const refreshModels = async () => {
  loading.value = true
  try {
    models.value = await ollamaApi.getModels()
  } finally {
    loading.value = false
  }
}

const onSelectChange = selectedRowKeys => {
  selectedModels.value = selectedRowKeys
  isAllSelected.value = selectedRowKeys.length === models.value.length
}

const handleRowSelect = (checked, row) => {
  if (checked) {
    if (!selectedModels.value.includes(row.name)) {
      selectedModels.value.push(row.name)
    }
  } else {
    selectedModels.value = selectedModels.value.filter(name => name !== row.name)
  }
  isAllSelected.value = selectedModels.value.length === models.value.length
}

const handleSelectAll = checked => {
  if (checked) {
    selectedModels.value = models.value.map(item => item.name)
  } else {
    selectedModels.value = []
  }
}

const deleteSelected = async () => {
  if (selectedModels.value.length === 0) return

  const dialog = DialogPlugin.confirm({
    header: '删除确认',
    body: `确定要删除选中的 ${selectedModels.value.length} 个模型吗？`,
    onConfirm: async () => {
      loading.value = true
      try {
        for (const modelName of selectedModels.value) {
          await ollamaApi.deleteModel(modelName)
        }
        MessagePlugin.success('删除成功')
        selectedModels.value = []
        isAllSelected.value = false
        await refreshModels()
        dialog.destroy() // 删除成功后关闭弹窗
      } catch (error) {
        MessagePlugin.error('删除失败' + error)
        dialog.destroy() // 删除失败后也关闭弹窗
      } finally {
        loading.value = false
      }
    }
  })
  return
}

const deleteModel = async modelName => {
  const dialog = DialogPlugin.confirm({
    // 保存弹窗实例
    header: '删除确认',
    body: `确定要删除模型 ${modelName} 吗？`,
    onConfirm: async () => {
      loading.value = true
      try {
        await ollamaApi.deleteModel(modelName)
        MessagePlugin.success('删除成功')
        // 如果当前模型在选中列表中，则从选中列表中移除
        if (selectedModels.value.includes(modelName)) {
          selectedModels.value = selectedModels.value.filter(name => name !== modelName)
        }
        await refreshModels()
        dialog.destroy() // 删除成功后关闭弹窗
      } catch (error) {
        MessagePlugin.error('删除失败' + error)
        dialog.destroy() // 删除失败后也关闭弹窗
      } finally {
        loading.value = false
      }
    }
  })
}

// 在现有代码后添加工具函数
const formatSize = bytes => {
  if (!bytes) return '-'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

const formatTime = timestamp => {
  if (!timestamp) return '-'

  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const handleSettingsUpdated = () => {
  // 设置更新后刷新模型列表
  refreshModels()
}

onMounted(() => {
  refreshModels()
  window.addEventListener('ollamaSettingsUpdated', handleSettingsUpdated)
})

onUnmounted(() => {
  window.removeEventListener('ollamaSettingsUpdated', handleSettingsUpdated)
})
</script>
<style scoped>
/* 置顶区域 */
.pinned-models-section {
  background: linear-gradient(135deg, #eff6ff, #f5f3ff);
  border: 1px solid #c7d2fe;
  border-radius: 10px;
  padding: 12px 16px;
}
.pinned-models-header {
  font-size: 13px;
  font-weight: 600;
  color: #4f7ef8;
  margin-bottom: 8px;
}
.pinned-models-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pinned-model-item {
  display: flex;
  align-items: center;
  background: white;
  border-radius: 7px;
  padding: 7px 12px;
  border: 1px solid #e0e7ff;
}
.pinned-model-name {
  font-size: 13px;
  color: #374151;
  flex: 1;
  font-family: monospace;
}
.unpin-model-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s;
}
.unpin-model-btn:hover {
  background: #fee2e2;
  color: #ef4444;
}

/* 容器淡入动画 */
.fade-in-container {
  animation: fadeInUp 0.6s ease-out;
}

/* 操作按钮区域动画 */
.controls-container {
  animation: slideInFromTop 0.5s ease-out;
}

/* 表格容器动画 */
.table-container {
  animation: fadeInUp 0.8s ease-out 0.2s both;
}

/* 表格行逐行浮入 */
.table-row-enter {
  animation: fadeInRow 0.4s ease-out both;
}

/* 主要动画定义 */
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

@keyframes fadeInRow {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 加载状态动画 */
.loading-container {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.7;
  }

  50% {
    opacity: 1;
  }
}

/* 按钮悬停效果增强 */
.t-button {
  transition: all 0.3s ease;
}

.t-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
</style>
