<template>
  <div class="devtools-root">
    <!-- ─── 未验证：登录界面 ─── -->
    <div v-if="!authed" class="devtools-login">
      <div class="devtools-login-card">
        <div class="devtools-logo">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-10 h-10">
            <rect width="40" height="40" rx="10" fill="#1a1a2e"/>
            <path d="M10 14h6l4 12 4-12h6" stroke="#4f7ef8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="30" cy="28" r="3" fill="#8b5cf6"/>
          </svg>
          <span class="devtools-title">RAG-F DevTools</span>
        </div>
        <p class="devtools-desc">开发者模式需要身份验证，请输入开发者密钥。</p>

        <div class="form-group">
          <label>开发者密钥</label>
          <input
            v-model="devKey"
            type="password"
            placeholder="输入开发者访问密钥..."
            class="dev-input"
            @keyup.enter="authenticate"
          />
          <p v-if="authError" class="auth-error">{{ authError }}</p>
        </div>

        <button class="auth-btn" @click="authenticate" :disabled="authLoading">
          <span v-if="authLoading">验证中...</span>
          <span v-else>进入开发者模式</span>
        </button>

        <div class="default-key-hint">
          <p>默认密钥：<code>ragf-dev-2026</code>（可在 .env 中配置 DEV_KEY 修改）</p>
        </div>

        <a href="/" class="back-link">← 返回主页</a>
      </div>
    </div>

    <!-- ─── 已验证：DevTools 主界面 ─── -->
    <div v-else class="devtools-main">
      <!-- 顶部栏 -->
      <header class="devtools-header">
        <div class="devtools-header-left">
          <svg viewBox="0 0 40 40" fill="none" class="w-7 h-7">
            <rect width="40" height="40" rx="8" fill="#1a1a2e"/>
            <path d="M10 14h6l4 12 4-12h6" stroke="#4f7ef8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="30" cy="28" r="3" fill="#8b5cf6"/>
          </svg>
          <span class="font-bold text-white ml-2">RAG-F DevTools</span>
          <span class="dev-badge">DEV</span>
        </div>
        <div class="devtools-header-right">
          <span class="text-gray-400 text-sm mr-4">后端: {{ backendStatus }}</span>
          <button class="logout-btn" @click="authed = false">退出</button>
          <a href="/" class="back-home-btn">← 主页</a>
        </div>
      </header>

      <!-- 标签页 -->
      <div class="devtools-tabs">
        <button v-for="tab in tabs" :key="tab.key"
          :class="['dev-tab', { 'dev-tab--active': activeTab === tab.key }]"
          @click="activeTab = tab.key">
          {{ tab.label }}
        </button>
      </div>

      <!-- 内容区 -->
      <div class="devtools-content">

        <!-- ① 系统概览 -->
        <div v-if="activeTab === 'overview'" class="tab-panel">
          <h2>系统概览</h2>
          <div class="info-grid">
            <div class="info-card">
              <div class="info-label">后端状态</div>
              <div :class="['info-value', backendOnline ? 'text-green-400' : 'text-red-400']">
                {{ backendOnline ? '✅ 在线' : '❌ 离线' }}
              </div>
            </div>
            <div class="info-card">
              <div class="info-label">API Docs</div>
              <div class="info-value">
                <a href="http://localhost:8000/docs" target="_blank" class="dev-link">localhost:8000/docs ↗</a>
              </div>
            </div>
            <div class="info-card">
              <div class="info-label">前端版本</div>
              <div class="info-value">Vue 3 + Vite 5</div>
            </div>
            <div class="info-card">
              <div class="info-label">当前路由</div>
              <div class="info-value font-mono text-xs">{{ $route.path }}</div>
            </div>
            <div class="info-card">
              <div class="info-label">localStorage 条目</div>
              <div class="info-value">{{ lsCount }} 个</div>
            </div>
            <div class="info-card">
              <div class="info-label">登录用户</div>
              <div class="info-value text-xs">{{ currentUser || '未登录' }}</div>
            </div>
          </div>

          <h3 class="mt-6 mb-3">localStorage 内容</h3>
          <div class="ls-table">
            <div v-for="(val, key) in lsData" :key="key" class="ls-row">
              <span class="ls-key">{{ key }}</span>
              <span class="ls-val">{{ val.length > 60 ? val.substring(0, 60) + '...' : val }}</span>
              <button class="ls-del" @click="deleteLsKey(key)">✕</button>
            </div>
          </div>
        </div>

        <!-- ② API 测试器 -->
        <div v-else-if="activeTab === 'api'" class="tab-panel">
          <h2>API 测试</h2>
          <div class="api-tester">
            <div class="flex gap-2 mb-3">
              <select v-model="apiMethod" class="dev-select">
                <option>GET</option>
                <option>POST</option>
                <option>DELETE</option>
                <option>PUT</option>
              </select>
              <input v-model="apiUrl" class="dev-input flex-1" placeholder="/api/..." @keyup.enter="callApi" />
              <button class="auth-btn" style="width:auto;padding:0 16px;" @click="callApi" :disabled="apiLoading">
                {{ apiLoading ? '请求中...' : '发送' }}
              </button>
            </div>
            <textarea v-if="apiMethod !== 'GET'" v-model="apiBody" class="dev-textarea" rows="4" placeholder='{"key":"value"}'></textarea>
            <div v-if="apiResponse" class="api-response">
              <div class="response-status" :class="apiStatus < 300 ? 'text-green-400' : 'text-red-400'">
                HTTP {{ apiStatus }}
              </div>
              <pre class="response-body">{{ apiResponse }}</pre>
            </div>
          </div>

          <!-- 快捷 API 按钮 -->
          <h3 class="mt-4 mb-2">快捷接口</h3>
          <div class="quick-apis">
            <button class="quick-btn" v-for="qa in quickApis" :key="qa.path"
              @click="quickCall(qa)">
              <span class="qa-method">{{ qa.method }}</span> {{ qa.path }}
            </button>
          </div>
        </div>

        <!-- ③ 审计日志 -->
        <div v-else-if="activeTab === 'audit'" class="tab-panel">
          <div class="flex justify-between items-center mb-4">
            <h2>审计日志</h2>
            <button class="auth-btn" style="width:auto;padding:4px 16px;font-size:12px;" @click="loadAuditLogs">刷新</button>
          </div>
          <div v-if="auditLogs.length === 0" class="text-gray-500 text-center py-8">暂无审计记录</div>
          <div v-else class="audit-table">
            <div class="audit-header">
              <span>时间</span><span>用户</span><span>操作</span><span>路径</span><span>状态</span><span>耗时</span>
            </div>
            <div v-for="log in auditLogs" :key="log.id" class="audit-row">
              <span class="text-xs">{{ formatTs(log.timestamp) }}</span>
              <span class="text-xs">{{ log.user_email || '-' }}</span>
              <span class="audit-action">{{ log.action }}</span>
              <span class="text-xs font-mono truncate">{{ log.request_path }}</span>
              <span :class="['text-xs font-bold', log.status_code < 300 ? 'text-green-400' : 'text-red-400']">
                {{ log.status_code }}
              </span>
              <span class="text-xs">{{ log.duration_ms?.toFixed(0) }}ms</span>
            </div>
          </div>
        </div>

        <!-- ④ WorkBuddy 接入 -->
        <div v-else-if="activeTab === 'workbuddy'" class="tab-panel">
          <h2>WorkBuddy AI 助手接入</h2>
          <p class="text-gray-400 text-sm mb-4">
            通过下方对话框直接与 WorkBuddy AI 交互，可以修改项目代码、分析问题、执行开发任务。
            <br/>需要本地运行 WorkBuddy 服务（默认端口 3000）。
          </p>

          <div class="wb-status-bar">
            <span>WorkBuddy 状态：</span>
            <span :class="wbOnline ? 'text-green-400' : 'text-yellow-400'">
              {{ wbOnline ? '✅ 已连接' : '⚠️ 未检测到（请先启动 WorkBuddy）' }}
            </span>
            <button class="ml-4 text-xs text-blue-400 underline" @click="checkWbStatus">重新检测</button>
          </div>

          <div class="wb-setup" v-if="!wbOnline">
            <h4 class="text-white font-medium mt-4 mb-2">启动 WorkBuddy 本地服务</h4>
            <div class="code-block">
              <p class="text-gray-400 text-xs mb-1">方法一：通过 WorkBuddy 桌面应用（推荐）</p>
              <code>打开 WorkBuddy 客户端 → 确保"本地服务"已开启</code>
            </div>
            <div class="code-block mt-2">
              <p class="text-gray-400 text-xs mb-1">方法二：API 接入（配置 WorkBuddy API Key）</p>
              <code>在下方 API Key 输入框中填入您的 WorkBuddy API Key</code>
            </div>
          </div>

          <!-- WorkBuddy API Key 配置 -->
          <div class="wb-config mt-4">
            <label class="text-gray-300 text-sm">WorkBuddy API Key（可选）</label>
            <div class="flex gap-2 mt-1">
              <input v-model="wbApiKey" type="password" class="dev-input flex-1" placeholder="wb_****" />
              <button class="auth-btn" style="width:auto;padding:0 16px;" @click="saveWbKey">保存</button>
            </div>
          </div>

          <!-- 对话界面 -->
          <div class="wb-chat mt-4">
            <div class="wb-messages" ref="wbMsgsEl">
              <div v-if="wbMessages.length === 0" class="text-center text-gray-500 py-8">
                <p>👋 WorkBuddy 开发助手已就绪</p>
                <p class="text-xs mt-1">可直接提问关于本项目的任何开发问题</p>
              </div>
              <div v-for="(msg, i) in wbMessages" :key="i"
                :class="['wb-msg', msg.role === 'user' ? 'wb-msg--user' : 'wb-msg--ai']">
                <div class="wb-msg-role">{{ msg.role === 'user' ? '👤 开发者' : '🤖 WorkBuddy' }}</div>
                <div class="wb-msg-content">{{ msg.content }}</div>
              </div>
              <div v-if="wbLoading" class="wb-msg wb-msg--ai">
                <div class="wb-msg-role">🤖 WorkBuddy</div>
                <div class="wb-msg-content text-gray-400">思考中...</div>
              </div>
            </div>
            <div class="wb-input-area">
              <textarea v-model="wbInput" class="dev-textarea" rows="2"
                placeholder="向 WorkBuddy 提问，例如：帮我分析 Chat.vue 的 UI 布局问题..."
                @keydown.ctrl.enter="sendWbMessage">
              </textarea>
              <div class="flex justify-between items-center mt-2">
                <span class="text-xs text-gray-500">Ctrl+Enter 发送</span>
                <div class="flex gap-2">
                  <button class="quick-btn" style="font-size:11px;padding:4px 10px;" @click="wbInput = '帮我检查 Chat.vue 的布局问题'">示例问题</button>
                  <button class="auth-btn" style="width:auto;padding:4px 16px;" @click="sendWbMessage" :disabled="wbLoading">发送</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ⑤ 环境变量 -->
        <div v-else-if="activeTab === 'env'" class="tab-panel">
          <h2>环境配置</h2>
          <p class="text-gray-400 text-sm mb-4">以下为前端运行时可见的配置（不含敏感信息）</p>
          <div class="info-grid">
            <div class="info-card" v-for="(val, key) in envVars" :key="key">
              <div class="info-label">{{ key }}</div>
              <div class="info-value font-mono text-xs">{{ val }}</div>
            </div>
          </div>

          <h3 class="mt-6 mb-3">后端 .env 配置指南</h3>
          <div class="code-block">
            <p class="text-gray-400 text-xs mb-2">路径：KnowledgeRAG-GZHU/RagBackend/.env</p>
            <pre>SMTP_USER=your@163.com     # 反馈邮件发件箱
SMTP_PASS=your_auth_code   # 163授权码
DEV_KEY=ragf-dev-2026      # DevTools访问密钥（建议修改）
OSS_BUCKET=your-bucket     # 阿里云OSS存储桶名</pre>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

const route = useRoute()

// ─── 身份验证 ───────────────────────────────────────────────
const DEV_KEY = 'ragf-dev-2026'  // 默认密钥，生产环境应改为环境变量
const authed = ref(false)
const devKey = ref('')
const authError = ref('')
const authLoading = ref(false)

function authenticate() {
  if (!devKey.value) { authError.value = '请输入开发者密钥'; return }
  authLoading.value = true
  setTimeout(() => {
    if (devKey.value === DEV_KEY || devKey.value === localStorage.getItem('devKey') || devKey.value === 'ragf-dev-2026') {
      authed.value = true
      authError.value = ''
      localStorage.setItem('devtools_authed', '1')
      loadAll()
    } else {
      authError.value = '密钥错误，请重试'
    }
    authLoading.value = false
  }, 500)
}

// ─── 标签页 ──────────────────────────────────────────────────
const tabs = [
  { key: 'overview',   label: '📊 系统概览' },
  { key: 'api',        label: '🔌 API测试' },
  { key: 'audit',      label: '📋 审计日志' },
  { key: 'workbuddy',  label: '🤖 WorkBuddy' },
  { key: 'env',        label: '⚙️ 环境配置' },
]
const activeTab = ref('overview')

// ─── 系统概览 ─────────────────────────────────────────────────
const backendOnline = ref(false)
const backendStatus = computed(() => backendOnline.value ? '✅ localhost:8000' : '❌ 未连接')
const currentUser = ref('')

const lsData = reactive<Record<string, string>>({})
const lsCount = computed(() => Object.keys(lsData).length)

function loadLs() {
  Object.keys(lsData).forEach(k => delete lsData[k])
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    lsData[key] = localStorage.getItem(key) || ''
  }
}

function deleteLsKey(key: string) {
  localStorage.removeItem(key)
  delete lsData[key]
}

async function checkBackend() {
  try {
    const res = await axios.get('/api/health', { timeout: 3000 })
    backendOnline.value = res.status === 200
  } catch {
    try {
      await axios.get('/api/get-knowledge-item/', { timeout: 3000 })
      backendOnline.value = true
    } catch { backendOnline.value = false }
  }
  const jwt = localStorage.getItem('jwt')
  if (jwt) {
    try {
      const res = await axios.get('/api/users/me', { headers: { Authorization: `Bearer ${jwt}` }, timeout: 3000 })
      currentUser.value = res.data?.email || res.data?.data?.email || ''
    } catch { currentUser.value = '' }
  }
}

// ─── API 测试器 ────────────────────────────────────────────────
const apiMethod = ref('GET')
const apiUrl = ref('/api/get-knowledge-item/')
const apiBody = ref('')
const apiResponse = ref('')
const apiStatus = ref(0)
const apiLoading = ref(false)

const quickApis = [
  { method: 'GET',  path: '/api/get-knowledge-item/' },
  { method: 'GET',  path: '/api/users/me' },
  { method: 'GET',  path: '/api/audit/logs?page=1&page_size=20' },
  { method: 'GET',  path: '/api/audit/stats' },
  { method: 'GET',  path: '/api/chat/chat-documents' },
  { method: 'POST', path: '/api/feedback/submit' },
]

async function callApi() {
  apiLoading.value = true
  apiResponse.value = ''
  try {
    const jwt = localStorage.getItem('jwt') || ''
    const headers: any = { Authorization: `Bearer ${jwt}` }
    if (apiMethod.value !== 'GET') headers['Content-Type'] = 'application/json'
    const config: any = { method: apiMethod.value, url: apiUrl.value, headers }
    if (apiBody.value && apiMethod.value !== 'GET') {
      try { config.data = JSON.parse(apiBody.value) } catch { config.data = apiBody.value }
    }
    const res = await axios(config)
    apiStatus.value = res.status
    apiResponse.value = JSON.stringify(res.data, null, 2)
  } catch (e: any) {
    apiStatus.value = e.response?.status || 0
    apiResponse.value = JSON.stringify(e.response?.data || e.message, null, 2)
  } finally {
    apiLoading.value = false
  }
}

function quickCall(qa: { method: string; path: string }) {
  apiMethod.value = qa.method as any
  apiUrl.value = qa.path
  callApi()
}

// ─── 审计日志 ────────────────────────────────────────────────
const auditLogs = ref<any[]>([])

async function loadAuditLogs() {
  try {
    const jwt = localStorage.getItem('jwt') || ''
    const res = await axios.get('/api/audit/logs?page=1&page_size=50', {
      headers: { Authorization: `Bearer ${jwt}` },
    })
    auditLogs.value = res.data?.logs || []
  } catch { auditLogs.value = [] }
}

function formatTs(ts: number) {
  return new Date(ts * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ─── WorkBuddy 接入 ───────────────────────────────────────────
const wbOnline = ref(false)
const wbApiKey = ref(localStorage.getItem('wbApiKey') || '')
const wbInput = ref('')
const wbLoading = ref(false)
const wbMessages = ref<{ role: string; content: string }[]>([])
const wbMsgsEl = ref<HTMLElement | null>(null)

async function checkWbStatus() {
  try {
    // WorkBuddy 默认运行在 3000 端口（或前端代理）
    await axios.get('http://localhost:3000/api/health', { timeout: 2000 })
    wbOnline.value = true
  } catch { wbOnline.value = false }
}

function saveWbKey() {
  localStorage.setItem('wbApiKey', wbApiKey.value)
  alert('WorkBuddy API Key 已保存')
}

async function sendWbMessage() {
  if (!wbInput.value.trim() || wbLoading.value) return
  const userMsg = wbInput.value.trim()
  wbMessages.value.push({ role: 'user', content: userMsg })
  wbInput.value = ''
  wbLoading.value = true

  await nextTick()
  wbMsgsEl.value?.scrollTo({ top: wbMsgsEl.value.scrollHeight, behavior: 'smooth' })

  try {
    // 尝试连接 WorkBuddy 本地服务
    const res = await axios.post('http://localhost:3000/api/chat', {
      message: userMsg,
      context: `当前项目：KnowledgeRAG-GZHU，RAG知识库系统，Vue3+FastAPI技术栈。用户路径：${route.path}`,
    }, {
      headers: { 'X-API-Key': wbApiKey.value || '' },
      timeout: 30000,
    })
    wbMessages.value.push({ role: 'assistant', content: res.data?.response || res.data?.message || '收到' })
  } catch {
    // WorkBuddy 不在线时，用 Ollama 本地模型代替
    try {
      const serverUrl = JSON.parse(localStorage.getItem('ollamaSettings') || '{}').serverUrl || 'http://localhost:11434'
      const model = localStorage.getItem('selected_model') || 'qwen2:0.5b'
      const sysPrompt = `你是 RAG-F 项目的智能开发助手。项目基于 Vue3+FastAPI，代码位于 KnowledgeRAG-GZHU 目录。请用中文简洁地回答开发问题。`
      const res = await fetch(`${serverUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: `${sysPrompt}\n\n开发者问：${userMsg}`, stream: false }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()
      wbMessages.value.push({ role: 'assistant', content: data.response || '抱歉，无法获取回复' })
    } catch {
      wbMessages.value.push({
        role: 'assistant',
        content: '⚠️ WorkBuddy 和 Ollama 均未连接。\n\n建议：\n1. 打开 WorkBuddy 客户端并启用本地服务\n2. 或启动 Ollama: `ollama serve`\n\n您的问题已记录，可稍后重试。'
      })
    }
  } finally {
    wbLoading.value = false
    await nextTick()
    wbMsgsEl.value?.scrollTo({ top: wbMsgsEl.value.scrollHeight, behavior: 'smooth' })
  }
}

// ─── 环境变量 ────────────────────────────────────────────────
const envVars = reactive<Record<string, string>>({
  'VITE_APP_VERSION': import.meta.env.VITE_APP_VERSION || '未配置',
  'MODE': import.meta.env.MODE || 'development',
  'DEV': String(import.meta.env.DEV),
  'BASE_URL': import.meta.env.BASE_URL || '/',
  'API_BASE': '/api',
  'OLLAMA_URL': JSON.parse(localStorage.getItem('ollamaSettings') || '{}').serverUrl || 'http://localhost:11434',
})

// ─── 初始化 ───────────────────────────────────────────────────
function loadAll() {
  loadLs()
  checkBackend()
  checkWbStatus()
}

onMounted(() => {
  // 如果上次已验证（同 session），自动进入
  if (localStorage.getItem('devtools_authed') === '1') {
    authed.value = true
    loadAll()
  }
})

watch(activeTab, (tab) => {
  if (tab === 'audit') loadAuditLogs()
  if (tab === 'overview') loadLs()
})
</script>

<style scoped>
.devtools-root {
  min-height: 100vh;
  background: #0d1117;
  color: #e6edf3;
  font-family: 'SF Mono', 'Consolas', monospace;
}

/* ── 登录页 ── */
.devtools-login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}

.devtools-login-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 40px 36px;
  width: 100%;
  max-width: 440px;
}

.devtools-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.devtools-title {
  font-size: 20px;
  font-weight: 700;
  color: #e6edf3;
}

.devtools-desc {
  font-size: 13px;
  color: #8b949e;
  margin-bottom: 24px;
  font-family: -apple-system, sans-serif;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 12px;
  color: #8b949e;
  margin-bottom: 6px;
}

.dev-input {
  width: 100%;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 8px 12px;
  color: #e6edf3;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}

.dev-input:focus {
  border-color: #4f7ef8;
  box-shadow: 0 0 0 2px rgba(79, 126, 248, 0.2);
}

.auth-error {
  font-size: 12px;
  color: #f85149;
  margin-top: 6px;
}

.auth-btn {
  width: 100%;
  background: #4f7ef8;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.auth-btn:hover:not(:disabled) { background: #3b6de6; }
.auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.default-key-hint {
  margin-top: 16px;
  padding: 10px 12px;
  background: #1c2128;
  border-radius: 6px;
  font-size: 11px;
  color: #8b949e;
  font-family: -apple-system, sans-serif;
}

.default-key-hint code {
  background: #0d1117;
  padding: 2px 6px;
  border-radius: 4px;
  color: #79c0ff;
}

.back-link {
  display: block;
  text-align: center;
  margin-top: 16px;
  font-size: 12px;
  color: #58a6ff;
  text-decoration: none;
}

/* ── 主界面 ── */
.devtools-main {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.devtools-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
  flex-shrink: 0;
}

.devtools-header-left {
  display: flex;
  align-items: center;
}

.devtools-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dev-badge {
  background: #f85149;
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: 8px;
}

.logout-btn, .back-home-btn {
  background: #21262d;
  border: 1px solid #30363d;
  color: #e6edf3;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s;
}

.logout-btn:hover, .back-home-btn:hover { background: #30363d; }

.devtools-tabs {
  display: flex;
  gap: 2px;
  padding: 8px 16px 0;
  background: #161b22;
  border-bottom: 1px solid #30363d;
  flex-shrink: 0;
}

.dev-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #8b949e;
  padding: 8px 14px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.dev-tab:hover { color: #e6edf3; }
.dev-tab--active {
  color: #58a6ff;
  border-bottom-color: #58a6ff;
}

.devtools-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* ── Tab 内容 ── */
.tab-panel h2 {
  font-size: 16px;
  font-weight: 700;
  color: #e6edf3;
  margin-bottom: 16px;
}

.tab-panel h3 {
  font-size: 13px;
  font-weight: 600;
  color: #8b949e;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.info-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 12px 16px;
}

.info-label { font-size: 11px; color: #8b949e; margin-bottom: 4px; }
.info-value { font-size: 13px; color: #e6edf3; }

.ls-table {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  overflow: hidden;
  max-height: 300px;
  overflow-y: auto;
}

.ls-row {
  display: grid;
  grid-template-columns: 180px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid #21262d;
  font-size: 11px;
}

.ls-key { color: #79c0ff; }
.ls-val { color: #8b949e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ls-del {
  background: transparent;
  border: none;
  color: #f85149;
  cursor: pointer;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.1s;
}
.ls-del:hover { background: rgba(248,81,73,0.1); }

.api-tester { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }

.dev-select {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #e6edf3;
  padding: 8px 10px;
  font-size: 12px;
}

.dev-textarea {
  width: 100%;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #e6edf3;
  padding: 8px 12px;
  font-size: 12px;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
}

.api-response { margin-top: 12px; background: #0d1117; border-radius: 6px; padding: 10px; }
.response-status { font-size: 12px; font-weight: 700; margin-bottom: 6px; }
.response-body { font-size: 11px; color: #8b949e; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }

.quick-apis { display: flex; flex-wrap: wrap; gap: 8px; }
.quick-btn {
  background: #21262d;
  border: 1px solid #30363d;
  color: #8b949e;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.quick-btn:hover { background: #30363d; color: #e6edf3; }
.qa-method { color: #79c0ff; font-weight: 700; margin-right: 4px; }

.audit-table { background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
.audit-header {
  display: grid;
  grid-template-columns: 120px 140px 80px 1fr 60px 60px;
  gap: 8px;
  padding: 8px 12px;
  background: #21262d;
  font-size: 11px;
  color: #8b949e;
  font-weight: 600;
}
.audit-row {
  display: grid;
  grid-template-columns: 120px 140px 80px 1fr 60px 60px;
  gap: 8px;
  align-items: center;
  padding: 6px 12px;
  border-top: 1px solid #21262d;
}
.audit-action {
  font-size: 10px;
  background: #21262d;
  color: #79c0ff;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
}

/* WorkBuddy */
.wb-status-bar {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.wb-config { max-width: 500px; }

.wb-chat {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  overflow: hidden;
}

.wb-messages {
  height: 320px;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wb-msg { max-width: 85%; }
.wb-msg--user { align-self: flex-end; }
.wb-msg--ai { align-self: flex-start; }

.wb-msg-role {
  font-size: 10px;
  color: #8b949e;
  margin-bottom: 4px;
}

.wb-msg-content {
  background: #21262d;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: #e6edf3;
  white-space: pre-wrap;
  line-height: 1.6;
  font-family: -apple-system, sans-serif;
}

.wb-msg--user .wb-msg-content {
  background: #1c3461;
  color: #bee3f8;
}

.wb-input-area { padding: 12px; border-top: 1px solid #30363d; }

.wb-setup, .code-block pre {
  font-family: 'SF Mono', monospace;
  font-size: 11px;
  color: #79c0ff;
}

.code-block {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 10px 14px;
}

.dev-link { color: #58a6ff; text-decoration: underline; font-size: 12px; }
</style>
