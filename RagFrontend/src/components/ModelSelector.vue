<template>
  <!-- 多模型选择器组件 -->
  <div class="model-selector">
    <!-- 当前模型展示按钮 -->
    <button class="model-trigger" @click="showPanel = !showPanel" :title="selectedModel?.name">
      <span class="model-trigger__provider-dot" :class="`dot--${selectedModel?.provider || 'ollama'}`"></span>
      <span class="model-trigger__name">{{ selectedModel?.name || '选择模型' }}</span>
      <svg class="model-trigger__arrow" :class="{ 'rotated': showPanel }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
      </svg>
    </button>

    <!-- 模型面板 -->
    <Teleport to="body">
      <div v-if="showPanel" class="model-panel-overlay" @click.self="showPanel = false">
        <div class="model-panel" :style="panelStyle">
          <div class="model-panel__header">
            <span>选择模型</span>
            <button @click="showPanel = false" class="panel-close">✕</button>
          </div>

          <!-- 加载状态 -->
          <div v-if="loading" class="model-panel__loading">
            <div class="spinner"></div>
            <span>加载模型列表...</span>
          </div>

          <template v-else>
            <!-- 本地模型 -->
            <div class="model-group">
              <div class="model-group__label">
                <span class="provider-dot dot--ollama"></span>
                本地模型（Ollama）
              </div>
              <div v-for="m in localModels" :key="m.id"
                :class="['model-item', { 'model-item--active': modelValue === m.id, 'model-item--disabled': !m.available }]"
                @click="selectModel(m)">
                <div class="model-item__info">
                  <span class="model-item__name">{{ m.name }}</span>
                  <span class="model-item__desc">{{ m.description }}</span>
                </div>
                <span v-if="modelValue === m.id" class="model-item__check">✓</span>
              </div>
            </div>

            <!-- 云端模型 -->
            <div v-for="(group, provider) in cloudGroups" :key="provider" class="model-group">
              <div class="model-group__label">
                <span class="provider-dot" :class="`dot--${provider}`"></span>
                {{ providerNames[provider] }}
                <span v-if="!group[0]?.available" class="provider-badge badge--unconfigured">未配置</span>
              </div>
              <div v-for="m in group" :key="m.id"
                :class="['model-item', { 'model-item--active': modelValue === m.id, 'model-item--unavailable': !m.available }]"
                @click="m.available ? selectModel(m) : openKeyConfig(provider)">
                <div class="model-item__info">
                  <span class="model-item__name">{{ m.name }}</span>
                  <span class="model-item__desc">{{ m.description }}</span>
                  <span v-if="!m.available" class="model-item__key-hint">
                    🔑 需要配置 {{ m.requires_key }}
                  </span>
                </div>
                <span v-if="modelValue === m.id" class="model-item__check">✓</span>
                <button v-else-if="!m.available" class="config-key-btn" @click.stop="openKeyConfig(provider)">配置</button>
              </div>
            </div>
          </template>

          <!-- API Key 配置区 -->
          <div v-if="keyConfigProvider" class="key-config-section">
            <div class="key-config__title">配置 {{ providerNames[keyConfigProvider] }} API Key</div>
            <div v-for="field in keyConfigFields" :key="field.key" class="key-config__field">
              <label>{{ field.label }}</label>
              <input
                :type="field.type || 'text'"
                v-model="keyConfigValues[field.key]"
                :placeholder="field.placeholder"
                class="key-input"
              />
            </div>
            <div class="key-config__actions">
              <button class="btn-cancel-sm" @click="keyConfigProvider = null">取消</button>
              <button class="btn-save-key" @click="saveApiKey">保存密钥</button>
            </div>
            <p class="key-config__hint">密钥将保存在本地 localStorage，不上传服务器</p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import axios from 'axios'
import { MessagePlugin } from 'tdesign-vue-next'

interface ModelInfo {
  id: string
  name: string
  provider: string
  description: string
  context_length: number
  available: boolean
  requires_key?: string
}

const props = defineProps<{
  modelValue: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
  (e: 'change', model: ModelInfo): void
}>()

const showPanel = ref(false)
const loading = ref(false)
const models = ref<ModelInfo[]>([])
const keyConfigProvider = ref<string | null>(null)
const keyConfigValues = ref<Record<string, string>>({})

// 面板定位（简单居中）
const panelStyle = ref({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' })

const providerNames: Record<string, string> = {
  ollama: '本地 Ollama',
  deepseek: 'DeepSeek（深度推理）',
  openai: 'OpenAI',
  hunyuan: '腾讯混元',
}

const keyConfigFieldsMap: Record<string, Array<{ key: string; label: string; type?: string; placeholder: string }>> = {
  deepseek: [{ key: 'DEEPSEEK_API_KEY', label: 'API Key', type: 'password', placeholder: 'sk-...' }],
  openai: [
    { key: 'OPENAI_API_KEY', label: 'API Key', type: 'password', placeholder: 'sk-...' },
    { key: 'OPENAI_BASE_URL', label: '服务地址（可选）', placeholder: 'https://api.openai.com/v1' },
  ],
  hunyuan: [
    { key: 'HUNYUAN_SECRET_ID', label: 'SecretId', placeholder: 'AKIDxxx...' },
    { key: 'HUNYUAN_SECRET_KEY', label: 'SecretKey', type: 'password', placeholder: 'xxx...' },
  ],
}

const keyConfigFields = computed(() =>
  keyConfigProvider.value ? (keyConfigFieldsMap[keyConfigProvider.value] || []) : []
)

const selectedModel = computed(() =>
  models.value.find(m => m.id === props.modelValue) || null
)

const localModels = computed(() =>
  models.value.filter(m => m.provider === 'ollama')
)

const cloudGroups = computed(() => {
  const groups: Record<string, ModelInfo[]> = {}
  models.value
    .filter(m => m.provider !== 'ollama')
    .forEach(m => {
      if (!groups[m.provider]) groups[m.provider] = []
      groups[m.provider].push(m)
    })
  return groups
})

async function fetchModels() {
  loading.value = true
  try {
    const res = await axios.get('/api/models/list')
    models.value = res.data.models || []
    // 从 localStorage 读取已配置的 key，更新 available 状态
    models.value.forEach(m => {
      if (m.requires_key) {
        const stored = localStorage.getItem(m.requires_key)
        if (stored) m.available = true
      }
    })
  } catch (e) {
    // 后端未连接时使用默认本地模型
    models.value = [
      { id: 'qwen2:0.5b', name: 'Qwen2 0.5B（本地）', provider: 'ollama', description: '推荐本地模型', context_length: 8192, available: true },
      { id: 'qwen:7b-chat', name: 'Qwen 7B Chat（本地）', provider: 'ollama', description: '高质量本地模型', context_length: 8192, available: true },
    ]
  } finally {
    loading.value = false
  }
}

function selectModel(m: ModelInfo) {
  if (!m.available) return
  emit('update:modelValue', m.id)
  emit('change', m)
  showPanel.value = false
}

function openKeyConfig(provider: string) {
  keyConfigProvider.value = provider
  // 预填 localStorage 中已有的值
  const fields = keyConfigFieldsMap[provider] || []
  const vals: Record<string, string> = {}
  fields.forEach(f => { vals[f.key] = localStorage.getItem(f.key) || '' })
  keyConfigValues.value = vals
}

function saveApiKey() {
  const fields = keyConfigFields.value
  fields.forEach(f => {
    const val = keyConfigValues.value[f.key]?.trim()
    if (val) localStorage.setItem(f.key, val)
  })
  // 刷新模型可用状态
  fetchModels()
  keyConfigProvider.value = null
  MessagePlugin.success('API Key 已保存到本地，重新加载模型...')
  // 通知后端（可选）
}

onMounted(fetchModels)
</script>

<style scoped>
.model-selector { position: relative; display: inline-flex; }

/* 触发按钮 */
.model-trigger {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; border-radius: 8px;
  border: 1px solid #e5e7eb; background: #f9fafb;
  cursor: pointer; font-size: 13px; color: #374151;
  transition: all 0.2s; max-width: 220px; white-space: nowrap;
}
.model-trigger:hover { background: #f3f4f6; border-color: #d1d5db; }
.model-trigger__name { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.model-trigger__arrow { width: 14px; height: 14px; transition: transform 0.2s; flex-shrink: 0; }
.model-trigger__arrow.rotated { transform: rotate(180deg); }

/* Provider 颜色点 */
.provider-dot, .model-trigger__provider-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.dot--ollama { background: #22c55e; }
.dot--deepseek { background: #3b82f6; }
.dot--openai { background: #8b5cf6; }
.dot--hunyuan { background: #f59e0b; }

/* 覆盖层 */
.model-panel-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.15);
}

/* 面板 */
.model-panel {
  position: fixed; width: 380px; max-height: 80vh; overflow-y: auto;
  background: white; border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
  padding: 0;
  scrollbar-width: thin;
}

.model-panel__header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px 10px; border-bottom: 1px solid #f0f0f0;
  font-weight: 600; font-size: 14px; color: #111827;
  position: sticky; top: 0; background: white; z-index: 1;
}
.panel-close {
  background: none; border: none; cursor: pointer;
  font-size: 14px; color: #9ca3af; padding: 2px 6px; border-radius: 4px;
}
.panel-close:hover { background: #f3f4f6; color: #374151; }

/* 加载 */
.model-panel__loading {
  display: flex; align-items: center; gap: 8px;
  padding: 20px 16px; color: #6b7280; font-size: 13px;
}
.spinner {
  width: 16px; height: 16px; border: 2px solid #e5e7eb;
  border-top-color: #4f7ef8; border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* 模型分组 */
.model-group { padding: 8px 12px 4px; }
.model-group + .model-group { border-top: 1px solid #f5f5f5; }
.model-group__label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600; color: #9ca3af;
  text-transform: uppercase; letter-spacing: 0.04em;
  padding: 4px 4px 6px;
}

/* 模型条目 */
.model-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 8px; border-radius: 8px; cursor: pointer;
  transition: background 0.15s; margin-bottom: 2px;
}
.model-item:hover { background: #f9fafb; }
.model-item--active { background: #eff6ff; }
.model-item--disabled, .model-item--unavailable { opacity: 0.6; }
.model-item--unavailable { cursor: pointer; }

.model-item__info { flex: 1; min-width: 0; }
.model-item__name { display: block; font-size: 13px; font-weight: 500; color: #111827; }
.model-item__desc { display: block; font-size: 11px; color: #9ca3af; margin-top: 1px; }
.model-item__key-hint { display: block; font-size: 11px; color: #f59e0b; margin-top: 2px; }
.model-item__check { color: #4f7ef8; font-weight: 700; font-size: 14px; }

/* 配置按钮 */
.config-key-btn {
  padding: 3px 8px; border-radius: 5px;
  background: #eff6ff; color: #4f7ef8;
  border: 1px solid #bfdbfe; font-size: 11px; cursor: pointer;
}
.config-key-btn:hover { background: #dbeafe; }

/* Provider badge */
.provider-badge {
  font-size: 10px; padding: 1px 5px; border-radius: 4px;
}
.badge--unconfigured { background: #fef3c7; color: #92400e; }

/* Key 配置区 */
.key-config-section {
  margin: 8px 12px 12px; padding: 12px;
  background: #f9fafb; border-radius: 8px;
  border: 1px solid #e5e7eb;
}
.key-config__title {
  font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 10px;
}
.key-config__field { margin-bottom: 8px; }
.key-config__field label {
  display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px;
}
.key-input {
  width: 100%; padding: 6px 10px; border: 1px solid #d1d5db;
  border-radius: 6px; font-size: 13px; outline: none;
}
.key-input:focus { border-color: #4f7ef8; box-shadow: 0 0 0 2px rgba(79,126,248,0.15); }
.key-config__actions {
  display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px;
}
.btn-cancel-sm {
  padding: 5px 12px; border-radius: 6px; border: 1px solid #d1d5db;
  background: white; font-size: 12px; cursor: pointer; color: #374151;
}
.btn-save-key {
  padding: 5px 12px; border-radius: 6px; border: none;
  background: #4f7ef8; color: white; font-size: 12px; cursor: pointer;
}
.btn-save-key:hover { background: #3b6fd4; }
.key-config__hint {
  font-size: 11px; color: #9ca3af; margin-top: 6px;
}
</style>
