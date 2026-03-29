<template>
  <div class="agent-page">
    <!-- 顶部标题 -->
    <div class="agent-header">
      <div class="agent-header__inner">
        <div class="agent-header__title">
          <div class="agent-header__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v3M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <div>
            <h1>任务模式 <span class="badge-beta">Beta</span></h1>
            <p class="agent-header__subtitle">输入自然语言任务，AI 自动拆解步骤并执行</p>
          </div>
        </div>
        <!-- 历史任务入口 -->
        <button class="history-btn" @click="showHistory = !showHistory">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-4 h-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          历史任务
        </button>
        <!-- 模型选择器（支持本地+云端） -->
        <div class="agent-model-selector">
          <span class="model-selector-label">🤖 执行模型</span>
          <select v-model="selectedModel" class="model-select-dropdown" @change="onModelChange">
            <optgroup label="🖥️ 本地模型">
              <option
                v-for="m in availableModels.filter(m => m.provider === 'ollama')"
                :key="m.id"
                :value="m.id"
                :disabled="!m.available"
              >
                {{ m.name }}{{ !m.available ? ' (不可用)' : '' }}
              </option>
            </optgroup>
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
          </select>
          <span
            :class="[
              'model-status-dot',
              selectedModelInfo?.provider === 'ollama'
                ? ollamaStatus === 'online'
                  ? 'dot--online'
                  : 'dot--offline'
                : selectedModelInfo?.available
                  ? 'dot--online'
                  : 'dot--offline'
            ]"
          >
            {{
              selectedModelInfo?.provider === 'ollama'
                ? ollamaStatus === 'online'
                  ? '🟢 在线'
                  : '🔴 离线'
                : selectedModelInfo?.available
                  ? '☁️ 就绪'
                  : '⚠️ 未配置'
            }}
          </span>
        </div>
      </div>
    </div>

    <div class="agent-content">
      <!-- 左侧历史面板 -->
      <transition name="slide-left">
        <div v-if="showHistory" class="history-panel">
          <div class="history-panel__header">
            <span>历史任务</span>
            <button class="close-btn" @click="showHistory = false">✕</button>
          </div>
          <div class="history-list">
            <div v-if="taskHistory.length === 0" class="empty-history">
              <p>暂无历史任务</p>
            </div>
            <div
              v-for="hist in taskHistory"
              :key="hist.id"
              class="history-item"
              @click="loadHistoryTask(hist)"
            >
              <div class="history-item__title">{{ hist.input }}</div>
              <div class="history-item__meta">
                <span :class="['status-dot', hist.status]"></span>
                {{ hist.statusText }} · {{ hist.time }}
              </div>
            </div>
          </div>
          <button v-if="taskHistory.length > 0" class="clear-history-btn" @click="clearHistory">
            清空历史
          </button>
        </div>
      </transition>

      <!-- 主内容区 -->
      <div class="agent-main">
        <!-- 任务输入区 -->
        <div v-if="!isRunning && !currentTask" class="task-input-area">
          <!-- 示例任务 -->
          <div class="example-tasks">
            <p class="example-label">示例任务</p>
            <div class="example-grid">
              <button
                v-for="ex in exampleTasks"
                :key="ex.title"
                class="example-card"
                @click="taskInput = ex.prompt"
              >
                <span class="example-card__icon">{{ ex.icon }}</span>
                <div>
                  <div class="example-card__title">{{ ex.title }}</div>
                  <div class="example-card__desc">{{ ex.desc }}</div>
                </div>
              </button>
            </div>
          </div>

          <!-- 输入框 -->
          <div class="input-box">
            <textarea
              v-model="taskInput"
              class="task-textarea"
              placeholder="描述你的任务，例如：写一份2026年AI行业分析报告，包含市场规模、主要玩家、技术趋势三部分..."
              rows="4"
              @keydown.ctrl.enter="startTask"
            ></textarea>

            <!-- 选项栏 -->
            <div class="input-options">
              <div class="input-options__left">
                <label class="option-item">
                  <span class="option-icon">📚</span>
                  <span class="option-label">使用知识库</span>
                  <t-switch v-model="taskOptions.useKnowledgeBase" size="small" />
                </label>
                <label v-if="taskOptions.useKnowledgeBase" class="option-item">
                  <t-select
                    v-model="taskOptions.selectedKbId"
                    size="small"
                    placeholder="选择知识库"
                    style="width: 160px"
                  >
                    <t-option
                      v-for="kb in knowledgeBases"
                      :key="kb.id"
                      :value="kb.id"
                      :label="kb.title"
                    />
                  </t-select>
                </label>
                <label class="option-item">
                  <span class="option-icon">🌐</span>
                  <span class="option-label">联网搜索</span>
                  <t-switch v-model="taskOptions.webSearch" size="small" />
                </label>
              </div>
              <button class="start-btn" :disabled="!taskInput.trim()" @click="startTask">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  class="w-4 h-4"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                开始执行 <kbd>Ctrl+↵</kbd>
              </button>
            </div>
          </div>
        </div>

        <!-- 任务执行中 / 结果区 -->
        <div v-if="isRunning || currentTask" class="task-execution">
          <!-- 任务头部 -->
          <div class="task-exec-header">
            <div class="task-exec-info">
              <div :class="['task-status-icon', currentTask?.status || 'running']">
                <svg
                  v-if="isRunning"
                  class="spin-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span v-else-if="currentTask?.status === 'completed'">✅</span>
                <span v-else>❌</span>
              </div>
              <div>
                <div class="task-exec-title">{{ currentTask?.input }}</div>
                <div class="task-exec-meta">
                  {{ isRunning ? '执行中...' : currentTask?.statusText }}
                  <span v-if="currentTask?.duration"> · 耗时 {{ currentTask.duration }}s</span>
                  <span v-if="currentTask?.model" class="task-model-tag">{{
                    currentTask.model
                  }}</span>
                </div>
              </div>
            </div>
            <div class="task-exec-actions">
              <button v-if="isRunning" class="stop-btn" @click="stopTask">停止</button>
              <button class="new-task-btn" @click="resetTask">新任务</button>
            </div>
          </div>

          <!-- 步骤流程 -->
          <div v-if="steps.length" class="steps-timeline">
            <div v-for="(step, idx) in steps" :key="idx" :class="['step-item', step.status]">
              <div v-if="idx > 0" class="step-connector"></div>
              <div class="step-dot">
                <svg
                  v-if="step.status === 'running'"
                  class="spin-icon w-3 h-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9" />
                </svg>
                <span v-else-if="step.status === 'completed'" class="text-xs">✓</span>
                <span v-else-if="step.status === 'error'" class="text-xs">✗</span>
                <span v-else class="text-xs">{{ idx + 1 }}</span>
              </div>
              <div class="step-content">
                <div class="step-header">
                  <span class="step-type-badge" :data-type="step.type">{{
                    stepTypeLabel(step.type)
                  }}</span>
                  <span class="step-name">{{ step.name }}</span>
                </div>
                <div v-if="step.detail" class="step-detail">{{ step.detail }}</div>
                <div v-if="step.result" class="step-result">
                  <pre>{{ step.result }}</pre>
                </div>
              </div>
            </div>
          </div>

          <!-- 最终输出 -->
          <div v-if="finalOutput" class="final-output">
            <div class="final-output__header">
              <span>📄 任务结果</span>
              <div class="output-actions">
                <button class="action-btn" @click="copyOutput">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="w-4 h-4"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                    />
                  </svg>
                  复制
                </button>
                <button class="action-btn" @click="downloadOutput('md')">⬇ MD</button>
                <button class="action-btn" @click="downloadOutput('txt')">⬇ TXT</button>
              </div>
            </div>
            <div class="final-output__body" v-html="renderedOutput"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { MessagePlugin } from 'tdesign-vue-next'
import axios from 'axios'

// ── Types ──────────────────────────────────────────────
interface TaskStep {
  name: string
  type: 'search' | 'read' | 'write' | 'think' | 'tool'
  status: 'pending' | 'running' | 'completed' | 'error'
  detail?: string
  result?: string
}

interface TaskRecord {
  id: string
  input: string
  status: 'completed' | 'error' | 'running'
  statusText: string
  time: string
  duration?: number
  output?: string
  model?: string
}

interface ModelInfo {
  id: string
  name: string
  provider: string
  available: boolean
}

// ── State ──────────────────────────────────────────────
const taskInput = ref('')
const isRunning = ref(false)
const showHistory = ref(false)
const steps = ref<TaskStep[]>([])
const finalOutput = ref('')
const currentTask = ref<TaskRecord | null>(null)
const taskHistory = ref<TaskRecord[]>([])
const knowledgeBases = ref<{ id: string; title: string }[]>([])

// ── 模型选择 ───────────────────────────────────────────
const availableModels = ref<ModelInfo[]>([])
const selectedModel = ref('deepseek-chat') // 默认用云端 DS
const selectedModelInfo = computed(() =>
  availableModels.value.find(m => m.id === selectedModel.value)
)

// ── Ollama 状态检测（本地模型时仍需要） ────────────────
const ollamaStatus = ref<'checking' | 'online' | 'offline'>('checking')
let ollamaCheckInterval: ReturnType<typeof setInterval> | null = null

async function checkOllamaStatus() {
  try {
    let ollamaUrl = 'http://localhost:11434'
    try {
      const cfgRaw =
        localStorage.getItem('user_model_config') || localStorage.getItem('ollamaSettings')
      if (cfgRaw) {
        const cfg = JSON.parse(cfgRaw)
        ollamaUrl = cfg.serverUrl || cfg.ollama_base_url || ollamaUrl
      }
    } catch {}
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    ollamaStatus.value = res.ok ? 'online' : 'offline'
  } catch {
    ollamaStatus.value = 'offline'
  }
}

// 加载模型列表（从后端 /api/models/list）
async function loadModels() {
  try {
    const res = await axios.get<{ models: ModelInfo[] }>('/api/models/list')
    if (res.data?.models) {
      availableModels.value = res.data.models
      // 优先选第一个 available 的云端模型
      const cloud = res.data.models.find(m => m.provider !== 'ollama' && m.available)
      const local = res.data.models.find(m => m.provider === 'ollama' && m.available)
      const saved = localStorage.getItem('agent_selected_model')
      if (saved && res.data.models.find(m => m.id === saved && m.available)) {
        selectedModel.value = saved
      } else if (cloud) {
        selectedModel.value = cloud.id
      } else if (local) {
        selectedModel.value = local.id
      }
    }
  } catch {
    // 离线时使用默认模型列表
    availableModels.value = [
      { id: 'qwen2:0.5b', name: 'Qwen2 0.5B（本地）', provider: 'ollama', available: true },
      { id: 'deepseek-chat', name: 'DeepSeek Chat（云端）', provider: 'deepseek', available: false }
    ]
  }
}

function onModelChange() {
  localStorage.setItem('agent_selected_model', selectedModel.value)
}

const taskOptions = ref({
  useKnowledgeBase: false,
  selectedKbId: '',
  webSearch: false
})

let stopSignal = false
let taskStartTime = 0
let taskAbortController: AbortController | null = null

// ── 示例任务 ───────────────────────────────────────────
const exampleTasks = [
  {
    icon: '📊',
    title: '行业分析报告',
    desc: '生成结构化分析报告',
    prompt: '写一份2026年AI大模型行业分析报告，包含市场规模、主要玩家、技术趋势和未来展望四个部分'
  },
  {
    icon: '📝',
    title: '知识库摘要',
    desc: '提取知识库核心要点',
    prompt: '对当前知识库中的所有文档生成结构化摘要，按主题分类，提炼核心观点'
  },
  {
    icon: '🔍',
    title: '对比分析',
    desc: '多维度对比研究',
    prompt: '对比分析 GPT-4、Claude 3 和 Gemini Pro 的性能差异、适用场景和定价策略'
  },
  {
    icon: '📋',
    title: '会议纪要',
    desc: '整理会议记录',
    prompt: '根据提供的会议记录，生成正式会议纪要，包含议题、讨论内容、决议和待办事项'
  }
]

// ── 步骤类型标签 ───────────────────────────────────────
const stepTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    search: '🔍 搜索',
    read: '📖 精读',
    write: '✍️ 写作',
    think: '🧠 思考',
    tool: '🔧 工具'
  }
  return labels[type] || type
}

// ── 渲染 Markdown 输出 ─────────────────────────────────
const renderedOutput = computed(() => {
  if (!finalOutput.value) return ''
  try {
    return DOMPurify.sanitize(marked(finalOutput.value) as string)
  } catch {
    return finalOutput.value
  }
})

// ── 加载知识库列表 ─────────────────────────────────────
const loadKnowledgeBases = async () => {
  try {
    const res = await axios.get<{ code: number; data: { id: string; title: string }[] }>(
      '/api/get-knowledge-item/'
    )
    if (res.data.code === 200) {
      knowledgeBases.value = res.data.data
    }
  } catch {
    /* ignore */
  }
}

// ── 任务执行（云端/本地模型均走 /api/agent/task SSE） ──
const startTask = async () => {
  if (!taskInput.value.trim() || isRunning.value) return

  stopSignal = false
  isRunning.value = true
  steps.value = []
  finalOutput.value = ''
  taskStartTime = Date.now()
  taskAbortController = new AbortController()

  const query = taskInput.value
  const model = selectedModel.value
  const modelInfo = selectedModelInfo.value

  const taskRecord: TaskRecord = {
    id: Date.now().toString(),
    input: query,
    status: 'running',
    statusText: '执行中',
    time: new Date().toLocaleTimeString(),
    model
  }
  currentTask.value = taskRecord

  // 初始化步骤（服务端会动态更新）
  steps.value = [
    {
      name: '理解任务目标',
      type: 'think',
      status: 'pending',
      detail: `${query.slice(0, 60)}${query.length > 60 ? '...' : ''}`
    },
    {
      name: taskOptions.value.useKnowledgeBase ? '检索知识库' : '规划执行流程',
      type: taskOptions.value.useKnowledgeBase ? 'search' : 'think',
      status: 'pending',
      detail: taskOptions.value.useKnowledgeBase
        ? `知识库 ${taskOptions.value.selectedKbId}`
        : '基于模型知识推理'
    },
    {
      name: '生成结构化草稿',
      type: 'write',
      status: 'pending',
      detail: `使用 ${modelInfo?.name || model}`
    },
    { name: '润色与优化', type: 'write', status: 'pending', detail: '流式生成输出' }
  ]

  try {
    // 判断 provider：云端 / 本地均走统一的 /api/agent/task 端点
    const isCloud = modelInfo?.provider !== 'ollama'

    if (isCloud || true) {
      // 使用新的统一 /api/agent/task 端点（云端+本地都支持）
      await runViaAgentTaskAPI(query, model, taskRecord)
    }
  } catch (e: any) {
    if (!stopSignal) {
      taskRecord.status = 'error'
      taskRecord.statusText = '执行失败'
      MessagePlugin.error(`任务执行失败：${e.message || '未知错误'}`)
    }
  } finally {
    isRunning.value = false
    currentTask.value = { ...taskRecord }
    taskAbortController = null
  }
}

// ── 通过 /api/agent/task SSE 运行任务（云端+本地统一） ─
async function runViaAgentTaskAPI(query: string, model: string, taskRecord: TaskRecord) {
  const payload = {
    query,
    model,
    kb_id:
      taskOptions.value.useKnowledgeBase && taskOptions.value.selectedKbId
        ? taskOptions.value.selectedKbId
        : null,
    temperature: 0.7,
    max_tokens: 4096
  }

  const resp = await fetch('/api/agent/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: taskAbortController?.signal
  })

  if (!resp.ok) {
    throw new Error(`后端返回 ${resp.status}`)
  }

  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let contentBuffer = ''

  // 步骤序号映射（backend index → front steps[]）
  const stepMap: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3 }

  while (true) {
    const { done, value } = await reader.read()
    if (done || stopSignal) break

    const text = decoder.decode(value, { stream: true })
    const lines = text.split('\n')

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (!raw) continue

      try {
        const evt = JSON.parse(raw)

        if (evt.event === 'step') {
          // 步骤开始
          const idx = stepMap[evt.index] ?? evt.index
          if (idx < steps.value.length) {
            // 把之前步骤标完成
            for (let i = 0; i < idx; i++) {
              if (steps.value[i].status !== 'completed') steps.value[i].status = 'completed'
            }
            steps.value[idx].status = 'running'
            if (evt.name) steps.value[idx].name = evt.name
            if (evt.detail) steps.value[idx].detail = evt.detail
          }
        } else if (evt.event === 'step_result') {
          const idx = stepMap[evt.index] ?? evt.index
          if (idx < steps.value.length && evt.detail) {
            steps.value[idx].result = evt.detail
          }
        } else if (evt.content !== undefined) {
          // 内容片段（来自 _stream_xxx 的 {content, done} 格式）
          if (evt.content && !evt.done) {
            contentBuffer += evt.content
            finalOutput.value = contentBuffer
            // 标记第3步（生成草稿）为running
            if (steps.value[2]?.status !== 'completed') steps.value[2].status = 'running'
          }
          if (evt.done) {
            // 流结束
          }
        } else if (evt.event === 'done') {
          // 全部完成
          steps.value.forEach(s => {
            if (s.status !== 'completed') s.status = 'completed'
          })
          taskRecord.status = 'completed'
          taskRecord.statusText = '已完成'
          taskRecord.duration = Math.round((Date.now() - taskStartTime) / 1000)
          taskRecord.output = finalOutput.value
          taskHistory.value.unshift({ ...taskRecord })
          saveHistory()
        } else if (evt.event === 'error') {
          steps.value.forEach(s => {
            if (s.status === 'running') s.status = 'error'
          })
          MessagePlugin.error(`模型错误：${evt.message}`)
          taskRecord.status = 'error'
          taskRecord.statusText = '执行失败'
        } else if (evt.error) {
          MessagePlugin.error(`模型错误：${evt.error}`)
          taskRecord.status = 'error'
          taskRecord.statusText = '执行失败'
        }
      } catch {
        // 非 JSON 行（如日志），忽略
      }
    }
  }

  // 若流结束但没收到 done 事件（如连接中断），设为完成
  if (taskRecord.status === 'running' && finalOutput.value) {
    steps.value.forEach(s => {
      if (s.status === 'running' || s.status === 'pending') s.status = 'completed'
    })
    taskRecord.status = 'completed'
    taskRecord.statusText = '已完成'
    taskRecord.duration = Math.round((Date.now() - taskStartTime) / 1000)
    taskRecord.output = finalOutput.value
    taskHistory.value.unshift({ ...taskRecord })
    saveHistory()
  }
}

// ── 辅助方法 ───────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const stopTask = () => {
  stopSignal = true
  taskAbortController?.abort()
  isRunning.value = false
  if (currentTask.value) {
    currentTask.value.status = 'error'
    currentTask.value.statusText = '已停止'
  }
  steps.value.forEach(s => {
    if (s.status === 'running') s.status = 'pending'
  })
}

const resetTask = () => {
  taskInput.value = ''
  steps.value = []
  finalOutput.value = ''
  currentTask.value = null
  isRunning.value = false
  stopSignal = false
}

const copyOutput = () => {
  navigator.clipboard.writeText(finalOutput.value).then(() => {
    MessagePlugin.success('已复制到剪贴板')
  })
}

const downloadOutput = (format: 'md' | 'txt') => {
  const ext = format === 'md' ? '.md' : '.txt'
  const blob = new Blob([finalOutput.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `任务结果_${Date.now()}${ext}`
  a.click()
  URL.revokeObjectURL(url)
  MessagePlugin.success('下载成功')
}

const loadHistoryTask = (hist: TaskRecord) => {
  currentTask.value = hist
  finalOutput.value = hist.output || ''
  steps.value = []
  showHistory.value = false
}

const clearHistory = () => {
  taskHistory.value = []
  localStorage.removeItem('agent_task_history')
}

const saveHistory = () => {
  const saved = taskHistory.value.slice(0, 20)
  localStorage.setItem('agent_task_history', JSON.stringify(saved))
}

const loadHistory = () => {
  try {
    const raw = localStorage.getItem('agent_task_history')
    if (raw) taskHistory.value = JSON.parse(raw)
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  loadKnowledgeBases()
  loadHistory()
  loadModels()
  checkOllamaStatus()
  ollamaCheckInterval = setInterval(checkOllamaStatus, 10000)
})

onUnmounted(() => {
  if (ollamaCheckInterval) clearInterval(ollamaCheckInterval)
})
</script>

<style scoped>
.agent-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f8fafc;
  overflow: hidden;
}

/* Header */
.agent-header {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 24px;
  flex-shrink: 0;
}
.agent-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
}
.agent-header__title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.agent-header__icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #4f7ef8, #8b5cf6);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}
.agent-header__icon svg {
  width: 20px;
  height: 20px;
}
.agent-header__title h1 {
  font-size: 18px;
  font-weight: 700;
  color: #1a1a2e;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.badge-beta {
  font-size: 10px;
  background: linear-gradient(135deg, #4f7ef8, #8b5cf6);
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
}
.agent-header__subtitle {
  font-size: 12px;
  color: #6b7280;
  margin: 0;
}
.history-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 13px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  color: #4b5563;
  cursor: pointer;
  transition: all 0.15s;
}
.history-btn:hover {
  background: #f3f4f6;
}

/* AI 状态指示器 */
.agent-ai-status {
  display: flex;
  align-items: center;
}
.ai-badge {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 20px;
  font-weight: 500;
}
.ai-badge--checking {
  background: #fef3c7;
  color: #92400e;
}
.ai-badge--online {
  background: #dcfce7;
  color: #166534;
}
.ai-badge--offline {
  background: #fee2e2;
  color: #991b1b;
}

/* 模型选择器 */
.agent-model-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}
.model-selector-label {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}
.model-select-dropdown {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  color: #1f2937;
  cursor: pointer;
  max-width: 200px;
  outline: none;
  transition: border-color 0.15s;
}
.model-select-dropdown:hover,
.model-select-dropdown:focus {
  border-color: #4f7ef8;
}
.model-status-dot {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 12px;
  white-space: nowrap;
  font-weight: 500;
}
.dot--online {
  background: #dcfce7;
  color: #166534;
}
.dot--offline {
  background: #fee2e2;
  color: #991b1b;
}

/* Content Layout */
.agent-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* History Panel */
.history-panel {
  width: 280px;
  flex-shrink: 0;
  background: white;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.history-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
  font-size: 14px;
}
.close-btn {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 14px;
}
.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.empty-history {
  text-align: center;
  color: #9ca3af;
  padding: 24px;
  font-size: 13px;
}
.history-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.15s;
}
.history-item:hover {
  background: #f3f4f6;
}
.history-item__title {
  font-size: 13px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-item__meta {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.status-dot.completed {
  background: #10b981;
}
.status-dot.error {
  background: #ef4444;
}
.status-dot.running {
  background: #f59e0b;
}
.clear-history-btn {
  padding: 10px;
  text-align: center;
  font-size: 12px;
  color: #ef4444;
  background: none;
  border: none;
  border-top: 1px solid #e5e7eb;
  cursor: pointer;
  width: 100%;
}

/* Main */
.agent-main {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* Input Area */
.task-input-area {
  max-width: 820px;
  margin: 0 auto;
}
.example-tasks {
  margin-bottom: 24px;
}
.example-label {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}
.example-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.example-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}
.example-card:hover {
  border-color: #4f7ef8;
  box-shadow: 0 2px 8px rgba(79, 126, 248, 0.12);
}
.example-card__icon {
  font-size: 24px;
}
.example-card__title {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}
.example-card__desc {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}

/* Input Box */
.input-box {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}
.task-textarea {
  width: 100%;
  padding: 16px 20px;
  border: none;
  outline: none;
  resize: none;
  font-size: 14px;
  line-height: 1.6;
  color: #1f2937;
  font-family: inherit;
  background: transparent;
}
.input-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid #f3f4f6;
  background: #fafafa;
}
.input-options__left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.option-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4b5563;
  cursor: pointer;
}
.option-icon {
  font-size: 14px;
}
.option-label {
  white-space: nowrap;
}
.start-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  background: linear-gradient(135deg, #4f7ef8, #8b5cf6);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.start-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.start-btn kbd {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.2);
  padding: 1px 5px;
  border-radius: 4px;
}

/* Execution Area */
.task-execution {
  max-width: 820px;
  margin: 0 auto;
}
.task-exec-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.task-exec-info {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
}
.task-status-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}
.task-status-icon.running {
  background: #eff6ff;
}
.task-status-icon.completed {
  background: #f0fdf4;
}
.task-status-icon.error {
  background: #fef2f2;
}
.task-exec-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.4;
}
.task-exec-meta {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 3px;
}
.task-model-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  font-size: 11px;
  border-radius: 8px;
  background: #eff6ff;
  color: #3b82f6;
  font-weight: 500;
}
.task-exec-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.stop-btn,
.new-task-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid;
}
.stop-btn {
  border-color: #fca5a5;
  background: #fef2f2;
  color: #dc2626;
}
.stop-btn:hover {
  background: #fee2e2;
}
.new-task-btn {
  border-color: #e5e7eb;
  background: white;
  color: #374151;
}
.new-task-btn:hover {
  background: #f3f4f6;
}

/* Steps Timeline */
.steps-timeline {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 16px;
}
.step-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  position: relative;
  padding-bottom: 16px;
}
.step-item:last-child {
  padding-bottom: 0;
}
.step-connector {
  position: absolute;
  left: 13px;
  top: -16px;
  width: 1px;
  height: 16px;
  background: #e5e7eb;
}
.step-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  transition: all 0.3s;
}
.step-item.pending .step-dot {
  background: #f3f4f6;
  color: #9ca3af;
  border: 2px solid #e5e7eb;
}
.step-item.running .step-dot {
  background: #eff6ff;
  color: #3b82f6;
  border: 2px solid #93c5fd;
}
.step-item.completed .step-dot {
  background: #f0fdf4;
  color: #16a34a;
  border: 2px solid #86efac;
}
.step-item.error .step-dot {
  background: #fef2f2;
  color: #dc2626;
  border: 2px solid #fca5a5;
}
.step-content {
  flex: 1;
  padding-top: 4px;
}
.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.step-type-badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  background: #f3f4f6;
  color: #6b7280;
  white-space: nowrap;
}
.step-name {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}
.step-detail {
  font-size: 12px;
  color: #9ca3af;
}
.step-result {
  font-size: 12px;
  color: #374151;
  margin-top: 4px;
}
.step-result pre {
  background: #f3f4f6;
  padding: 8px 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

/* Final Output */
.final-output {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  overflow: hidden;
}
.final-output__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.output-actions {
  display: flex;
  gap: 8px;
}
.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  color: #4b5563;
  cursor: pointer;
  transition: all 0.15s;
}
.action-btn:hover {
  background: #f3f4f6;
}
.final-output__body {
  padding: 20px;
  font-size: 14px;
  line-height: 1.7;
  color: #1f2937;
  max-height: 60vh;
  overflow-y: auto;
}
.final-output__body :deep(h2) {
  font-size: 17px;
  font-weight: 700;
  margin: 16px 0 8px;
}
.final-output__body :deep(h3) {
  font-size: 15px;
  font-weight: 600;
  margin: 12px 0 6px;
}
.final-output__body :deep(p) {
  margin: 6px 0;
}
.final-output__body :deep(ul),
.final-output__body :deep(ol) {
  padding-left: 20px;
  margin: 6px 0;
}
.final-output__body :deep(li) {
  margin: 3px 0;
}
.final-output__body :deep(blockquote) {
  border-left: 3px solid #4f7ef8;
  padding: 8px 16px;
  background: #eff6ff;
  border-radius: 0 8px 8px 0;
  margin: 8px 0;
}
.final-output__body :deep(code) {
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.final-output__body :deep(pre) {
  background: #1e293b;
  color: #e2e8f0;
  padding: 14px;
  border-radius: 8px;
  overflow-x: auto;
}
.final-output__body :deep(pre code) {
  background: none;
  color: inherit;
  padding: 0;
}
.final-output__body :deep(hr) {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 16px 0;
}

/* Spin animation */
.spin-icon {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Transitions */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.25s ease;
}
.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-280px);
  opacity: 0;
}
</style>
