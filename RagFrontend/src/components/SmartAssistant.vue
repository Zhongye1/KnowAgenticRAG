<template>
  <!-- 触发按钮（悬浮球） -->
  <div class="sa-trigger" :class="{ 'sa-trigger--open': isOpen }" @click="toggleOpen" title="智能助理 (Alt+A)">
    <transition name="sa-icon-flip">
      <svg v-if="!isOpen" key="open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sa-trigger__icon">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
        <path stroke-linecap="round" stroke-linejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>
      </svg>
      <svg v-else key="close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sa-trigger__icon">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </transition>
    <span class="sa-trigger__pulse" v-if="!isOpen"></span>
  </div>

  <!-- 助理面板 -->
  <transition name="sa-panel">
    <div v-if="isOpen" class="sa-panel" :class="{ 'sa-panel--minimized': isMinimized }">
      <!-- 面板头部 -->
      <div class="sa-panel__header">
        <div class="sa-panel__title">
          <div class="sa-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
            </svg>
          </div>
          <div>
            <span class="sa-panel__name">智能助理</span>
            <span class="sa-panel__status">● 在线</span>
          </div>
        </div>
        <div class="sa-panel__actions">
          <button class="sa-action-btn" @click="isMinimized = !isMinimized" :title="isMinimized ? '展开' : '最小化'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path v-if="!isMinimized" stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
              <path v-else stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/>
            </svg>
          </button>
          <button class="sa-action-btn sa-action-btn--close" @click="isOpen = false" title="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 面板内容（可折叠） -->
      <transition name="sa-collapse">
        <div v-if="!isMinimized" class="sa-panel__body">
          <!-- 快捷引导卡片 -->
          <div class="sa-shortcuts" v-if="messages.length === 0">
            <p class="sa-shortcuts__title">我能帮你：</p>
            <div class="sa-shortcut-grid">
              <button v-for="s in shortcuts" :key="s.text" class="sa-shortcut-card" @click="sendShortcut(s.text)">
                <span class="sa-shortcut-card__icon">{{ s.icon }}</span>
                <span class="sa-shortcut-card__text">{{ s.text }}</span>
              </button>
            </div>
          </div>

          <!-- 对话消息列表 -->
          <div class="sa-messages" ref="messagesRef">
            <div v-for="(msg, i) in messages" :key="i" :class="['sa-msg', `sa-msg--${msg.role}`]">
              <div class="sa-msg__avatar" v-if="msg.role === 'assistant'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
                </svg>
              </div>
              <div class="sa-msg__bubble">
                <span v-html="msg.content"></span>
                <div v-if="msg.actions && msg.actions.length" class="sa-msg__actions">
                  <button v-for="a in msg.actions" :key="a.label" class="sa-msg__action-btn" @click="handleAction(a)">
                    {{ a.label }}
                  </button>
                </div>
              </div>
            </div>
            <!-- 打字中 -->
            <div v-if="isTyping" class="sa-msg sa-msg--assistant">
              <div class="sa-msg__avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
                </svg>
              </div>
              <div class="sa-msg__bubble sa-msg__bubble--typing">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>

          <!-- 输入区 -->
          <div class="sa-input-area">
            <input
              v-model="inputText"
              class="sa-input"
              placeholder="问我任何功能或操作..."
              @keydown.enter.prevent="sendMessage"
              :disabled="isTyping"
            />
            <button class="sa-send-btn" @click="sendMessage" :disabled="!inputText.trim() || isTyping">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
              </svg>
            </button>
          </div>
          <p class="sa-disclaimer">仅回答功能引导，不发起真实 AI 请求</p>
        </div>
      </transition>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const isOpen = ref(false)
const isMinimized = ref(false)
const inputText = ref('')
const isTyping = ref(false)
const messagesRef = ref<HTMLElement | null>(null)

interface Action { label: string; route?: string; fn?: () => void }
interface Message { role: 'user' | 'assistant'; content: string; actions?: Action[] }

const messages = ref<Message[]>([])

const shortcuts = [
  { icon: '📚', text: '如何创建知识库？' },
  { icon: '💬', text: '如何开始AI对话？' },
  { icon: '🔍', text: '如何搜索文件？' },
  { icon: '⚙️', text: '如何配置模型？' },
  { icon: '📁', text: '如何上传文档？' },
  { icon: '🤖', text: '任务模式怎么用？' },
]

// 知识库：功能路径和操作指南
const knowledgeBase: Array<{
  keywords: string[];
  answer: string;
  actions?: Action[];
}> = [
  {
    keywords: ['知识库', '创建', '新建', '建立'],
    answer: '创建知识库很简单：<br>① 点击左侧导航 <b>知识库</b><br>② 点击右上角 <b>+ 新建知识库</b> 按钮<br>③ 填写名称和描述后确认<br>创建完成后即可上传文档并开始问答 🎉',
    actions: [{ label: '去知识库', route: '/knowledge' }]
  },
  {
    keywords: ['上传', '文档', '文件', '导入', 'pdf', 'word'],
    answer: '上传文档步骤：<br>① 进入 <b>知识库详情页</b>（点击某个知识库）<br>② 点击 <b>上传文档</b> 按钮<br>③ 支持 PDF / Word / TXT / Markdown 格式<br>④ 也可粘贴 URL 批量导入网页内容',
    actions: [{ label: '去知识库', route: '/knowledge' }, { label: '文件管理', route: '/files' }]
  },
  {
    keywords: ['对话', '聊天', '问答', 'ai', '开始', '提问'],
    answer: 'AI 对话使用方式：<br>① 点击左侧 <b>AI 对话</b> 进入聊天界面<br>② 在底部输入框输入问题，回车发送<br>③ 可在左下角 <b>开启 RAG 模式</b> 选择知识库<br>④ 开启 RAG 后，AI 会基于你的文档回答 📖',
    actions: [{ label: '去对话', route: '/chat' }]
  },
  {
    keywords: ['rag', '检索', '增强', '知识问答'],
    answer: 'RAG 模式开启：<br>① 进入 <b>AI 对话</b> 页面<br>② 找到左下角的 <b>RAG 开关</b>，打开它<br>③ 在知识库选择器中选择要检索的库<br>④ 发送问题时，系统自动从文档中检索相关内容辅助回答',
    actions: [{ label: '去对话', route: '/chat' }]
  },
  {
    keywords: ['模型', '配置', '切换', 'ollama', '设置模型'],
    answer: '模型配置路径：<br>① 点击左侧 <b>系统设置</b>（齿轮图标）<br>② 选择 <b>多模型管理</b> Tab<br>③ 支持切换 Ollama 本地模型 / 阿里云百炼 / DeepSeek 等<br>④ 当前默认模型：<b>qwen2:0.5b</b>（轻量，低配可用）',
    actions: [{ label: '去设置', route: '/settings' }]
  },
  {
    keywords: ['文件管理', '文件', '管理文件'],
    answer: '文件管理功能：<br>① 点击左侧工具区 <b>文件管理</b><br>② 可查看所有已上传文件<br>③ 支持搜索、下载、删除操作<br>④ 可置顶常用文件，方便快速访问',
    actions: [{ label: '去文件管理', route: '/files' }]
  },
  {
    keywords: ['任务', 'agent', '自动', '步骤', '工作流'],
    answer: '任务模式（Agent）使用：<br>① 点击左侧 <b>任务模式</b> (Beta)<br>② 用自然语言描述你的目标，如"帮我总结这份报告的要点"<br>③ Agent 会自动规划步骤、调用工具完成任务<br>④ 可在历史记录中查看任务执行过程',
    actions: [{ label: '去任务模式', route: '/agent' }]
  },
  {
    keywords: ['历史', '记录', '查看历史', '对话历史'],
    answer: '历史记录功能：<br>① 点击左侧工具区 <b>历史记录</b><br>② 可查看所有对话、任务、笔记历史<br>③ 支持按类型过滤和关键词搜索<br>④ 支持置顶重要记录，方便后续查找',
    actions: [{ label: '去历史记录', route: '/history' }]
  },
  {
    keywords: ['设置', '系统设置', '偏好', '外观', '主题'],
    answer: '系统设置入口：<br>① 点击左侧工具区 <b>系统设置</b>（齿轮）<br>② 外观设置：深色模式 / 主题色 / 字体大小<br>③ 模型管理：切换 AI 模型<br>④ 开放 API：创建 API Key 供外部调用',
    actions: [{ label: '去设置', route: '/settings' }]
  },
  {
    keywords: ['搜索', '查找', 'ctrl', 'ctrl+k', '全局搜索'],
    answer: '全局搜索快捷键：<br>① 按 <kbd>Ctrl + K</kbd> 打开全局搜索<br>② 可搜索知识库、文档、历史对话<br>③ 支持键盘上下键导航，回车快速跳转',
  },
  {
    keywords: ['权限', '共享', '分享', '协作'],
    answer: '知识库共享与权限：<br>① 进入知识库详情页，点击右上角 <b>分享设置</b><br>② 支持三级权限：<b>个人私有 / 团队共享 / 知识广场公开</b><br>③ 可生成分享链接或二维码<br>④ 在知识广场可浏览他人公开的知识库',
    actions: [{ label: '知识广场', route: '/square' }]
  },
  {
    keywords: ['语音', '录音', '说话', '口述'],
    answer: '语音输入功能：<br>① 在 AI 对话页面，点击输入框右侧的 🎤 麦克风按钮<br>② 点击后开始录音，再次点击停止<br>③ 系统自动转为文字填入输入框<br>④ 支持 Whisper 本地识别（需后端配置）',
    actions: [{ label: '去对话', route: '/chat' }]
  },
  {
    keywords: ['置顶', 'pin', '收藏', '固定'],
    answer: '置顶功能使用方式：<br>① 在知识库 / 文件管理 / 历史记录列表中<br>② 鼠标悬停到条目上，点击出现的 <b>📌 置顶</b> 按钮<br>③ 置顶的内容会固定显示在列表顶部<br>④ 再次点击即可取消置顶',
  },
  {
    keywords: ['ocr', '图片识别', '扫描', '截图', '识别文字'],
    answer: 'OCR 文字识别功能：<br>① 在上传文档时，系统自动对图片/PDF 执行 OCR<br>② 也可在 AI 对话中上传图片，点击 OCR 解析<br>③ 识别结果会自动整理为可检索的文本<br>④ 可在 系统设置 → OCR 解析 中调整默认引擎',
  },
]

function findAnswer(query: string): { answer: string; actions?: Action[] } | null {
  const q = query.toLowerCase()
  for (const kb of knowledgeBase) {
    if (kb.keywords.some(k => q.includes(k))) {
      return { answer: kb.answer, actions: kb.actions }
    }
  }
  return null
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text) return
  inputText.value = ''

  messages.value.push({ role: 'user', content: text })
  isTyping.value = true
  await scrollToBottom()

  // 模拟思考延迟
  await new Promise(r => setTimeout(r, 600 + Math.random() * 400))

  const result = findAnswer(text)
  isTyping.value = false

  if (result) {
    messages.value.push({ role: 'assistant', content: result.answer, actions: result.actions })
  } else {
    messages.value.push({
      role: 'assistant',
      content: '抱歉，我暂时不了解这个功能的具体路径 🤔<br>你可以尝试问我：<br>• "如何创建知识库"<br>• "如何开始AI对话"<br>• "如何配置模型"<br>• "怎么上传文档"',
    })
  }
  await scrollToBottom()
}

function sendShortcut(text: string) {
  inputText.value = text
  sendMessage()
}

function handleAction(action: Action) {
  if (action.route) router.push(action.route)
  if (action.fn) action.fn()
}

function toggleOpen() {
  isOpen.value = !isOpen.value
  if (isOpen.value) isMinimized.value = false
}

async function scrollToBottom() {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

// Alt+A 快捷键
function handleKeydown(e: KeyboardEvent) {
  if (e.altKey && e.key === 'a') {
    e.preventDefault()
    toggleOpen()
  }
}
onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<style scoped>
/* ── 悬浮触发按钮 ── */
.sa-trigger {
  position: fixed;
  right: 24px;
  bottom: 80px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4f7ef8, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(79, 126, 248, 0.4);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
  z-index: 1000;
  user-select: none;
}
.sa-trigger:hover { transform: scale(1.1); box-shadow: 0 6px 24px rgba(79, 126, 248, 0.55); }
.sa-trigger--open { background: linear-gradient(135deg, #ef4444, #f97316); box-shadow: 0 4px 20px rgba(239,68,68,0.35); }
.sa-trigger__icon { width: 22px; height: 22px; color: white; }
.sa-trigger__pulse {
  position: absolute;
  top: -2px; right: -2px;
  width: 12px; height: 12px;
  background: #22c55e;
  border-radius: 50%;
  border: 2px solid white;
  animation: sa-pulse 2s infinite;
}
@keyframes sa-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.7; }
}

/* ── 面板 ── */
.sa-panel {
  position: fixed;
  right: 24px;
  bottom: 140px;
  width: 340px;
  max-height: 560px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  z-index: 999;
  overflow: hidden;
  border: 1px solid rgba(0,0,0,0.06);
}
:root.dark .sa-panel { background: #1e1e2e; border-color: rgba(255,255,255,0.08); }

/* ── 头部 ── */
.sa-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  background: linear-gradient(135deg, #4f7ef8 0%, #8b5cf6 100%);
  flex-shrink: 0;
}
.sa-panel__title { display: flex; align-items: center; gap: 10px; }
.sa-avatar {
  width: 32px; height: 32px;
  background: rgba(255,255,255,0.2);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.sa-avatar svg { width: 16px; height: 16px; color: white; }
.sa-panel__name { color: white; font-weight: 600; font-size: 14px; display: block; }
.sa-panel__status { color: rgba(255,255,255,0.75); font-size: 11px; display: block; }
.sa-panel__actions { display: flex; gap: 4px; }
.sa-action-btn {
  width: 28px; height: 28px;
  border: none; background: rgba(255,255,255,0.15); border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: white; transition: background 0.15s;
}
.sa-action-btn:hover { background: rgba(255,255,255,0.25); }
.sa-action-btn svg { width: 14px; height: 14px; }
.sa-action-btn--close:hover { background: rgba(239,68,68,0.4); }

/* ── 面板体 ── */
.sa-panel__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

/* ── 快捷引导 ── */
.sa-shortcuts { padding: 14px 14px 6px; }
.sa-shortcuts__title { font-size: 12px; color: #6b7280; margin: 0 0 8px; }
.sa-shortcut-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.sa-shortcut-card {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 10px;
  background: #f8faff;
  border: 1px solid #e8edff;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  color: #374151;
  text-align: left;
  transition: all 0.15s;
}
.sa-shortcut-card:hover { background: #eff4ff; border-color: #c7d7ff; color: #4f7ef8; }
:root.dark .sa-shortcut-card { background: #2a2a3e; border-color: rgba(79,126,248,0.2); color: #d1d5db; }
.sa-shortcut-card__icon { font-size: 14px; }
.sa-shortcut-card__text { line-height: 1.3; }

/* ── 消息列表 ── */
.sa-messages {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 320px;
  min-height: 60px;
}
.sa-messages::-webkit-scrollbar { width: 4px; }
.sa-messages::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }

.sa-msg { display: flex; gap: 8px; align-items: flex-start; }
.sa-msg--user { flex-direction: row-reverse; }
.sa-msg__avatar {
  width: 26px; height: 26px; flex-shrink: 0;
  background: linear-gradient(135deg, #4f7ef8, #8b5cf6);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.sa-msg__avatar svg { width: 13px; height: 13px; color: white; }
.sa-msg__bubble {
  max-width: 80%;
  padding: 8px 11px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
}
.sa-msg--assistant .sa-msg__bubble {
  background: #f3f4f6;
  color: #111827;
  border-bottom-left-radius: 4px;
}
.sa-msg--user .sa-msg__bubble {
  background: linear-gradient(135deg, #4f7ef8, #8b5cf6);
  color: white;
  border-bottom-right-radius: 4px;
}
:root.dark .sa-msg--assistant .sa-msg__bubble { background: #2a2a3e; color: #e5e7eb; }

.sa-msg__bubble kbd {
  background: #e5e7eb; padding: 1px 5px; border-radius: 4px;
  font-size: 11px; font-family: monospace;
}

.sa-msg__actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.sa-msg__action-btn {
  padding: 4px 10px;
  background: white;
  border: 1px solid #c7d7ff;
  border-radius: 20px;
  font-size: 12px;
  color: #4f7ef8;
  cursor: pointer;
  transition: all 0.15s;
}
.sa-msg__action-btn:hover { background: #eff4ff; }

/* 打字动画 */
.sa-msg__bubble--typing {
  display: flex; align-items: center; gap: 4px; padding: 10px 14px;
}
.sa-msg__bubble--typing span {
  width: 6px; height: 6px;
  background: #9ca3af;
  border-radius: 50%;
  animation: typing-dot 1.4s infinite;
}
.sa-msg__bubble--typing span:nth-child(2) { animation-delay: 0.2s; }
.sa-msg__bubble--typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing-dot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

/* ── 输入区 ── */
.sa-input-area {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid #f3f4f6;
  flex-shrink: 0;
}
:root.dark .sa-input-area { border-top-color: rgba(255,255,255,0.06); }
.sa-input {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  padding: 7px 13px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
  background: #fafafa;
}
.sa-input:focus { border-color: #4f7ef8; background: white; }
:root.dark .sa-input { background: #2a2a3e; border-color: rgba(255,255,255,0.12); color: #e5e7eb; }
.sa-send-btn {
  width: 32px; height: 32px; flex-shrink: 0;
  background: linear-gradient(135deg, #4f7ef8, #8b5cf6);
  border: none; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: opacity 0.15s, transform 0.15s;
}
.sa-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sa-send-btn:not(:disabled):hover { transform: scale(1.05); }
.sa-send-btn svg { width: 15px; height: 15px; color: white; }
.sa-disclaimer { font-size: 11px; color: #9ca3af; text-align: center; margin: 0 0 8px; }

/* ── 过渡动效 ── */
.sa-panel-enter-active { animation: sa-panel-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.sa-panel-leave-active { animation: sa-panel-out 0.2s ease-in forwards; }
@keyframes sa-panel-in {
  from { opacity: 0; transform: translateY(20px) scale(0.92); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes sa-panel-out {
  to { opacity: 0; transform: translateY(10px) scale(0.96); }
}
.sa-icon-flip-enter-active, .sa-icon-flip-leave-active { transition: all 0.2s; position: absolute; }
.sa-icon-flip-enter-from { opacity: 0; transform: rotate(-90deg) scale(0.5); }
.sa-icon-flip-leave-to { opacity: 0; transform: rotate(90deg) scale(0.5); }
.sa-collapse-enter-active { animation: sa-collapse-in 0.25s ease; }
.sa-collapse-leave-active { animation: sa-collapse-out 0.2s ease forwards; }
@keyframes sa-collapse-in { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 600px; } }
@keyframes sa-collapse-out { to { opacity: 0; max-height: 0; } }
</style>
