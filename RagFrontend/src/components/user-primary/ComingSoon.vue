<template>
  <div class="p-6">

    <!-- ① 外观设置 (id=1) -->
    <section v-if="route.params.id === '1'" class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-100">外观设置</h2>

      <!-- 深色模式 -->
      <div class="mb-8 p-5 border border-gray-200 rounded-xl">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-2xl">{{ isDark ? '🌙' : '☀️' }}</span>
            <div>
              <h3 class="font-medium text-gray-900">深色模式</h3>
              <p class="text-sm text-gray-500 mt-0.5">切换界面深色 / 浅色主题</p>
            </div>
          </div>
          <t-switch v-model="isDark" size="large" @change="applyDarkMode" />
        </div>
      </div>

      <!-- 主题颜色 -->
      <div class="mb-8">
        <h3 class="font-medium text-gray-900 mb-3">主题颜色</h3>
        <div class="flex flex-wrap gap-3">
          <button
            v-for="c in themeColors" :key="c.key"
            @click="applyThemeColor(c)"
            :title="c.label"
            :class="['w-10 h-10 rounded-full border-4 transition-all duration-200 shadow-md',
              activeColor === c.key ? 'border-gray-700 scale-110' : 'border-white hover:border-gray-300']"
            :style="{ background: c.value }"
          />
        </div>
        <p class="text-xs text-gray-400 mt-2">当前：{{ currentColorLabel }}</p>
      </div>

      <!-- 布局选项 -->
      <div class="mb-8">
        <h3 class="font-medium text-gray-900 mb-3">侧边栏布局</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <button
            v-for="l in layoutOptions" :key="l.key"
            @click="applyLayout(l.key)"
            :class="['p-4 border-2 rounded-xl text-center transition-all duration-200',
              activeLayout === l.key
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 hover:border-blue-300 text-gray-700']"
          >
            <div class="text-2xl mb-1">{{ l.icon }}</div>
            <div class="text-sm font-medium">{{ l.label }}</div>
            <div class="text-xs text-gray-400 mt-0.5">{{ l.desc }}</div>
          </button>
        </div>
      </div>

      <!-- 字体大小 -->
      <div class="mb-6">
        <h3 class="font-medium text-gray-900 mb-3">字体大小</h3>
        <t-radio-group v-model="fontSize" @change="applyFontSize">
          <t-radio value="sm">小</t-radio>
          <t-radio value="md">中（默认）</t-radio>
          <t-radio value="lg">大</t-radio>
        </t-radio-group>
      </div>

      <t-button theme="primary" @click="saveAppearance">
        <template #icon><t-icon name="check" /></template>
        保存外观设置
      </t-button>
    </section>

    <!-- ② 第三方账号绑定 (id=2) -->
    <section v-else-if="route.params.id === '2'" class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-100">第三方账号绑定</h2>
      <p class="text-gray-500 text-sm mb-6">绑定第三方账号后，您可以使用其快速登录本系统。</p>

      <div class="space-y-4">
        <div v-for="provider in thirdPartyList" :key="provider.key"
          class="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-blue-200 transition-all">
          <div class="flex items-center gap-4">
            <div :class="['w-12 h-12 rounded-full flex items-center justify-center text-xl', provider.bgClass]">
              {{ provider.icon }}
            </div>
            <div>
              <h4 class="font-medium text-gray-900">{{ provider.label }}</h4>
              <p class="text-xs text-gray-500 mt-0.5">
                {{ bindingStatus[provider.key] ? `已绑定：${bindingStatus[provider.key]}` : '未绑定' }}
              </p>
            </div>
          </div>
          <div class="flex gap-2">
            <t-button
              v-if="!bindingStatus[provider.key]"
              theme="primary" variant="outline" size="small"
              @click="bindAccount(provider)">
              绑定
            </t-button>
            <t-button
              v-else
              theme="danger" variant="outline" size="small"
              @click="unbindAccount(provider)">
              解绑
            </t-button>
          </div>
        </div>
      </div>

      <!-- 绑定说明 -->
      <div class="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
        <strong>说明：</strong>绑定后，您可在登录页选择「第三方登录」，通过已绑定账号一键登录。解绑需要确保账号密码登录可用。
      </div>

      <!-- 绑定弹窗 -->
      <t-dialog v-model:visible="bindDialogVisible" :header="`绑定 ${currentProvider?.label} 账号`" :footer="false" width="420px">
        <div class="py-4">
          <p class="text-gray-600 text-sm mb-4">请输入您的 {{ currentProvider?.label }} 账号标识（用户名/邮箱/OpenID）：</p>
          <t-input v-model="bindInput" :placeholder="`${currentProvider?.label} 账号`" clearable />
          <div class="flex justify-end gap-3 mt-6">
            <t-button variant="outline" @click="bindDialogVisible = false">取消</t-button>
            <t-button theme="primary" @click="confirmBind">确认绑定</t-button>
          </div>
        </div>
      </t-dialog>
    </section>

    <!-- ③ 实验性功能 / 语音交互 (id=3) -->
    <section v-else-if="route.params.id === '3'" class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-100">探索新功能</h2>

      <div class="border border-yellow-200 rounded-xl p-4 bg-yellow-50 mb-6">
        <div class="flex items-start gap-3">
          <t-icon name="error" class="text-yellow-500 text-xl mt-0.5" />
          <div>
            <h4 class="font-medium text-yellow-800">实验性功能说明</h4>
            <p class="text-yellow-700 text-sm mt-1">以下功能处于测试阶段，可能存在不稳定情况，请谨慎使用。</p>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <!-- 语音交互 -->
        <div class="border border-gray-200 rounded-xl p-5">
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <span class="text-2xl">🎙️</span>
              <div>
                <h4 class="font-medium text-gray-900">语音交互</h4>
                <p class="text-sm text-gray-500 mt-0.5">通过语音与 AI 对话，支持语音输入和转录</p>
              </div>
            </div>
            <t-switch v-model="voiceEnabled" size="large" @change="onVoiceToggle" />
          </div>

          <!-- 语音录制区（仅在启用后显示） -->
          <div v-if="voiceEnabled" class="mt-4 pt-4 border-t border-gray-100">
            <div class="flex flex-col items-center gap-4">
              <!-- 录音按钮 -->
              <button
                @mousedown="startRecording" @mouseup="stopRecording"
                @touchstart.prevent="startRecording" @touchend.prevent="stopRecording"
                :class="['w-20 h-20 rounded-full flex items-center justify-center text-3xl shadow-lg transition-all duration-200 select-none',
                  isRecording
                    ? 'bg-red-500 text-white scale-110 shadow-red-300 animate-pulse'
                    : 'bg-blue-500 text-white hover:bg-blue-600 hover:scale-105']">
                {{ isRecording ? '⏹️' : '🎤' }}
              </button>
              <p class="text-sm text-gray-500">
                {{ isRecording ? '录音中，松开停止...' : '按住录音' }}
              </p>

              <!-- 波形可视化 -->
              <div v-if="isRecording" class="flex items-end gap-1 h-8">
                <div v-for="n in 12" :key="n"
                  class="w-1.5 bg-blue-400 rounded-full"
                  :style="{ height: waveHeights[n-1] + 'px', transition: 'height 0.1s ease' }">
                </div>
              </div>

              <!-- 转录结果 -->
              <div v-if="transcriptText" class="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                <p class="text-xs text-gray-400 mb-1">识别结果：</p>
                <p>{{ transcriptText }}</p>
                <div class="flex gap-2 mt-2">
                  <t-button size="small" theme="primary" @click="sendTranscript">发送到对话</t-button>
                  <t-button size="small" variant="outline" @click="transcriptText = ''">清除</t-button>
                </div>
              </div>

              <!-- 状态提示 -->
              <p v-if="voiceStatus" class="text-xs text-blue-500">{{ voiceStatus }}</p>
            </div>
          </div>
        </div>

        <!-- 其他实验功能 -->
        <div class="flex items-center justify-between p-4 border border-gray-200 rounded-xl opacity-60">
          <div>
            <h4 class="font-medium text-gray-700">新界面布局</h4>
            <p class="text-sm text-gray-400">尝试全新的界面布局设计（开发中）</p>
          </div>
          <t-switch size="large" disabled />
        </div>

        <div class="flex items-center justify-between p-4 border border-gray-200 rounded-xl opacity-60">
          <div>
            <h4 class="font-medium text-gray-700">AI 智能摘要</h4>
            <p class="text-sm text-gray-400">自动为长文档生成摘要（开发中）</p>
          </div>
          <t-switch size="large" disabled />
        </div>
      </div>
    </section>

    <!-- ④ 反馈与建议 (id=4) -->
    <section v-else-if="route.params.id === '4'" class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-100">反馈与建议</h2>
      <p class="text-gray-500 text-sm mb-6">您的反馈对我们非常重要，提交后将发送到开发团队邮箱。</p>

      <div class="space-y-5">
        <!-- 反馈类型 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">反馈类型</label>
          <t-radio-group v-model="feedback.type">
            <t-radio value="bug">🐛 Bug 报告</t-radio>
            <t-radio value="feature">💡 功能建议</t-radio>
            <t-radio value="ui">🎨 UI 改进</t-radio>
            <t-radio value="other">💬 其他</t-radio>
          </t-radio-group>
        </div>

        <!-- 标题 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">标题 <span class="text-red-400">*</span></label>
          <t-input v-model="feedback.title" placeholder="请简要描述您的反馈" clearable :maxlength="80" show-limit-number />
        </div>

        <!-- 详情 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">详细描述 <span class="text-red-400">*</span></label>
          <t-textarea v-model="feedback.content" placeholder="请详细描述问题或建议，包括复现步骤、期望效果等..." :rows="5" :maxlength="2000" show-limit-number />
        </div>

        <!-- 联系方式 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">您的邮箱（选填，方便我们回复）</label>
          <t-input v-model="feedback.email" placeholder="example@email.com" type="email" />
        </div>

        <!-- 提交按钮 -->
        <div class="flex items-center gap-4 pt-2">
          <t-button theme="primary" :loading="feedbackLoading" @click="submitFeedback">
            <template #icon><t-icon name="send" /></template>
            提交反馈
          </t-button>
          <t-button variant="outline" @click="resetFeedback">重置</t-button>
        </div>

        <!-- 提交成功提示 -->
        <div v-if="feedbackSent" class="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-center gap-2">
          <t-icon name="check-circle" class="text-green-500" />
          反馈已提交！感谢您的宝贵意见，我们将尽快处理。
        </div>
      </div>
    </section>

    <!-- ⑤ 隐私政策 (id=5) -->
    <section v-else-if="route.params.id === '5'" class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-100">隐私政策</h2>
      <div class="prose prose-sm text-gray-600 space-y-4">
        <p>RAG-F 智能知识库系统非常重视用户的隐私保护。</p>
        <h3 class="font-medium text-gray-900">数据收集</h3>
        <p>我们仅收集您主动上传的文档和对话记录，用于提供知识检索服务。</p>
        <h3 class="font-medium text-gray-900">数据使用</h3>
        <p>您的数据不会被用于训练模型，也不会被分享给任何第三方。</p>
        <h3 class="font-medium text-gray-900">数据存储</h3>
        <p>所有数据存储在本地或您指定的私有服务器上，我们不持有您的数据副本。</p>
        <h3 class="font-medium text-gray-900">联系我们</h3>
        <p>如有隐私相关问题，请通过「反馈与建议」页面联系我们。</p>
      </div>
    </section>

    <!-- ⑥ 关于本项目 (id=6) -->
    <section v-else-if="route.params.id === '6'" class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-100">关于本项目</h2>
      <div class="space-y-4 text-gray-600 text-sm">
        <div class="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
          <span class="text-3xl">🧠</span>
          <div>
            <h3 class="font-semibold text-gray-900">RAG-F 智能知识库系统</h3>
            <p class="text-gray-500 text-xs mt-1">基于 RAG 检索增强生成技术的智能知识管理平台</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 border border-gray-200 rounded-lg"><span class="text-gray-400 text-xs">前端框架</span><p class="font-medium mt-1">Vue 3 + TypeScript</p></div>
          <div class="p-3 border border-gray-200 rounded-lg"><span class="text-gray-400 text-xs">后端框架</span><p class="font-medium mt-1">FastAPI (Python)</p></div>
          <div class="p-3 border border-gray-200 rounded-lg"><span class="text-gray-400 text-xs">AI 推理</span><p class="font-medium mt-1">Ollama + LangChain</p></div>
          <div class="p-3 border border-gray-200 rounded-lg"><span class="text-gray-400 text-xs">移动端</span><p class="font-medium mt-1">React Native (Expo)</p></div>
        </div>
      </div>
    </section>

    <!-- 兜底 -->
    <section v-else class="mb-8">
      <div class="text-center py-12">
        <t-icon name="info-circle" class="text-5xl text-blue-500 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 mb-2">功能即将上线</h3>
        <p class="text-gray-500 max-w-md mx-auto">我们正在努力开发中，请耐心等待！</p>
      </div>
    </section>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Icon as TIcon, Switch as TSwitch, Button as TButton,
  Input as TInput, Textarea as TTextarea, RadioGroup as TRadioGroup, Radio as TRadio,
  Dialog as TDialog, MessagePlugin
} from 'tdesign-vue-next'
import axios from 'axios'

const route = useRoute()
const router = useRouter()

// ─────────────────── ① 外观设置 ────────────────────────────────
const isDark = ref(localStorage.getItem('theme') === 'dark')
const activeColor = ref(localStorage.getItem('themeColor') || 'blue')
const activeLayout = ref(localStorage.getItem('sidebarLayout') || 'default')
const fontSize = ref(localStorage.getItem('fontSize') || 'md')

const themeColors = [
  { key: 'blue',   label: '科技蓝', value: '#3b82f6' },
  { key: 'indigo', label: '靛青',   value: '#6366f1' },
  { key: 'violet', label: '紫罗兰', value: '#8b5cf6' },
  { key: 'cyan',   label: '青色',   value: '#06b6d4' },
  { key: 'teal',   label: '绿松石', value: '#14b8a6' },
  { key: 'green',  label: '绿色',   value: '#22c55e' },
  { key: 'orange', label: '橙色',   value: '#f97316' },
  { key: 'rose',   label: '玫瑰红', value: '#f43f5e' },
]
const currentColorLabel = computed(
  () => themeColors.find(c => c.key === activeColor.value)?.label || '科技蓝'
)

const layoutOptions = [
  { key: 'default', icon: '◧', label: '默认', desc: '左侧固定侧边栏' },
  { key: 'compact', icon: '▣',  label: '紧凑', desc: '折叠式图标栏' },
  { key: 'top',     icon: '⬛', label: '顶部导航', desc: '水平顶栏布局' },
]

function applyDarkMode(val: boolean) {
  document.documentElement.classList.toggle('dark', val)
  localStorage.setItem('theme', val ? 'dark' : 'light')
}
function applyThemeColor(c: typeof themeColors[0]) {
  activeColor.value = c.key
  document.documentElement.style.setProperty('--color-primary', c.value)
  localStorage.setItem('themeColor', c.key)
  MessagePlugin.success(`主题颜色已切换为「${c.label}」`)
}
function applyLayout(key: string) {
  activeLayout.value = key
  localStorage.setItem('sidebarLayout', key)
}
function applyFontSize(val: string | number | boolean) {
  const size = val as string
  const map: Record<string, string> = { sm: '13px', md: '14px', lg: '16px' }
  document.documentElement.style.fontSize = map[size] || '14px'
  localStorage.setItem('fontSize', size)
}
function saveAppearance() {
  applyDarkMode(isDark.value)
  applyFontSize(fontSize.value)
  MessagePlugin.success('外观设置已保存')
}

onMounted(() => {
  // 恢复已保存的外观
  applyDarkMode(isDark.value)
  const savedColor = themeColors.find(c => c.key === activeColor.value)
  if (savedColor) document.documentElement.style.setProperty('--color-primary', savedColor.value)
  applyFontSize(fontSize.value)
})

// ─────────────────── ② 第三方账号绑定 ──────────────────────────
const thirdPartyList = [
  { key: 'github',  label: 'GitHub',  icon: '🐙', bgClass: 'bg-gray-100' },
  { key: 'wechat',  label: '微信',     icon: '💬', bgClass: 'bg-green-100' },
  { key: 'qq',      label: 'QQ',       icon: '🐧', bgClass: 'bg-blue-100' },
  { key: 'feishu',  label: '飞书',     icon: '🪐', bgClass: 'bg-indigo-100' },
]

// 从 localStorage 还原绑定状态
const bindingStatus = reactive<Record<string, string>>(
  JSON.parse(localStorage.getItem('thirdPartyBindings') || '{}')
)
const bindDialogVisible = ref(false)
const currentProvider = ref<typeof thirdPartyList[0] | null>(null)
const bindInput = ref('')

function bindAccount(provider: typeof thirdPartyList[0]) {
  currentProvider.value = provider
  bindInput.value = ''
  bindDialogVisible.value = true
}
function confirmBind() {
  if (!bindInput.value.trim()) {
    MessagePlugin.warning('请输入账号标识')
    return
  }
  if (currentProvider.value) {
    bindingStatus[currentProvider.value.key] = bindInput.value.trim()
    localStorage.setItem('thirdPartyBindings', JSON.stringify(bindingStatus))
    MessagePlugin.success(`${currentProvider.value.label} 账号绑定成功`)
    bindDialogVisible.value = false
  }
}
function unbindAccount(provider: typeof thirdPartyList[0]) {
  delete bindingStatus[provider.key]
  localStorage.setItem('thirdPartyBindings', JSON.stringify(bindingStatus))
  MessagePlugin.success(`${provider.label} 账号已解绑`)
}

// ─────────────────── ③ 语音交互 ────────────────────────────────
const voiceEnabled = ref(localStorage.getItem('voiceEnabled') === 'true')
const isRecording = ref(false)
const transcriptText = ref('')
const voiceStatus = ref('')
const waveHeights = ref<number[]>(Array(12).fill(4))
let mediaRecorder: MediaRecorder | null = null
let audioChunks: BlobPart[] = []
let waveTimer: ReturnType<typeof setInterval> | null = null

function onVoiceToggle(val: boolean) {
  localStorage.setItem('voiceEnabled', String(val))
  MessagePlugin.success(val ? '语音交互已启用' : '语音交互已关闭')
}

async function startRecording() {
  if (isRecording.value) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioChunks = []
    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data) }
    mediaRecorder.onstop = handleRecordingStop
    mediaRecorder.start()
    isRecording.value = true
    voiceStatus.value = '正在录音...'
    // 模拟波形动画
    waveTimer = setInterval(() => {
      waveHeights.value = Array(12).fill(0).map(() => Math.random() * 24 + 4)
    }, 120)
  } catch {
    MessagePlugin.error('无法访问麦克风，请检查浏览器权限')
  }
}

function stopRecording() {
  if (!isRecording.value || !mediaRecorder) return
  mediaRecorder.stop()
  mediaRecorder.stream.getTracks().forEach(t => t.stop())
  isRecording.value = false
  if (waveTimer) { clearInterval(waveTimer); waveTimer = null }
  waveHeights.value = Array(12).fill(4)
  voiceStatus.value = '正在上传转录...'
}

async function handleRecordingStop() {
  const blob = new Blob(audioChunks, { type: 'audio/webm' })
  const formData = new FormData()
  formData.append('file', blob, 'recording.webm')
  try {
    const jwt = localStorage.getItem('jwt') || ''
    const res = await axios.post('/api/voice/transcribe', formData, {
      headers: { Authorization: `Bearer ${jwt}` }
    })
    transcriptText.value = res.data?.text || ''
    voiceStatus.value = '转录完成'
  } catch {
    // 后端离线时降级到浏览器 Web Speech API
    voiceStatus.value = '后端转录失败，尝试浏览器识别...'
    useBrowserSpeech()
  }
}

function useBrowserSpeech() {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SpeechRecognition) {
    voiceStatus.value = '当前浏览器不支持语音识别'
    return
  }
  const recognition = new SpeechRecognition()
  recognition.lang = 'zh-CN'
  recognition.onresult = (e: any) => {
    transcriptText.value = e.results[0][0].transcript
    voiceStatus.value = '识别完成（浏览器）'
  }
  recognition.onerror = () => { voiceStatus.value = '语音识别失败' }
  recognition.start()
}

function sendTranscript() {
  if (transcriptText.value) {
    router.push({ path: '/chat', query: { prefill: transcriptText.value } })
  }
}

onUnmounted(() => {
  if (waveTimer) clearInterval(waveTimer)
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.stop()
    mediaRecorder.stream.getTracks().forEach(t => t.stop())
  }
})

// ─────────────────── ④ 反馈与建议 ─────────────────────────────
const feedbackLoading = ref(false)
const feedbackSent = ref(false)
const feedback = reactive({
  type: 'feature',
  title: '',
  content: '',
  email: ''
})

function resetFeedback() {
  feedback.type = 'feature'
  feedback.title = ''
  feedback.content = ''
  feedback.email = ''
  feedbackSent.value = false
}

async function submitFeedback() {
  if (!feedback.title.trim()) { MessagePlugin.warning('请填写反馈标题'); return }
  if (!feedback.content.trim()) { MessagePlugin.warning('请填写详细描述'); return }

  feedbackLoading.value = true
  try {
    const jwt = localStorage.getItem('jwt') || ''
    await axios.post('/api/feedback/submit', {
      type: feedback.type,
      title: feedback.title,
      content: feedback.content,
      email: feedback.email,
      to: '13425121993@163.com'
    }, {
      headers: { Authorization: `Bearer ${jwt}` }
    })
    feedbackSent.value = true
    MessagePlugin.success('反馈提交成功！')
    resetFeedback()
  } catch {
    // 后端离线时用 mailto 兜底
    const subject = encodeURIComponent(`[RAG-F 反馈][${feedback.type}] ${feedback.title}`)
    const body = encodeURIComponent(
      `反馈类型：${feedback.type}\n标题：${feedback.title}\n\n详情：\n${feedback.content}\n\n联系邮箱：${feedback.email}`
    )
    window.location.href = `mailto:13425121993@163.com?subject=${subject}&body=${body}`
    feedbackSent.value = true
    MessagePlugin.success('已打开邮件客户端，请手动发送')
  } finally {
    feedbackLoading.value = false
  }
}
</script>
