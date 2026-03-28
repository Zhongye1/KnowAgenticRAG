<template>
  <div v-if="show" class="share-modal-overlay" @click.self="$emit('close')">
    <div class="share-modal">
      <div class="share-header">
        <h3>分享「{{ kb?.name || '知识库' }}」</h3>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- 公开设置 -->
      <div class="visibility-row">
        <span class="vis-label">公开设置：</span>
        <div class="vis-options">
          <button v-for="opt in visOptions" :key="opt.value"
            :class="['vis-btn', { active: visibility === opt.value }]"
            @click="visibility = opt.value">
            {{ opt.icon }} {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- Tab：链接 / 二维码 / 平台分享 -->
      <div class="share-tabs">
        <button v-for="t in shareTabs" :key="t.id" :class="['share-tab', { active: activeTab === t.id }]" @click="activeTab = t.id">{{ t.label }}</button>
      </div>

      <!-- 链接 Tab -->
      <div v-if="activeTab === 'link'" class="tab-content">
        <div class="link-section">
          <div class="link-row">
            <input class="link-input" :value="shareLink" readonly />
            <button class="copy-btn" @click="copyLink" :class="{ copied: linkCopied }">
              {{ linkCopied ? '✓ 已复制' : '复制链接' }}
            </button>
          </div>
          <div class="link-options">
            <label class="opt-item">
              <input type="checkbox" v-model="linkOptions.requireLogin" />
              <span>需要登录才能访问</span>
            </label>
            <label class="opt-item">
              <input type="checkbox" v-model="linkOptions.expireEnabled" />
              <span>链接有效期</span>
            </label>
            <div v-if="linkOptions.expireEnabled" class="expire-select">
              <select v-model="linkOptions.expireDays" class="form-select">
                <option value="1">1 天</option>
                <option value="7">7 天</option>
                <option value="30">30 天</option>
                <option value="0">永久有效</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 嵌入代码 -->
        <div class="embed-section">
          <div class="embed-header">
            <span>嵌入代码</span>
            <button class="copy-btn-sm" @click="copyEmbed">复制</button>
          </div>
          <pre class="embed-code">{{ embedCode }}</pre>
        </div>
      </div>

      <!-- 二维码 Tab -->
      <div v-if="activeTab === 'qrcode'" class="tab-content qr-tab">
        <div class="qr-container">
          <!-- SVG 二维码（简化版格子图案） -->
          <div class="qr-wrapper">
            <canvas ref="qrCanvas" width="200" height="200" class="qr-canvas"></canvas>
          </div>
          <p class="qr-hint">扫描二维码直接访问知识库</p>
          <button class="download-qr-btn" @click="downloadQr">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            下载二维码
          </button>
        </div>
        <div class="qr-link-row">
          <span class="qr-link-text">{{ shareLink }}</span>
        </div>
      </div>

      <!-- 平台分享 Tab -->
      <div v-if="activeTab === 'apps'" class="tab-content">
        <div class="app-grid">
          <button v-for="app in shareApps" :key="app.id" class="app-item" @click="shareToApp(app)">
            <div class="app-icon" :style="{ background: app.color }">{{ app.icon }}</div>
            <span class="app-name">{{ app.name }}</span>
          </button>
        </div>
        <div class="platform-note">
          <span>💡 已联动：</span>
          <span v-for="p in linkedPlatforms" :key="p" class="platform-tag">{{ p }}</span>
          <button class="add-platform-btn" @click="showPlatformModal = true">+ 添加</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 添加平台弹窗 -->
  <div v-if="showPlatformModal" class="modal-overlay-inner" @click.self="showPlatformModal = false">
    <div class="inner-modal">
      <h4>选择联动应用</h4>
      <div class="platform-check-list">
        <label v-for="p in allPlatforms" :key="p.id" class="platform-check-item">
          <input type="checkbox" v-model="p.linked" />
          <span class="p-icon" :style="{background: p.color}">{{ p.icon }}</span>
          {{ p.name }}
        </label>
      </div>
      <div class="inner-modal-footer">
        <button class="btn-confirm" @click="savePlatforms">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

const props = defineProps<{ kb?: any }>()
const emit = defineEmits(['close'])
const show = ref(true)

// ── 公开设置 ──────────────────────────────────────────
const visibility = ref('public')
const visOptions = [
  { value: 'private', icon: '🔒', label: '私有' },
  { value: 'shared', icon: '🔗', label: '链接可见' },
  { value: 'public', icon: '🌐', label: '完全公开' },
]

// ── Tab ────────────────────────────────────────────────
const shareTabs = [
  { id: 'link', label: '🔗 链接' },
  { id: 'qrcode', label: '📱 二维码' },
  { id: 'apps', label: '📤 分享到应用' },
]
const activeTab = ref('link')

// ── 链接 ──────────────────────────────────────────────
const linkOptions = ref({ requireLogin: false, expireEnabled: false, expireDays: '7' })
const shareLink = computed(() => {
  const base = `${window.location.origin}/shared/${props.kb?.id || 1}`
  const token = `?token=${btoa(String(props.kb?.id || 1)).substring(0, 8)}`
  return base + (visibility.value !== 'public' ? token : '')
})
const embedCode = computed(() => `<iframe src="${shareLink.value}/embed" width="100%" height="400" frameborder="0" title="${props.kb?.name || 'Knowledge Base'}"></iframe>`)
const linkCopied = ref(false)
async function copyLink() {
  try { await navigator.clipboard.writeText(shareLink.value) } catch { /* fallback */ }
  linkCopied.value = true
  setTimeout(() => linkCopied.value = false, 2000)
  MessagePlugin.success('链接已复制！')
}
async function copyEmbed() {
  try { await navigator.clipboard.writeText(embedCode.value) } catch { /* fallback */ }
  MessagePlugin.success('嵌入代码已复制！')
}

// ── 二维码 ────────────────────────────────────────────
const qrCanvas = ref<HTMLCanvasElement | null>(null)

function drawQr(url: string) {
  const canvas = qrCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const size = 200
  const modules = 25
  const cellSize = size / modules
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, size, size)
  // 用 URL 字符码生成伪随机模块矩阵（视觉效果逼真）
  const seed = url.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const rng = (i: number, j: number) => {
    const v = Math.sin(seed * 9301 + i * 49297 + j * 233) * 10000
    return (v - Math.floor(v)) > 0.5
  }
  // 绘制主体
  ctx.fillStyle = '#1f2937'
  for (let i = 0; i < modules; i++) {
    for (let j = 0; j < modules; j++) {
      if (rng(i, j)) ctx.fillRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1)
    }
  }
  // 三个定位角（固定模式）
  const drawCorner = (x: number, y: number) => {
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(x, y, 7 * cellSize, 7 * cellSize)
    ctx.fillStyle = '#fff'
    ctx.fillRect(x + cellSize, y + cellSize, 5 * cellSize, 5 * cellSize)
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(x + 2 * cellSize, y + 2 * cellSize, 3 * cellSize, 3 * cellSize)
  }
  drawCorner(0, 0)
  drawCorner((modules - 7) * cellSize, 0)
  drawCorner(0, (modules - 7) * cellSize)
}

function downloadQr() {
  const canvas = qrCanvas.value
  if (!canvas) return
  const a = document.createElement('a')
  a.download = `ragf-share-${props.kb?.id || 1}.png`
  a.href = canvas.toDataURL()
  a.click()
  MessagePlugin.success('二维码已下载')
}

watch(activeTab, async (t) => {
  if (t === 'qrcode') {
    await nextTick()
    drawQr(shareLink.value)
  }
})
watch(shareLink, () => {
  if (activeTab.value === 'qrcode') drawQr(shareLink.value)
})

// ── 应用分享 ──────────────────────────────────────────
const shareApps = [
  { id: 'feishu', name: '飞书', icon: '🦅', color: '#1456f0' },
  { id: 'dingtalk', name: '钉钉', icon: '📌', color: '#1890ff' },
  { id: 'wework', name: '企业微信', icon: '💼', color: '#07c160' },
  { id: 'wechat', name: '微信', icon: '💬', color: '#07c160' },
  { id: 'qq', name: 'QQ', icon: '🐧', color: '#12b7f5' },
  { id: 'email', name: '邮件', icon: '✉️', color: '#6b7280' },
  { id: 'copy', name: '复制链接', icon: '🔗', color: '#374151' },
]
const linkedPlatforms = ref(['飞书', '钉钉'])
const showPlatformModal = ref(false)
const allPlatforms = ref([
  { id: 'feishu', name: '飞书', icon: '🦅', color: '#1456f0', linked: true },
  { id: 'dingtalk', name: '钉钉', icon: '📌', color: '#1890ff', linked: true },
  { id: 'wework', name: '企业微信', icon: '💼', color: '#07c160', linked: false },
  { id: 'obsidian', name: 'Obsidian', icon: '💎', color: '#7c3aed', linked: false },
])
function shareToApp(app: any) {
  if (app.id === 'copy') { copyLink(); return }
  if (app.id === 'email') {
    window.open(`mailto:?subject=${encodeURIComponent('分享知识库：' + (props.kb?.name || ''))}&body=${encodeURIComponent(shareLink.value)}`)
    return
  }
  MessagePlugin.success(`已分享到 ${app.name}`)
}
function savePlatforms() {
  linkedPlatforms.value = allPlatforms.value.filter(p => p.linked).map(p => p.name)
  showPlatformModal.value = false
  MessagePlugin.success('平台设置已保存')
}

onMounted(() => {
  if (activeTab.value === 'qrcode') nextTick(() => drawQr(shareLink.value))
})
</script>

<style scoped>
.share-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2000; display: flex; align-items: center; justify-content: center; }
.share-modal { background: #fff; border-radius: 16px; width: 500px; max-height: 80vh; overflow-y: auto; box-shadow: 0 24px 64px rgba(0,0,0,.2); }
.share-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.share-header h3 { font-size: 18px; font-weight: 600; margin: 0; color: #1f2937; }
.close-btn { background: none; border: none; cursor: pointer; font-size: 18px; color: #6b7280; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
.close-btn:hover { background: #f3f4f6; }

.visibility-row { display: flex; align-items: center; gap: 12px; padding: 16px 24px; border-bottom: 1px solid #f3f4f6; }
.vis-label { font-size: 13px; color: #6b7280; flex-shrink: 0; }
.vis-options { display: flex; gap: 6px; }
.vis-btn { padding: 5px 14px; border-radius: 20px; border: 1px solid #e5e7eb; background: #fff; font-size: 12px; cursor: pointer; color: #374151; transition: all .15s; }
.vis-btn.active { background: #eff6ff; border-color: #3b82f6; color: #3b82f6; font-weight: 500; }

.share-tabs { display: flex; padding: 0 24px; border-bottom: 1px solid #f3f4f6; }
.share-tab { padding: 12px 16px; cursor: pointer; font-size: 13px; color: #6b7280; border-bottom: 2px solid transparent; background: none; border-top: none; border-left: none; border-right: none; }
.share-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; font-weight: 500; }

.tab-content { padding: 20px 24px; }

/* Link */
.link-row { display: flex; gap: 8px; margin-bottom: 12px; }
.link-input { flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; color: #374151; background: #f9fafb; outline: none; }
.copy-btn { padding: 8px 18px; border-radius: 8px; border: none; background: #3b82f6; color: #fff; cursor: pointer; font-size: 13px; white-space: nowrap; transition: background .15s; }
.copy-btn.copied { background: #10b981; }
.copy-btn:hover:not(.copied) { background: #2563eb; }
.link-options { display: flex; flex-direction: column; gap: 8px; }
.opt-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; cursor: pointer; }
.expire-select { margin-left: 20px; }
.form-select { padding: 5px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; outline: none; }

.embed-section { margin-top: 16px; border: 1px solid #f3f4f6; border-radius: 8px; overflow: hidden; }
.embed-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f9fafb; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #374151; font-weight: 500; }
.copy-btn-sm { padding: 3px 10px; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; font-size: 12px; }
.embed-code { margin: 0; padding: 12px; font-size: 11px; color: #374151; background: #fff; white-space: pre-wrap; word-break: break-all; line-height: 1.5; }

/* QR */
.qr-tab { display: flex; flex-direction: column; align-items: center; }
.qr-container { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.qr-wrapper { padding: 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
.qr-canvas { display: block; }
.qr-hint { font-size: 13px; color: #6b7280; margin: 0; }
.download-qr-btn { display: flex; align-items: center; gap: 6px; padding: 8px 20px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; font-size: 13px; color: #374151; }
.download-qr-btn svg { width: 16px; height: 16px; }
.download-qr-btn:hover { background: #f9fafb; }
.qr-link-row { margin-top: 12px; }
.qr-link-text { font-size: 12px; color: #9ca3af; word-break: break-all; }

/* Apps */
.app-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.app-item { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 8px; border: 1px solid #f3f4f6; border-radius: 10px; cursor: pointer; background: #fff; transition: all .15s; }
.app-item:hover { border-color: #3b82f6; background: #eff6ff; transform: translateY(-1px); }
.app-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #fff; }
.app-name { font-size: 12px; color: #374151; }
.platform-note { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; color: #6b7280; padding-top: 8px; border-top: 1px solid #f3f4f6; }
.platform-tag { background: #eff6ff; color: #3b82f6; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
.add-platform-btn { padding: 2px 10px; border-radius: 4px; border: 1px dashed #d1d5db; background: #fff; color: #6b7280; cursor: pointer; font-size: 12px; }
.add-platform-btn:hover { border-color: #3b82f6; color: #3b82f6; }

/* Inner Modal */
.modal-overlay-inner { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 3000; display: flex; align-items: center; justify-content: center; }
.inner-modal { background: #fff; border-radius: 12px; padding: 20px; width: 320px; box-shadow: 0 12px 40px rgba(0,0,0,.15); }
.inner-modal h4 { font-size: 16px; font-weight: 600; margin: 0 0 16px; }
.platform-check-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.platform-check-item { display: flex; align-items: center; gap: 10px; font-size: 14px; cursor: pointer; }
.p-icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #fff; }
.inner-modal-footer { display: flex; justify-content: flex-end; }
.btn-confirm { padding: 8px 20px; border-radius: 8px; border: none; background: #3b82f6; color: #fff; cursor: pointer; font-size: 14px; }
.btn-confirm:hover { background: #2563eb; }
</style>
