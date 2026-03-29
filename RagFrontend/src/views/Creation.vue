<template>
  <div class="creation-page">
    <div class="creation-sidebar">
      <div class="cs-title">📄 文档创作</div>
      <div
        v-for="t in types"
        :key="t.id"
        :class="['cs-item', activeType === t.id && 'cs-item--active']"
        @click="
          activeType = t.id
          output = ''
        "
      >
        <span class="cs-icon">{{ t.icon }}</span>
        <div>
          <div class="cs-name">{{ t.name }}</div>
          <div class="cs-desc">{{ t.desc }}</div>
        </div>
      </div>
    </div>

    <div class="creation-main">
      <!-- 大纲生成 -->
      <div v-if="activeType === 'outline'" class="creation-form">
        <h3>📋 大纲生成</h3>
        <div class="cf-row">
          <label>主题 / 标题</label>
          <input
            v-model="form.topic"
            placeholder="如：基于RAG的知识库问答系统设计与实现"
            class="cf-input"
          />
        </div>
        <div class="cf-row">
          <label>额外要求</label>
          <textarea
            v-model="form.requirements"
            rows="2"
            class="cf-textarea"
            placeholder="如：技术报告风格，约2000字，面向本科生读者"
          ></textarea>
        </div>
      </div>

      <!-- 摘要生成 -->
      <div v-if="activeType === 'summary'" class="creation-form">
        <h3>📝 摘要生成</h3>
        <div class="cf-row">
          <label>原文（支持粘贴长文本）</label>
          <textarea
            v-model="form.text"
            rows="6"
            class="cf-textarea"
            placeholder="粘贴需要摘要的文章内容..."
          ></textarea>
        </div>
        <div class="cf-row">
          <label>摘要长度（字）</label>
          <input
            v-model.number="form.summaryLength"
            type="number"
            min="50"
            max="1000"
            class="cf-input cf-input--short"
          />
        </div>
      </div>

      <!-- 翻译 -->
      <div v-if="activeType === 'translate'" class="creation-form">
        <h3>🌐 文本翻译</h3>
        <div class="cf-row">
          <label>原文</label>
          <textarea
            v-model="form.text"
            rows="6"
            class="cf-textarea"
            placeholder="粘贴需要翻译的文本..."
          ></textarea>
        </div>
        <div class="cf-row">
          <label>目标语言</label>
          <select v-model="form.targetLang" class="cf-select">
            <option value="英文">英文</option>
            <option value="中文">中文</option>
            <option value="日语">日语</option>
            <option value="法语">法语</option>
            <option value="德语">德语</option>
          </select>
        </div>
      </div>

      <!-- 格式优化 -->
      <div v-if="activeType === 'polish'" class="creation-form">
        <h3>✨ 格式优化</h3>
        <div class="cf-row">
          <label>原文</label>
          <textarea
            v-model="form.text"
            rows="6"
            class="cf-textarea"
            placeholder="粘贴需要优化的文本..."
          ></textarea>
        </div>
        <div class="cf-row">
          <label>优化风格</label>
          <select v-model="form.style" class="cf-select">
            <option value="正式学术风格">正式学术</option>
            <option value="商务正式风格">商务正式</option>
            <option value="通俗易懂风格">通俗易懂</option>
            <option value="简洁精炼风格">简洁精炼</option>
          </select>
        </div>
      </div>

      <!-- 内容扩写 -->
      <div v-if="activeType === 'expand'" class="creation-form">
        <h3>📄 内容扩写</h3>
        <div class="cf-row">
          <label>大纲 / 要点</label>
          <textarea
            v-model="form.outline"
            rows="6"
            class="cf-textarea"
            placeholder="输入大纲或关键要点，每行一条或使用 Markdown 格式..."
          ></textarea>
        </div>
        <div class="cf-row">
          <label>目标字数</label>
          <input
            v-model.number="form.expandLength"
            type="number"
            min="200"
            max="5000"
            class="cf-input cf-input--short"
          />
        </div>
      </div>

      <!-- 生成按钮 -->
      <div class="cf-actions">
        <button class="cf-btn-gen" :disabled="generating" @click="generate">
          {{ generating ? '⏳ 生成中...' : '✨ 立即生成' }}
        </button>
        <!-- 模型选择 -->
        <div class="cf-model-selector">
          <label class="cf-model-label">🤖 模型</label>
          <select
            v-model="selectedModel"
            class="cf-model-select"
            :disabled="generating"
            @change="onModelChange"
          >
            <optgroup label="☁️ 云端模型">
              <option
                v-for="m in availableModels.filter(m => m.provider !== 'ollama')"
                :key="m.id"
                :value="m.id"
                :disabled="!m.available"
              >
                {{ m.name }}{{ !m.available ? ' (需配置Key)' : '' }}
              </option>
            </optgroup>
            <optgroup label="🖥️ 本地模型">
              <option
                v-for="m in availableModels.filter(m => m.provider === 'ollama')"
                :key="m.id"
                :value="m.id"
                :disabled="!m.available"
              >
                {{ m.name }}{{ !m.available ? ' (未启动)' : '' }}
              </option>
            </optgroup>
          </select>
        </div>
        <button v-if="output" class="cf-btn-copy" @click="copyOutput">📋 复制结果</button>
        <button v-if="output" class="cf-btn-clear" @click="output = ''">🗑 清空</button>
      </div>

      <!-- 输出区 -->
      <div v-if="output || generating" class="cf-output">
        <div class="cf-output-header">生成结果</div>
        <div class="cf-output-content" v-html="renderMd(output)"></div>
        <div v-if="generating" class="cf-cursor">▋</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import axios from 'axios'

const types = [
  { id: 'outline', name: '大纲生成', desc: '主题→层次化大纲', icon: '📋' },
  { id: 'summary', name: '摘要生成', desc: '长文本→要点摘要', icon: '📝' },
  { id: 'translate', name: '文本翻译', desc: '中英互译', icon: '🌐' },
  { id: 'polish', name: '格式优化', desc: '润色措辞格式', icon: '✨' },
  { id: 'expand', name: '内容扩写', desc: '大纲→完整文档', icon: '📄' }
]

const activeType = ref('outline')
const generating = ref(false)
const output = ref('')

// ── 模型选择 ─────────────────────────────────────────────────
interface ModelOption {
  id: string
  name: string
  provider: string
  available: boolean
}
const availableModels = ref<ModelOption[]>([])
const selectedModel = ref('')

async function loadModels() {
  try {
    const res = await axios.get<{ models: ModelOption[] }>('/api/models/list')
    if (res.data?.models) {
      availableModels.value = res.data.models
      // 优先选已配置的云端模型
      const saved = localStorage.getItem('creation_selected_model')
      const cloud = res.data.models.find(m => m.provider !== 'ollama' && m.available)
      const local = res.data.models.find(m => m.provider === 'ollama' && m.available)
      if (saved && res.data.models.find(m => m.id === saved)) {
        selectedModel.value = saved
      } else if (cloud) {
        selectedModel.value = cloud.id
      } else if (local) {
        selectedModel.value = local.id
      } else {
        selectedModel.value = res.data.models[0]?.id || 'deepseek-chat'
      }
    }
  } catch {
    // 离线降级
    availableModels.value = [
      { id: 'deepseek-chat', name: 'DeepSeek Chat（云端）', provider: 'deepseek', available: true },
      { id: 'qwen2:0.5b', name: 'Qwen2 0.5B（本地）', provider: 'ollama', available: false }
    ]
    selectedModel.value = 'deepseek-chat'
  }
}

function onModelChange() {
  localStorage.setItem('creation_selected_model', selectedModel.value)
}

const form = reactive({
  topic: '',
  requirements: '技术报告风格，约2000字',
  text: '',
  summaryLength: 300,
  targetLang: '英文',
  style: '正式学术风格',
  outline: '',
  expandLength: 1500
})

async function generate() {
  generating.value = true
  output.value = ''

  const model = selectedModel.value

  const endpointMap: Record<string, { url: string; body: any }> = {
    outline: {
      url: '/api/creation/outline',
      body: { topic: form.topic, requirements: form.requirements, model }
    },
    summary: {
      url: '/api/creation/summary',
      body: { text: form.text, length: form.summaryLength, model }
    },
    translate: {
      url: '/api/creation/translate',
      body: { text: form.text, target_lang: form.targetLang, model }
    },
    polish: { url: '/api/creation/polish', body: { text: form.text, style: form.style, model } },
    expand: {
      url: '/api/creation/expand',
      body: { outline: form.outline, target_length: form.expandLength, model }
    }
  }

  const { url, body } = endpointMap[activeType.value]

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!resp.ok) {
      output.value = `[错误] 服务器返回 ${resp.status}，请检查后端是否正常运行`
      return
    }

    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let finished = false

    while (!finished) {
      const { done, value } = await reader.read()
      if (done) break

      buf += decoder.decode(value, { stream: true })
      // 按行处理，避免 chunk 不完整导致 JSON 截断
      const lines = buf.split('\n')
      buf = lines.pop() ?? '' // 最后一行可能不完整，留待下次

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const token = trimmed.slice(6)
        if (token === '[DONE]') {
          finished = true
          break
        }
        if (token.startsWith('[ERROR]')) {
          output.value += `\n\n⚠️ ${token.slice(8)}`
          finished = true
          break
        }
        if (token) {
          output.value += token
        }
      }
    }
  } catch (e: any) {
    output.value = `[错误] ${e?.message || e}`
  } finally {
    generating.value = false
  }
}

function copyOutput() {
  navigator.clipboard.writeText(output.value)
}

function renderMd(text: string): string {
  // 简单 Markdown 渲染（标题 + 粗体 + 代码块）
  return text
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>')
}

onMounted(() => {
  loadModels()
})
</script>

<style scoped>
.creation-page {
  display: flex;
  gap: 0;
  height: calc(100vh - 120px);
  min-height: 500px;
}
.creation-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid #e5e7eb;
  padding: 16px 8px;
  background: var(--td-bg-color-secondarycontainer, #f9fafb);
}
.cs-title {
  font-size: 14px;
  font-weight: 700;
  padding: 0 8px 12px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 10px;
}
.cs-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 2px;
}
.cs-item:hover {
  background: #f3f4f6;
}
.cs-item--active {
  background: #eff6ff;
}
.cs-icon {
  font-size: 18px;
}
.cs-name {
  font-size: 13px;
  font-weight: 600;
}
.cs-desc {
  font-size: 11px;
  color: #9ca3af;
}

.creation-main {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}
.creation-form h3 {
  margin: 0 0 16px;
  font-size: 16px;
}
.cf-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
}
.cf-row label {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}
.cf-input,
.cf-textarea,
.cf-select {
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  background: var(--td-bg-color-container, #fff);
  color: var(--td-text-color-primary, #111);
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
  font-family: inherit;
}
.cf-input:focus,
.cf-textarea:focus {
  border-color: #6366f1;
}
.cf-input--short {
  max-width: 120px;
}
.cf-select {
  appearance: auto;
}
.cf-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.cf-btn-gen {
  padding: 9px 26px;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}
.cf-btn-gen:hover:not(:disabled) {
  background: #4f46e5;
}
.cf-btn-gen:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.cf-btn-copy,
.cf-btn-clear {
  padding: 9px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  background: #f9fafb;
}
.cf-btn-copy:hover {
  background: #f3f4f6;
}
.cf-btn-clear:hover {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #dc2626;
}
.cf-output {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
.cf-output-header {
  padding: 8px 14px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}
.cf-output-content {
  padding: 14px;
  font-size: 14px;
  line-height: 1.7;
  max-height: 500px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.cf-output-content :deep(h1),
.cf-output-content :deep(h2),
.cf-output-content :deep(h3) {
  margin: 10px 0 6px;
}
.cf-output-content :deep(pre) {
  background: #f3f4f6;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
}
.cf-cursor {
  display: inline-block;
  animation: blink 1s step-end infinite;
  color: #6366f1;
  padding: 0 14px 10px;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* 模型选择器 */
.cf-model-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cf-model-label {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}
.cf-model-select {
  font-size: 12px;
  padding: 5px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: var(--td-bg-color-container, #fff);
  color: var(--td-text-color-primary, #111);
  cursor: pointer;
  max-width: 200px;
  outline: none;
  transition: border-color 0.15s;
}
.cf-model-select:hover:not(:disabled),
.cf-model-select:focus:not(:disabled) {
  border-color: #6366f1;
}
.cf-model-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
