<template>
  <div class="tab-content">
    <div class="section-header">
      <h2>OCR 智能解析</h2>
      <p class="section-desc">为图片、扫描版PDF等文档开启光学字符识别，自动提取文字内容后向量化</p>
    </div>

    <!-- 配置卡 -->
    <div class="card">
      <div class="card-title">引擎配置</div>
      <div class="form-row">
        <label>OCR 引擎</label>
        <select v-model="config.engine" class="form-select">
          <option value="tesseract">Tesseract（本地，免费）</option>
          <option value="paddleocr">PaddleOCR（本地，精度高）</option>
          <option value="baidu">百度云 OCR（高精度，收费）</option>
          <option value="aliyun">阿里云 OCR（高精度，收费）</option>
        </select>
      </div>
      <div class="form-row">
        <label>识别语言</label>
        <div class="checkbox-group">
          <label v-for="lang in langOptions" :key="lang.value" class="checkbox-item">
            <input type="checkbox" :value="lang.value" v-model="config.languages" />
            {{ lang.label }}
          </label>
        </div>
      </div>
      <div class="form-row" v-if="config.engine === 'baidu'">
        <label>百度 API Key</label>
        <input v-model="config.baidu_api_key" class="form-input" placeholder="your_api_key" />
      </div>
      <div class="form-row" v-if="config.engine === 'baidu'">
        <label>百度 Secret Key</label>
        <input v-model="config.baidu_secret_key" type="password" class="form-input" />
      </div>
      <div class="form-row" v-if="config.engine === 'aliyun'">
        <label>阿里云 AccessKeyId</label>
        <input v-model="config.aliyun_ak_id" class="form-input" />
      </div>
      <div class="form-row" v-if="config.engine === 'aliyun'">
        <label>阿里云 AccessKeySecret</label>
        <input v-model="config.aliyun_ak_secret" type="password" class="form-input" />
      </div>
      <div class="form-row">
        <label>自动预处理</label>
        <div class="toggle-row">
          <label class="toggle-item">
            <input type="checkbox" v-model="config.deskew" />
            <span>自动纠偏（去除倾斜）</span>
          </label>
          <label class="toggle-item">
            <input type="checkbox" v-model="config.denoise" />
            <span>降噪处理</span>
          </label>
          <label class="toggle-item">
            <input type="checkbox" v-model="config.enhance_contrast" />
            <span>增强对比度</span>
          </label>
        </div>
      </div>
      <div class="form-row">
        <label>置信度阈值</label>
        <div class="slider-row">
          <input type="range" min="0" max="100" v-model.number="config.confidence" class="slider" />
          <span class="slider-val">{{ config.confidence }}%</span>
        </div>
      </div>
      <button class="btn-primary" @click="saveConfig" :disabled="saving">
        {{ saving ? '保存中...' : '保存配置' }}
      </button>
    </div>

    <!-- 测试区 -->
    <div class="card" style="margin-top: 16px;">
      <div class="card-title">在线测试</div>
      <div class="upload-area" @dragover.prevent @drop="handleDrop" @click="fileInput?.click()">
        <div class="upload-icon">📄</div>
        <p>拖拽图片 / 扫描 PDF 到此处，或点击选择文件</p>
        <p class="upload-hint">支持 JPG、PNG、PDF，最大 20MB</p>
        <input ref="fileInput" type="file" accept="image/*,.pdf" @change="handleFile" style="display:none" />
      </div>
      <div v-if="testLoading" class="ocr-loading">
        <div class="spinner"></div>
        <span>识别中，请稍候...</span>
      </div>
      <div v-if="testResult" class="ocr-result">
        <div class="ocr-result-header">
          <span>识别结果 <span class="conf-badge">置信度 {{ testResult.confidence }}%</span></span>
          <button class="btn-sm" @click="copyResult">复制</button>
        </div>
        <textarea class="ocr-text" v-model="testResult.text" rows="8"></textarea>
        <div class="ocr-meta">
          识别字数：{{ testResult.char_count }} · 耗时：{{ testResult.duration_ms }}ms
        </div>
      </div>
    </div>

    <!-- 历史记录 -->
    <div class="card" style="margin-top: 16px;">
      <div class="card-title">最近识别记录</div>
      <div class="history-list">
        <div v-for="item in history" :key="item.id" class="history-item">
          <div class="history-icon">{{ item.type === 'pdf' ? '📄' : '🖼️' }}</div>
          <div class="history-info">
            <div class="history-name">{{ item.filename }}</div>
            <div class="history-meta">{{ item.char_count }} 字 · {{ formatTime(item.created_at) }}</div>
          </div>
          <span :class="['badge', item.status === 'success' ? 'badge--ok' : 'badge--err']">
            {{ item.status === 'success' ? '成功' : '失败' }}
          </span>
        </div>
        <div v-if="history.length === 0" class="empty-hint">暂无识别记录</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import axios from 'axios'

const saving = ref(false)
const testLoading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const testResult = ref<any>(null)
const history = ref<any[]>([
  { id: 1, filename: 'scan_report.pdf', type: 'pdf', char_count: 1842, status: 'success', created_at: Date.now() / 1000 - 3600 },
  { id: 2, filename: 'invoice_2024.jpg', type: 'image', char_count: 326, status: 'success', created_at: Date.now() / 1000 - 7200 },
  { id: 3, filename: 'blurry_page.png', type: 'image', char_count: 0, status: 'failed', created_at: Date.now() / 1000 - 10800 },
])

const config = reactive({
  engine: 'paddleocr',
  languages: ['chi_sim', 'eng'],
  baidu_api_key: '',
  baidu_secret_key: '',
  aliyun_ak_id: '',
  aliyun_ak_secret: '',
  deskew: true,
  denoise: true,
  enhance_contrast: false,
  confidence: 70,
})

const langOptions = [
  { value: 'chi_sim', label: '简体中文' },
  { value: 'chi_tra', label: '繁体中文' },
  { value: 'eng', label: '英文' },
  { value: 'jpn', label: '日文' },
  { value: 'kor', label: '韩文' },
]

async function saveConfig() {
  saving.value = true
  try {
    await axios.post('/api/ocr/configure', config)
    MessagePlugin.success('OCR 配置已保存')
  } catch {
    MessagePlugin.warning('后端未就绪，配置已暂存本地')
    localStorage.setItem('ocrConfig', JSON.stringify(config))
  } finally { saving.value = false }
}

function handleDrop(e: DragEvent) {
  const file = e.dataTransfer?.files[0]
  if (file) processFile(file)
}
function handleFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) processFile(file)
}

async function processFile(file: File) {
  testLoading.value = true
  testResult.value = null
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('engine', config.engine)
    const res = await axios.post('/api/ocr/parse', fd)
    testResult.value = res.data
  } catch {
    // Mock result for demo
    testResult.value = {
      text: `[演示模式] 已识别文件：${file.name}\n\n这里将显示 OCR 识别出的文字内容。\n当后端 /api/ocr/parse 接口就绪后将展示真实结果。`,
      confidence: 92,
      char_count: 68,
      duration_ms: 1240,
    }
  } finally { testLoading.value = false }
}

function copyResult() {
  if (testResult.value) {
    navigator.clipboard.writeText(testResult.value.text)
    MessagePlugin.success('已复制识别结果')
  }
}
function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
}

onMounted(() => {
  const saved = localStorage.getItem('ocrConfig')
  if (saved) Object.assign(config, JSON.parse(saved))
})
</script>

<style scoped>
.tab-content { max-width: 860px; }
.section-header { margin-bottom: 20px; }
.section-header h2 { font-size: 18px; color: #111827; margin: 0 0 4px; }
.section-desc { font-size: 13px; color: #9ca3af; margin: 0; }

.card {
  background: white; border-radius: 12px; padding: 20px 24px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.card-title { font-size: 15px; font-weight: 600; color: #374151; margin-bottom: 16px; }
.form-row { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
.form-row > label { width: 130px; flex-shrink: 0; font-size: 13px; color: #374151; padding-top: 7px; }
.form-input, .form-select {
  flex: 1; padding: 8px 10px; border: 1px solid #d1d5db;
  border-radius: 7px; font-size: 13px; outline: none;
}
.form-input:focus, .form-select:focus { border-color: #4f7ef8; }
.checkbox-group { display: flex; flex-wrap: wrap; gap: 10px; }
.checkbox-item { display: flex; align-items: center; gap: 5px; font-size: 13px; cursor: pointer; }
.toggle-row { display: flex; flex-wrap: wrap; gap: 16px; }
.toggle-item { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
.slider-row { display: flex; align-items: center; gap: 12px; flex: 1; }
.slider { flex: 1; }
.slider-val { font-weight: 600; color: #4f7ef8; width: 36px; }
.btn-primary {
  margin-top: 6px; padding: 8px 20px; border: none; border-radius: 7px;
  background: #4f7ef8; color: white; cursor: pointer; font-size: 13px; font-weight: 500;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.upload-area {
  border: 2px dashed #e5e7eb; border-radius: 10px; padding: 36px;
  text-align: center; cursor: pointer; transition: border-color 0.2s;
}
.upload-area:hover { border-color: #4f7ef8; }
.upload-icon { font-size: 36px; margin-bottom: 8px; }
.upload-area p { margin: 4px 0; font-size: 14px; color: #374151; }
.upload-hint { font-size: 12px; color: #9ca3af !important; }

.ocr-loading { display: flex; align-items: center; gap: 10px; margin-top: 14px; color: #6b7280; }
.spinner {
  width: 18px; height: 18px; border: 2px solid #e5e7eb;
  border-top-color: #4f7ef8; border-radius: 50%; animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.ocr-result { margin-top: 14px; }
.ocr-result-header {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px;
}
.conf-badge {
  display: inline-block; padding: 1px 7px; background: #dcfce7; color: #15803d;
  border-radius: 10px; font-size: 11px; font-weight: 600; margin-left: 8px;
}
.ocr-text {
  width: 100%; padding: 10px; border: 1px solid #e5e7eb; border-radius: 7px;
  font-size: 13px; resize: vertical; box-sizing: border-box;
}
.ocr-meta { font-size: 12px; color: #9ca3af; margin-top: 6px; }
.btn-sm {
  padding: 3px 10px; border: 1px solid #d1d5db; border-radius: 5px;
  background: white; font-size: 12px; cursor: pointer;
}

.history-list { display: flex; flex-direction: column; gap: 8px; }
.history-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; background: #f9fafb; border-radius: 8px;
}
.history-icon { font-size: 20px; }
.history-info { flex: 1; }
.history-name { font-size: 13px; font-weight: 500; color: #111827; }
.history-meta { font-size: 12px; color: #9ca3af; }
.badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.badge--ok { background: #dcfce7; color: #15803d; }
.badge--err { background: #fee2e2; color: #dc2626; }
.empty-hint { text-align: center; color: #9ca3af; font-size: 13px; padding: 20px; }
</style>
