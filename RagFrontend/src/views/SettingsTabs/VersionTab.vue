<template>
  <div class="tab-content">
    <div class="section-header">
      <h2>文档版本管理</h2>
      <p class="section-desc">追踪知识库中每个文档的修改历史，支持版本对比、回滚与快照</p>
    </div>

    <!-- 搜索/筛选 -->
    <div class="toolbar">
      <input v-model="searchKw" class="search-input" placeholder="搜索文档名..." />
      <select v-model="filterKb" class="filter-select">
        <option value="">全部知识库</option>
        <option v-for="kb in kbs" :key="kb.id" :value="kb.id">{{ kb.name }}</option>
      </select>
      <button class="btn-refresh" @click="fetchDocVersions">刷新</button>
    </div>

    <!-- 文档列表 -->
    <div v-if="loading" class="skeleton-list">
      <div v-for="i in 4" :key="i" class="skeleton-item"></div>
    </div>
    <div v-else class="doc-list">
      <div v-if="filteredDocs.length === 0" class="empty-state">
        <div class="empty-icon">📚</div>
        <p>暂无版本记录</p>
      </div>
      <div v-for="doc in filteredDocs" :key="doc.id" class="doc-row"
        :class="{ 'doc-row--active': selectedDoc?.id === doc.id }"
        @click="selectDoc(doc)">
        <div class="doc-icon">{{ getDocIcon(doc.type) }}</div>
        <div class="doc-info">
          <div class="doc-name">{{ doc.name }}</div>
          <div class="doc-meta">
            {{ doc.kb_name }} · v{{ doc.version_count }} 个版本 · 最后更新 {{ formatDate(doc.updated_at) }}
          </div>
        </div>
        <div class="doc-tags">
          <span v-if="doc.has_snapshot" class="tag tag--snap">📸 快照</span>
          <span class="version-count">v{{ doc.version_count }}</span>
        </div>
      </div>
    </div>

    <!-- 版本时间线 -->
    <div v-if="selectedDoc" class="version-panel">
      <div class="version-panel-header">
        <span>📋 {{ selectedDoc.name }} 版本历史</span>
        <button class="btn-snapshot" @click="createSnapshot">📸 创建快照</button>
      </div>
      <div class="timeline">
        <div v-for="(ver, idx) in versions" :key="ver.id" class="timeline-item">
          <div class="timeline-dot" :class="{ 'dot--current': idx === 0 }"></div>
          <div class="timeline-card">
            <div class="ver-header">
              <span class="ver-badge">v{{ ver.version }}</span>
              <span v-if="idx === 0" class="current-tag">当前</span>
              <span v-if="ver.is_snapshot" class="snap-tag">快照</span>
              <span class="ver-date">{{ formatDateTime(ver.created_at) }}</span>
              <span class="ver-author">{{ ver.author }}</span>
            </div>
            <div class="ver-msg">{{ ver.message || '无提交说明' }}</div>
            <div class="ver-diff">
              <span class="diff-add">+{{ ver.chars_added }}</span>
              <span class="diff-del">-{{ ver.chars_deleted }}</span>
              <span class="diff-size">{{ ver.file_size }}</span>
            </div>
            <div class="ver-actions">
              <button class="btn-sm" @click="previewVersion(ver)" v-if="idx > 0">预览</button>
              <button class="btn-sm btn-diff" @click="diffVersion(ver)" v-if="idx > 0">与当前对比</button>
              <button class="btn-sm btn-rollback" @click="rollbackTo(ver)" v-if="idx > 0">回滚至此</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Diff 弹窗 -->
    <div v-if="diffModal.show" class="modal-overlay" @click.self="diffModal.show = false">
      <div class="modal-card modal-lg">
        <div class="modal-header">
          <span>版本对比：v{{ diffModal.fromVer }} → 当前版本</span>
          <button class="btn-close" @click="diffModal.show = false">✕</button>
        </div>
        <div class="diff-container">
          <div class="diff-col">
            <div class="diff-col-header">v{{ diffModal.fromVer }}</div>
            <pre class="diff-pre diff-old">{{ diffModal.oldContent }}</pre>
          </div>
          <div class="diff-col">
            <div class="diff-col-header">当前版本</div>
            <pre class="diff-pre diff-new">{{ diffModal.newContent }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import axios from 'axios'

const loading = ref(false)
const searchKw = ref('')
const filterKb = ref('')
const selectedDoc = ref<any>(null)
const versions = ref<any[]>([])

const kbs = ref([
  { id: 'kb1', name: '产品知识库' },
  { id: 'kb2', name: '技术文档' },
  { id: 'kb3', name: '市场资料' },
])

const docs = ref([
  { id: 1, name: 'API 接口规范.md', type: 'md', kb_name: '技术文档', version_count: 8, updated_at: Date.now()/1000 - 3600, has_snapshot: true },
  { id: 2, name: '产品路线图 2024.docx', type: 'docx', kb_name: '产品知识库', version_count: 5, updated_at: Date.now()/1000 - 7200, has_snapshot: false },
  { id: 3, name: '市场调研报告.pdf', type: 'pdf', kb_name: '市场资料', version_count: 3, updated_at: Date.now()/1000 - 86400, has_snapshot: true },
  { id: 4, name: '需求规格说明书.txt', type: 'txt', kb_name: '产品知识库', version_count: 12, updated_at: Date.now()/1000 - 1800, has_snapshot: false },
])

const diffModal = reactive({ show: false, fromVer: 0, oldContent: '', newContent: '' })

const filteredDocs = computed(() => {
  return docs.value.filter(d => {
    const kbOk = !filterKb.value || d.kb_name.includes(filterKb.value)
    const kwOk = !searchKw.value || d.name.includes(searchKw.value)
    return kbOk && kwOk
  })
})

function getDocIcon(type: string) {
  const m: Record<string, string> = { md: '📝', docx: '📄', pdf: '📋', txt: '📃' }
  return m[type] || '📄'
}

async function fetchDocVersions() {
  loading.value = true
  try {
    const res = await axios.get('/api/versions/documents')
    if (res.data.documents) docs.value = res.data.documents
  } catch { /* use mock */ }
  finally { loading.value = false }
}

async function selectDoc(doc: any) {
  selectedDoc.value = doc
  try {
    const res = await axios.get(`/api/versions/document/${doc.id}`)
    versions.value = res.data.versions || []
  } catch {
    // Mock versions
    versions.value = Array.from({ length: doc.version_count }, (_, i) => ({
      id: doc.version_count - i,
      version: doc.version_count - i,
      created_at: Date.now()/1000 - i * 3600,
      author: ['张三', '李四', '王五'][i % 3],
      message: i === 0 ? '修复章节标题格式' : i === 1 ? '新增附录 A' : '初始版本',
      chars_added: Math.floor(Math.random() * 500),
      chars_deleted: Math.floor(Math.random() * 100),
      file_size: `${(doc.version_count - i) * 12}KB`,
      is_snapshot: i === 0 && doc.has_snapshot,
    }))
  }
}

function previewVersion(ver: any) {
  MessagePlugin.info(`正在加载 v${ver.version} 预览...`)
}

function diffVersion(ver: any) {
  diffModal.fromVer = ver.version
  diffModal.oldContent = `# 文档 v${ver.version}\n\n这是版本 v${ver.version} 的内容示例。\n\n旧的段落将在此处显示红色高亮。`
  diffModal.newContent = `# 文档（当前版本）\n\n这是当前版本的内容示例。\n\n新增段落会以绿色高亮显示在此处。\n\n--- 新增内容开始 ---\n优化了描述，增加了更多细节。`
  diffModal.show = true
}

async function rollbackTo(ver: any) {
  if (!confirm(`确定将文档回滚至 v${ver.version}？此操作将创建新版本记录。`)) return
  try {
    await axios.post(`/api/versions/document/${selectedDoc.value?.id}/rollback`, { version: ver.version })
    MessagePlugin.success(`已回滚至 v${ver.version}，新建 v${(selectedDoc.value?.version_count || 0) + 1}`)
    if (selectedDoc.value) selectDoc(selectedDoc.value)
  } catch {
    MessagePlugin.warning('后端未就绪，演示模式下模拟成功')
  }
}

async function createSnapshot() {
  try {
    await axios.post(`/api/versions/document/${selectedDoc.value?.id}/snapshot`)
    MessagePlugin.success('快照已创建')
  } catch { MessagePlugin.warning('演示模式') }
}

function formatDate(ts: number) { return new Date(ts * 1000).toLocaleDateString('zh-CN') }
function formatDateTime(ts: number) {
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false })
}

onMounted(fetchDocVersions)
</script>

<style scoped>
.tab-content { max-width: 900px; }
.section-header { margin-bottom: 20px; }
.section-header h2 { font-size: 18px; color: #111827; margin: 0 0 4px; }
.section-desc { font-size: 13px; color: #9ca3af; margin: 0; }
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.search-input, .filter-select {
  padding: 7px 12px; border: 1px solid #e5e7eb; border-radius: 7px; font-size: 13px; outline: none;
}
.search-input { flex: 1; min-width: 160px; }
.btn-refresh {
  padding: 7px 14px; background: white; border: 1px solid #d1d5db;
  border-radius: 7px; cursor: pointer; font-size: 13px;
}

.skeleton-list { display: flex; flex-direction: column; gap: 8px; }
.skeleton-item {
  height: 64px; background: linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%);
  background-size: 200% 100%; border-radius: 10px; animation: shimmer 1.5s infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }

.doc-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
.doc-row {
  display: flex; align-items: center; gap: 12px;
  background: white; border-radius: 10px; padding: 12px 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05); cursor: pointer; transition: all 0.15s;
  border: 2px solid transparent;
}
.doc-row:hover { border-color: #bfdbfe; }
.doc-row--active { border-color: #4f7ef8; background: #eff6ff; }
.doc-icon { font-size: 22px; }
.doc-info { flex: 1; }
.doc-name { font-size: 14px; font-weight: 600; color: #111827; }
.doc-meta { font-size: 12px; color: #9ca3af; margin-top: 2px; }
.doc-tags { display: flex; align-items: center; gap: 8px; }
.tag { padding: 2px 7px; border-radius: 10px; font-size: 11px; }
.tag--snap { background: #fef3c7; color: #92400e; }
.version-count { font-size: 12px; font-weight: 700; color: #6b7280; background: #f3f4f6; padding: 2px 7px; border-radius: 8px; }

.version-panel {
  background: white; border-radius: 12px; padding: 20px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.version-panel-header {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 16px;
}
.btn-snapshot {
  padding: 6px 14px; background: #fffbeb; border: 1px solid #fcd34d;
  border-radius: 7px; cursor: pointer; font-size: 12px; color: #78350f;
}

.timeline { position: relative; padding-left: 24px; }
.timeline::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 2px; background: #e5e7eb; }
.timeline-item { position: relative; margin-bottom: 16px; }
.timeline-dot {
  position: absolute; left: -24px; top: 10px;
  width: 12px; height: 12px; border-radius: 50%;
  background: #d1d5db; border: 2px solid white; box-shadow: 0 0 0 2px #d1d5db;
}
.dot--current { background: #4f7ef8; box-shadow: 0 0 0 2px #4f7ef8; }
.timeline-card {
  background: #f9fafb; border-radius: 8px; padding: 12px 14px;
  border: 1px solid #f0f0f0;
}
.ver-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.ver-badge {
  padding: 1px 8px; background: #eff6ff; color: #1d4ed8;
  border-radius: 8px; font-size: 12px; font-weight: 700; font-family: monospace;
}
.current-tag { padding: 1px 7px; background: #4f7ef8; color: white; border-radius: 8px; font-size: 11px; }
.snap-tag { padding: 1px 7px; background: #fef3c7; color: #92400e; border-radius: 8px; font-size: 11px; }
.ver-date { font-size: 12px; color: #9ca3af; }
.ver-author { font-size: 12px; color: #6b7280; margin-left: auto; }
.ver-msg { font-size: 13px; color: #374151; margin-bottom: 6px; }
.ver-diff { display: flex; gap: 10px; font-size: 12px; font-family: monospace; margin-bottom: 8px; }
.diff-add { color: #16a34a; }
.diff-del { color: #dc2626; }
.diff-size { color: #9ca3af; }
.ver-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-sm {
  padding: 3px 10px; border: 1px solid #d1d5db; border-radius: 5px;
  background: white; font-size: 12px; cursor: pointer;
}
.btn-diff { border-color: #bfdbfe; color: #1d4ed8; background: #eff6ff; }
.btn-rollback { border-color: #fecaca; color: #dc2626; background: #fff5f5; }

.empty-state { text-align: center; padding: 40px; color: #9ca3af; }
.empty-icon { font-size: 36px; margin-bottom: 10px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 9999; display: flex; align-items: center; justify-content: center; }
.modal-card { background: white; border-radius: 14px; padding: 24px; max-height: 90vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
.modal-lg { width: 90vw; max-width: 900px; }
.modal-header { display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 600; margin-bottom: 16px; }
.btn-close { border: none; background: none; font-size: 16px; cursor: pointer; color: #9ca3af; }
.diff-container { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.diff-col-header { font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 8px; }
.diff-pre { font-size: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; white-space: pre-wrap; min-height: 200px; margin: 0; }
.diff-old { background: #fff5f5; border-color: #fecaca; }
.diff-new { background: #f0fdf4; border-color: #bbf7d0; }
</style>
