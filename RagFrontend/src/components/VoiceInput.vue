<template>
  <!-- 语音录制 + 转录 + 可选的语音问答 -->
  <div class="voice-input" :class="{ 'voice-input--recording': isRecording }">
    <!-- 麦克风按钮 -->
    <button
      class="voice-btn"
      :class="{
        'voice-btn--recording': isRecording,
        'voice-btn--processing': isProcessing,
        'voice-btn--ready': !isRecording && !isProcessing
      }"
      :title="btnTitle"
      :disabled="isProcessing || !supported"
      @click="toggle"
    >
      <!-- 录制中：停止图标 + 波纹动画 -->
      <span v-if="isRecording" class="voice-wave">
        <span
          v-for="i in 4"
          :key="i"
          class="voice-wave__bar"
          :style="{ animationDelay: `${i * 0.1}s` }"
        ></span>
      </span>
      <!-- 处理中：转圈 -->
      <svg v-else-if="isProcessing" class="voice-spinner" viewBox="0 0 24 24">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-dasharray="28 56"
        />
      </svg>
      <!-- 待机：麦克风图标 -->
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path stroke-linecap="round" d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
      </svg>
    </button>

    <!-- 录制时间显示 -->
    <span v-if="isRecording" class="voice-timer">{{ formatTime(elapsed) }}</span>

    <!-- 转录结果 -->
    <div v-if="transcript" class="voice-transcript" @click="copyTranscript">
      <span class="voice-transcript__text">{{ transcript }}</span>
      <span class="voice-transcript__hint">点击复制</span>
    </div>

    <!-- 不支持提示 -->
    <span v-if="!supported" class="voice-unsupported">浏览器不支持录音</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

const props = withDefaults(
  defineProps<{
    kbId?: string // 知识库 ID（传入则触发 voice/ask，否则只转录）
    language?: string // 语音语言，默认 zh
    autoSend?: boolean // 转录完成后是否自动填入并发送
  }>(),
  {
    language: 'zh',
    autoSend: false
  }
)

const emit = defineEmits<{
  (e: 'transcribed', text: string): void // 转录完成
  (e: 'answer', chunks: string): void // 语音问答回答（流式）
  (e: 'error', msg: string): void
}>()

// ── 状态 ─────────────────────────────────────────────────────────
const isRecording = ref(false)
const isProcessing = ref(false)
const transcript = ref('')
const elapsed = ref(0)
const supported = ref(typeof MediaRecorder !== 'undefined')

let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []
let timerInterval: number | null = null
let startTime = 0

// ── 计算属性 ─────────────────────────────────────────────────────
const btnTitle = computed(() => {
  if (!supported.value) return '浏览器不支持录音'
  if (isProcessing.value) return '识别中...'
  if (isRecording.value) return '点击停止录制'
  return '点击开始语音输入'
})

// ── 核心逻辑 ─────────────────────────────────────────────────────
async function toggle() {
  if (isRecording.value) {
    stopRecording()
  } else {
    await startRecording()
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioChunks = []
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data)
    }

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      await processAudio()
    }

    mediaRecorder.start(200) // 每 200ms 收集一段
    isRecording.value = true
    transcript.value = ''
    startTime = Date.now()
    elapsed.value = 0
    timerInterval = window.setInterval(() => {
      elapsed.value = Math.floor((Date.now() - startTime) / 1000)
    }, 1000)
  } catch (err: any) {
    emit('error', `无法访问麦克风: ${err.message}`)
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording.value) {
    mediaRecorder.stop()
    isRecording.value = false
    if (timerInterval !== null) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }
}

async function processAudio() {
  if (audioChunks.length === 0) return
  isProcessing.value = true

  try {
    const blob = new Blob(audioChunks, { type: 'audio/webm' })
    const formData = new FormData()
    formData.append('file', blob, 'recording.webm')
    formData.append('language', props.language)

    if (props.kbId) {
      // 语音问答模式（SSE 流式）
      formData.append('kb_id', props.kbId)
      await streamVoiceAsk(formData)
    } else {
      // 纯转录模式
      const res = await fetch('/api/voice/transcribe', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        transcript.value = data.text
        emit('transcribed', data.text)
      } else {
        emit('error', data.detail || '转录失败')
      }
    }
  } catch (err: any) {
    emit('error', `处理失败: ${err.message}`)
  } finally {
    isProcessing.value = false
    audioChunks = []
  }
}

async function streamVoiceAsk(formData: FormData) {
  const res = await fetch('/api/voice/ask', { method: 'POST', body: formData })
  if (!res.body) return

  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    const lines = text.split('\n')
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') break
      try {
        const evt = JSON.parse(raw)
        if (evt.type === 'transcription') {
          transcript.value = evt.text
          emit('transcribed', evt.text)
        } else if (evt.type === 'chunk') {
          emit('answer', evt.content || evt.text || '')
        }
      } catch {
        /* skip */
      }
    }
  }
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

async function copyTranscript() {
  if (!transcript.value) return
  try {
    await navigator.clipboard.writeText(transcript.value)
  } catch {
    /* ignore */
  }
}

onUnmounted(() => {
  if (isRecording.value) stopRecording()
  if (timerInterval !== null) clearInterval(timerInterval)
})
</script>

<style scoped>
.voice-input {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* 麦克风按钮 */
.voice-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background 0.2s,
    transform 0.15s,
    box-shadow 0.2s;
  flex-shrink: 0;
}
.voice-btn svg {
  width: 18px;
  height: 18px;
}

.voice-btn--ready {
  background: #f3f4f6;
  color: #6b7280;
}
.voice-btn--ready:hover {
  background: #e0e7ff;
  color: #4f7ef8;
  transform: scale(1.08);
}

.voice-btn--recording {
  background: #fee2e2;
  color: #ef4444;
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15);
  animation: pulse-mic 1.2s ease-in-out infinite;
}
@keyframes pulse-mic {
  0%,
  100% {
    box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.05);
  }
}

.voice-btn--processing {
  background: #eff6ff;
  color: #3b82f6;
  cursor: not-allowed;
}
.voice-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 波纹动画 */
.voice-wave {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 18px;
}
.voice-wave__bar {
  width: 3px;
  background: currentColor;
  border-radius: 2px;
  animation: wave-bar 0.8s ease-in-out infinite;
}
.voice-wave__bar:nth-child(1) {
  height: 8px;
}
.voice-wave__bar:nth-child(2) {
  height: 14px;
}
.voice-wave__bar:nth-child(3) {
  height: 10px;
}
.voice-wave__bar:nth-child(4) {
  height: 6px;
}
@keyframes wave-bar {
  0%,
  100% {
    transform: scaleY(0.6);
  }
  50% {
    transform: scaleY(1.3);
  }
}

/* 转圈 */
.voice-spinner {
  width: 18px;
  height: 18px;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 计时器 */
.voice-timer {
  font-size: 12px;
  color: #ef4444;
  font-variant-numeric: tabular-nums;
  min-width: 36px;
}

/* 转录结果 */
.voice-transcript {
  max-width: 280px;
  padding: 6px 10px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  font-size: 13px;
  color: #0369a1;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}
.voice-transcript__text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.voice-transcript__hint {
  position: absolute;
  bottom: 2px;
  right: 6px;
  font-size: 10px;
  color: #94a3b8;
}

.voice-unsupported {
  font-size: 12px;
  color: #9ca3af;
}
</style>
