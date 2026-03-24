<template>
  <div class="agent-page">
    <!-- 顶部标题 -->
    <div class="agent-header">
      <div class="agent-header__inner">
        <div class="agent-header__title">
          <div class="agent-header__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v3M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <div>
            <h1>任务模式 <span class="badge-beta">Beta</span></h1>
            <p class="agent-header__subtitle">输入自然语言任务，AI 自动拆解步骤并执行</p>
          </div>
        </div>
        <!-- 历史任务入口 -->
        <button class="history-btn" @click="showHistory = !showHistory">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          历史任务
        </button>
      </div>
    </div>

    <div class="agent-content">
      <!-- 左侧历史面板 -->
      <transition name="slide-left">
        <div v-if="showHistory" class="history-panel">
          <div class="history-panel__header">
            <span>历史任务</span>
            <button @click="showHistory = false" class="close-btn">✕</button>
          </div>
          <div class="history-list">
            <div v-if="taskHistory.length === 0" class="empty-history">
              <p>暂无历史任务</p>
            </div>
            <div v-for="hist in taskHistory" :key="hist.id"
              class="history-item"
              @click="loadHistoryTask(hist)">
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
              <button v-for="ex in exampleTasks" :key="ex.title"
                class="example-card" @click="taskInput = ex.prompt">
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
                <label class="option-item" v-if="taskOptions.useKnowledgeBase">
                  <t-select v-model="taskOptions.selectedKbId" size="small" placeholder="选择知识库" style="width:160px">
                    <t-option v-for="kb in knowledgeBases" :key="kb.id" :value="kb.id" :label="kb.title" />
                  </t-select>
                </label>
                <label class="option-item">
                  <span class="option-icon">🌐</span>
                  <span class="option-label">联网搜索</span>
                  <t-switch v-model="taskOptions.webSearch" size="small" />
                </label>
              </div>
              <button
                class="start-btn"
                :disabled="!taskInput.trim()"
                @click="startTask">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
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
                <svg v-if="isRunning" class="spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                <span v-else-if="currentTask?.status === 'completed'">✅</span>
                <span v-else>❌</span>
              </div>
              <div>
                <div class="task-exec-title">{{ currentTask?.input }}</div>
                <div class="task-exec-meta">
                  {{ isRunning ? '执行中...' : currentTask?.statusText }}
                  <span v-if="currentTask?.duration"> · 耗时 {{ currentTask.duration }}s</span>
                </div>
              </div>
            </div>
            <div class="task-exec-actions">
              <button v-if="isRunning" class="stop-btn" @click="stopTask">停止</button>
              <button class="new-task-btn" @click="resetTask">新任务</button>
            </div>
          </div>

          <!-- 步骤流程 -->
          <div class="steps-timeline" v-if="steps.length">
            <div v-for="(step, idx) in steps" :key="idx"
              :class="['step-item', step.status]">
              <div class="step-connector" v-if="idx > 0"></div>
              <div class="step-dot">
                <svg v-if="step.status === 'running'" class="spin-icon w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9"/>
                </svg>
                <span v-else-if="step.status === 'completed'" class="text-xs">✓</span>
                <span v-else-if="step.status === 'error'" class="text-xs">✗</span>
                <span v-else class="text-xs">{{ idx + 1 }}</span>
              </div>
              <div class="step-content">
                <div class="step-header">
                  <span class="step-type-badge" :data-type="step.type">{{ stepTypeLabel(step.type) }}</span>
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
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
import { ref, computed, onMounted } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { MessagePlugin } from 'tdesign-vue-next';
import axios from 'axios';

// ── Types ──────────────────────────────────────────────
interface TaskStep {
  name: string;
  type: 'search' | 'read' | 'write' | 'think' | 'tool';
  status: 'pending' | 'running' | 'completed' | 'error';
  detail?: string;
  result?: string;
}

interface TaskRecord {
  id: string;
  input: string;
  status: 'completed' | 'error' | 'running';
  statusText: string;
  time: string;
  duration?: number;
  output?: string;
}

// ── State ──────────────────────────────────────────────
const taskInput = ref('');
const isRunning = ref(false);
const showHistory = ref(false);
const steps = ref<TaskStep[]>([]);
const finalOutput = ref('');
const currentTask = ref<TaskRecord | null>(null);
const taskHistory = ref<TaskRecord[]>([]);
const knowledgeBases = ref<{id: string; title: string}[]>([]);

const taskOptions = ref({
  useKnowledgeBase: false,
  selectedKbId: '',
  webSearch: false,
});

let stopSignal = false;
let taskStartTime = 0;

// ── 示例任务 ───────────────────────────────────────────
const exampleTasks = [
  {
    icon: '📊',
    title: '行业分析报告',
    desc: '生成结构化分析报告',
    prompt: '写一份2026年AI大模型行业分析报告，包含市场规模、主要玩家、技术趋势和未来展望四个部分',
  },
  {
    icon: '📝',
    title: '知识库摘要',
    desc: '提取知识库核心要点',
    prompt: '对当前知识库中的所有文档生成结构化摘要，按主题分类，提炼核心观点',
  },
  {
    icon: '🔍',
    title: '对比分析',
    desc: '多维度对比研究',
    prompt: '对比分析 GPT-4、Claude 3 和 Gemini Pro 的性能差异、适用场景和定价策略',
  },
  {
    icon: '📋',
    title: '会议纪要',
    desc: '整理会议记录',
    prompt: '根据提供的会议记录，生成正式会议纪要，包含议题、讨论内容、决议和待办事项',
  },
];

// ── 步骤类型标签 ───────────────────────────────────────
const stepTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    search: '🔍 搜索',
    read: '📖 精读',
    write: '✍️ 写作',
    think: '🧠 思考',
    tool: '🔧 工具',
  };
  return labels[type] || type;
};

// ── 渲染 Markdown 输出 ─────────────────────────────────
const renderedOutput = computed(() => {
  if (!finalOutput.value) return '';
  try {
    return DOMPurify.sanitize(marked(finalOutput.value) as string);
  } catch {
    return finalOutput.value;
  }
});

// ── 加载知识库列表 ─────────────────────────────────────
const loadKnowledgeBases = async () => {
  try {
    const res = await axios.get<{code: number; data: {id:string; title:string}[]}>('/api/get-knowledge-item/');
    if (res.data.code === 200) {
      knowledgeBases.value = res.data.data;
    }
  } catch { /* ignore */ }
};

// ── 任务执行（模拟 ReAct Agent 流程） ─────────────────
const startTask = async () => {
  if (!taskInput.value.trim() || isRunning.value) return;

  stopSignal = false;
  isRunning.value = true;
  steps.value = [];
  finalOutput.value = '';
  taskStartTime = Date.now();

  const taskRecord: TaskRecord = {
    id: Date.now().toString(),
    input: taskInput.value,
    status: 'running',
    statusText: '执行中',
    time: new Date().toLocaleTimeString(),
  };
  currentTask.value = taskRecord;

  const query = taskInput.value;

  // 构建任务步骤计划
  const plannedSteps: TaskStep[] = [
    { name: '理解任务目标', type: 'think', status: 'pending', detail: `分析任务：${query.slice(0, 60)}${query.length > 60 ? '...' : ''}` },
    { name: '规划执行流程', type: 'think', status: 'pending', detail: '拆解子任务，确定执行顺序' },
    { name: '信息检索', type: 'search', status: 'pending', detail: taskOptions.value.useKnowledgeBase ? '在知识库中检索相关内容' : '分析已有背景知识' },
    { name: '内容精读与提取', type: 'read', status: 'pending', detail: '提炼关键信息和核心观点' },
    { name: '生成结构化草稿', type: 'write', status: 'pending', detail: '按照任务要求组织内容结构' },
    { name: '润色与优化', type: 'write', status: 'pending', detail: '完善表达，确保逻辑连贯' },
  ];

  steps.value = plannedSteps;

  // 逐步执行
  try {
    for (let i = 0; i < steps.value.length; i++) {
      if (stopSignal) break;

      steps.value[i].status = 'running';
      await sleep(800 + Math.random() * 600);

      if (stopSignal) break;

      steps.value[i].status = 'completed';

      // 最后一步前调用后端 ReAct Agent
      if (i === steps.value.length - 2) {
        try {
          const docsDir = taskOptions.value.useKnowledgeBase && taskOptions.value.selectedKbId
            ? `local-KLB-files/${taskOptions.value.selectedKbId}`
            : 'local-KLB-files';

          const resp = await axios.post('/api/RAG/agent_query_sync', {
            query,
            docs_dir: docsDir,
          }, { timeout: 60000 });

          if (resp.data?.answer) {
            steps.value[i + 1].result = resp.data.answer.slice(0, 200) + (resp.data.answer.length > 200 ? '...' : '');
          }
        } catch { /* 后端可能未就绪，跳过 */ }
      }
    }

    if (!stopSignal) {
      // 生成最终输出
      await generateFinalOutput(query);

      taskRecord.status = 'completed';
      taskRecord.statusText = '已完成';
      taskRecord.duration = Math.round((Date.now() - taskStartTime) / 1000);
      taskRecord.output = finalOutput.value;
      taskHistory.value.unshift({ ...taskRecord });
      saveHistory();
    }
  } catch (e) {
    taskRecord.status = 'error';
    taskRecord.statusText = '执行失败';
    MessagePlugin.error('任务执行失败，请重试');
  } finally {
    isRunning.value = false;
    currentTask.value = taskRecord;
  }
};

// ── 生成最终输出（尝试后端+客户端降级） ────────────────
const generateFinalOutput = async (query: string) => {
  // 尝试从步骤结果中提取
  const stepResult = steps.value.find(s => s.result)?.result;

  if (stepResult && stepResult.length > 100) {
    finalOutput.value = `## 任务结果\n\n**任务**：${query}\n\n${stepResult}`;
    return;
  }

  // 客户端降级：生成结构化模板
  const sections = buildOutputTemplate(query);
  finalOutput.value = sections;
};

const buildOutputTemplate = (query: string): string => {
  return `## 📋 任务完成报告

**任务指令**：${query}

---

### 执行摘要

基于任务目标，AI Agent 完成了以下工作流程：
- 🧠 分析并理解了任务需求
- 🔍 检索了相关背景信息  
- 📖 提炼了核心要点
- ✍️ 生成了结构化内容

### 主要发现

> 当前为离线演示模式。要获取基于知识库的真实分析，请确保后端 Ollama 服务已启动，并在任务选项中选择知识库。

### 建议后续步骤

1. 开启知识库并上传相关文档
2. 确保 Ollama 模型已下载（推荐 qwen2:0.5b）
3. 重新执行此任务以获取真实内容

---

*任务完成时间：${new Date().toLocaleString()}*`;
};

// ── 辅助方法 ───────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const stopTask = () => {
  stopSignal = true;
  isRunning.value = false;
  if (currentTask.value) {
    currentTask.value.status = 'error';
    currentTask.value.statusText = '已停止';
  }
  // 将进行中的步骤标为停止
  steps.value.forEach(s => {
    if (s.status === 'running') s.status = 'pending';
  });
};

const resetTask = () => {
  taskInput.value = '';
  steps.value = [];
  finalOutput.value = '';
  currentTask.value = null;
  isRunning.value = false;
  stopSignal = false;
};

const copyOutput = () => {
  navigator.clipboard.writeText(finalOutput.value).then(() => {
    MessagePlugin.success('已复制到剪贴板');
  });
};

const downloadOutput = (format: 'md' | 'txt') => {
  const ext = format === 'md' ? '.md' : '.txt';
  const blob = new Blob([finalOutput.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `任务结果_${Date.now()}${ext}`;
  a.click();
  URL.revokeObjectURL(url);
  MessagePlugin.success('下载成功');
};

const loadHistoryTask = (hist: TaskRecord) => {
  currentTask.value = hist;
  finalOutput.value = hist.output || '';
  steps.value = [];
  showHistory.value = false;
};

const clearHistory = () => {
  taskHistory.value = [];
  localStorage.removeItem('agent_task_history');
};

const saveHistory = () => {
  const saved = taskHistory.value.slice(0, 20); // 最多保留20条
  localStorage.setItem('agent_task_history', JSON.stringify(saved));
};

const loadHistory = () => {
  try {
    const raw = localStorage.getItem('agent_task_history');
    if (raw) taskHistory.value = JSON.parse(raw);
  } catch { /* ignore */ }
};

onMounted(() => {
  loadKnowledgeBases();
  loadHistory();
});
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
.agent-header__icon svg { width: 20px; height: 20px; }
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
.history-btn:hover { background: #f3f4f6; }

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
.history-item:hover { background: #f3f4f6; }
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
.status-dot.completed { background: #10b981; }
.status-dot.error { background: #ef4444; }
.status-dot.running { background: #f59e0b; }
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
  box-shadow: 0 2px 8px rgba(79,126,248,0.12);
}
.example-card__icon { font-size: 24px; }
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
  box-shadow: 0 4px 20px rgba(0,0,0,0.06);
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
.option-icon { font-size: 14px; }
.option-label { white-space: nowrap; }
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
  background: rgba(255,255,255,0.2);
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
.task-status-icon.running { background: #eff6ff; }
.task-status-icon.completed { background: #f0fdf4; }
.task-status-icon.error { background: #fef2f2; }
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
.task-exec-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.stop-btn, .new-task-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid;
}
.stop-btn { border-color: #fca5a5; background: #fef2f2; color: #dc2626; }
.stop-btn:hover { background: #fee2e2; }
.new-task-btn { border-color: #e5e7eb; background: white; color: #374151; }
.new-task-btn:hover { background: #f3f4f6; }

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
.step-item:last-child { padding-bottom: 0; }
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
.step-item.pending .step-dot { background: #f3f4f6; color: #9ca3af; border: 2px solid #e5e7eb; }
.step-item.running .step-dot { background: #eff6ff; color: #3b82f6; border: 2px solid #93c5fd; }
.step-item.completed .step-dot { background: #f0fdf4; color: #16a34a; border: 2px solid #86efac; }
.step-item.error .step-dot { background: #fef2f2; color: #dc2626; border: 2px solid #fca5a5; }
.step-content { flex: 1; padding-top: 4px; }
.step-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.step-type-badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  background: #f3f4f6;
  color: #6b7280;
  white-space: nowrap;
}
.step-name { font-size: 13px; font-weight: 600; color: #1f2937; }
.step-detail { font-size: 12px; color: #9ca3af; }
.step-result { font-size: 12px; color: #374151; margin-top: 4px; }
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
.output-actions { display: flex; gap: 8px; }
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
.action-btn:hover { background: #f3f4f6; }
.final-output__body {
  padding: 20px;
  font-size: 14px;
  line-height: 1.7;
  color: #1f2937;
  max-height: 60vh;
  overflow-y: auto;
}
.final-output__body :deep(h2) { font-size: 17px; font-weight: 700; margin: 16px 0 8px; }
.final-output__body :deep(h3) { font-size: 15px; font-weight: 600; margin: 12px 0 6px; }
.final-output__body :deep(p) { margin: 6px 0; }
.final-output__body :deep(ul), .final-output__body :deep(ol) { padding-left: 20px; margin: 6px 0; }
.final-output__body :deep(li) { margin: 3px 0; }
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
.final-output__body :deep(hr) { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }

/* Spin animation */
.spin-icon {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
