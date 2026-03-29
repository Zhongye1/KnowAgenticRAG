<template>
  <div class="shared-detail-page">
    <!-- 顶部导航 -->
    <div class="sd-navbar">
      <button class="back-btn" @click="$router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        返回广场
      </button>
      <div class="sd-navbar-right">
        <button class="nav-btn" @click="openShare">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path
              stroke-linecap="round"
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
          分享
        </button>
        <button
          v-if="myRole === 'viewer'"
          class="nav-btn star-btn"
          :class="{ starred: isStarred }"
          @click="toggleStar"
        >
          {{ isStarred ? '⭐ 已订阅' : '☆ 订阅' }}
        </button>
        <button
          v-if="myRole === 'owner'"
          class="nav-btn invite-btn"
          @click="showInviteModal = true"
        >
          邀请协作者
        </button>
      </div>
    </div>

    <!-- 封面+信息头 -->
    <div class="sd-hero" :style="{ background: heroGradient }">
      <div class="sd-hero-content">
        <div class="kb-icon">{{ kb.name?.[0] || 'K' }}</div>
        <div class="kb-meta-block">
          <h1 class="kb-title">{{ kb.name }}</h1>
          <p class="kb-desc">{{ kb.description }}</p>
          <div class="kb-meta-row">
            <span class="meta-chip">📄 {{ kb.docCount || 0 }} 文档</span>
            <span class="meta-chip">👁 {{ formatNum(kb.viewCount || 0) }} 浏览</span>
            <span class="meta-chip">⭐ {{ formatNum(kb.starCount || 0) }} 订阅</span>
            <span class="meta-chip">🔀 {{ formatNum(kb.forkCount || 0) }} Fork</span>
            <span :class="['visibility-badge', kb.visibility]">
              {{
                kb.visibility === 'public'
                  ? '🌐 公开'
                  : kb.visibility === 'shared'
                    ? '🔗 链接可见'
                    : '🔒 私有'
              }}
            </span>
          </div>
          <div class="kb-tags">
            <span v-for="tag in kb.tags || []" :key="tag" class="kb-tag">#{{ tag }}</span>
          </div>
        </div>
        <!-- 我的角色徽章 -->
        <div class="role-badge" :class="myRole">
          {{ roleLabel }}
        </div>
      </div>
    </div>

    <!-- Tab 导航 -->
    <div class="sd-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['sd-tab', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        {{ tab.icon }} {{ tab.label }}
      </button>
    </div>

    <!-- 内容区 -->
    <div class="sd-body">
      <!-- 文档列表 Tab -->
      <div v-if="activeTab === 'docs'" class="tab-panel">
        <div class="panel-toolbar">
          <input v-model="docSearch" class="search-input" placeholder="搜索文档..." />
          <button v-if="myRole !== 'viewer'" class="btn-primary" @click="showUploadModal = true">
            + 上传文档
          </button>
        </div>
        <div class="doc-list">
          <div v-for="doc in filteredDocs" :key="doc.id" class="doc-item">
            <div class="doc-icon">{{ getDocIcon(doc.type) }}</div>
            <div class="doc-info">
              <div class="doc-name">{{ doc.name }}</div>
              <div class="doc-meta">{{ doc.size }} · {{ doc.uploader }} · {{ doc.updatedAt }}</div>
            </div>
            <div class="doc-actions">
              <span :class="['doc-status', doc.status]">{{
                doc.status === 'ready' ? '✓ 已解析' : '⏳ 解析中'
              }}</span>
              <button class="icon-btn" title="预览" @click="previewDoc(doc)">👁</button>
              <button
                v-if="myRole !== 'viewer'"
                class="icon-btn"
                title="删除"
                @click="deleteDoc(doc)"
              >
                🗑
              </button>
            </div>
          </div>
          <div v-if="filteredDocs.length === 0" class="empty-docs">暂无文档</div>
        </div>
      </div>

      <!-- 协作 Tab -->
      <div v-if="activeTab === 'collab'" class="tab-panel">
        <div class="collab-section">
          <h3 class="section-title">👥 协作者管理</h3>
          <div class="member-list">
            <div v-for="m in members" :key="m.id" class="member-row">
              <div class="member-avatar" :style="{ background: m.color }">{{ m.name[0] }}</div>
              <div class="member-info">
                <div class="member-name">{{ m.name }}</div>
                <div class="member-email">{{ m.email }}</div>
              </div>
              <div class="member-role-selector">
                <select
                  v-if="myRole === 'owner' && m.role !== 'owner'"
                  v-model="m.role"
                  class="role-select"
                  @change="updateMemberRole(m)"
                >
                  <option value="author">共同作者</option>
                  <option value="viewer">观看者</option>
                </select>
                <span v-else :class="['role-tag', m.role]">{{ roleLabels[m.role] }}</span>
              </div>
              <button
                v-if="myRole === 'owner' && m.role !== 'owner'"
                class="btn-remove"
                @click="removeMember(m)"
              >
                移除
              </button>
            </div>
          </div>

          <!-- GitHub式编辑说明 -->
          <div class="collab-mode-section">
            <h3 class="section-title">✏️ 编辑模式</h3>
            <div class="mode-cards">
              <div
                :class="['mode-card', { active: editMode === 'github' }]"
                @click="editMode = 'github'"
              >
                <div class="mode-icon">🐙</div>
                <div class="mode-name">GitHub 式协作</div>
                <div class="mode-desc">提交 PR → 审核 → 合并，保留完整版本历史</div>
                <div v-if="editMode === 'github'" class="mode-active-badge">当前模式</div>
              </div>
              <div :class="['mode-card', { active: editMode === 'wps' }]" @click="editMode = 'wps'">
                <div class="mode-icon">📝</div>
                <div class="mode-name">金山文档协作</div>
                <div class="mode-desc">实时多人同步编辑，适合文档类知识</div>
                <div v-if="editMode === 'wps'" class="mode-active-badge">当前模式</div>
              </div>
              <div
                :class="['mode-card', { active: editMode === 'direct' }]"
                @click="editMode = 'direct'"
              >
                <div class="mode-icon">⚡</div>
                <div class="mode-name">直接编辑</div>
                <div class="mode-desc">所有共同作者可直接修改，适合小团队</div>
                <div v-if="editMode === 'direct'" class="mode-active-badge">当前模式</div>
              </div>
            </div>

            <!-- GitHub式 PR 列表 -->
            <div v-if="editMode === 'github'" class="pr-section">
              <div class="pr-header">
                <h4>Pull Requests</h4>
                <button class="btn-primary btn-sm" @click="showPrModal = true">+ 提交 PR</button>
              </div>
              <div class="pr-list">
                <div v-for="pr in pullRequests" :key="pr.id" class="pr-item">
                  <div :class="['pr-status', pr.status]">{{ prStatusLabel[pr.status] }}</div>
                  <div class="pr-info">
                    <div class="pr-title">{{ pr.title }}</div>
                    <div class="pr-meta">
                      {{ pr.author }} · {{ pr.createdAt }} · {{ pr.changes }} 处修改
                    </div>
                  </div>
                  <div v-if="myRole === 'owner' && pr.status === 'open'" class="pr-actions">
                    <button class="btn-approve" @click="approvePr(pr)">✓ 合并</button>
                    <button class="btn-reject" @click="rejectPr(pr)">✕ 拒绝</button>
                  </div>
                </div>
                <div v-if="pullRequests.length === 0" class="empty-docs">暂无待审核的 PR</div>
              </div>
            </div>

            <!-- 金山文档入口 -->
            <div v-if="editMode === 'wps'" class="wps-section">
              <div class="wps-card">
                <div class="wps-icon">📝</div>
                <div>
                  <div class="wps-title">金山文档在线协作</div>
                  <div class="wps-desc">选择一个文档文件，开启多人实时共同编辑</div>
                </div>
                <button class="btn-primary" @click="openWpsCollab">打开金山文档</button>
              </div>
              <div class="wps-file-list">
                <div
                  v-for="doc in docs.filter(d => d.type === 'docx' || d.type === 'doc')"
                  :key="doc.id"
                  class="wps-file-item"
                  @click="openWpsFile(doc)"
                >
                  <span>📄 {{ doc.name }}</span>
                  <span class="wps-online">👥 {{ Math.floor(Math.random() * 3) + 1 }} 人在线</span>
                </div>
                <div
                  v-if="!docs.some(d => d.type === 'docx' || d.type === 'doc')"
                  class="empty-docs"
                >
                  暂无 Word 文档，请上传 .docx 文件以开启协同编辑
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 版本历史 Tab -->
      <div v-if="activeTab === 'versions'" class="tab-panel">
        <div class="version-timeline">
          <div v-for="v in versions" :key="v.id" class="version-item">
            <div class="version-dot" :class="{ latest: v.isLatest }"></div>
            <div class="version-content">
              <div class="version-header">
                <span class="version-tag" :class="{ latest: v.isLatest }">{{ v.tag }}</span>
                <span class="version-title">{{ v.title }}</span>
                <span v-if="v.isLatest" class="latest-badge">最新</span>
              </div>
              <div class="version-meta">
                {{ v.author }} · {{ v.createdAt }} · {{ v.changes }} 处变更
              </div>
              <p class="version-desc">{{ v.description }}</p>
              <div class="version-actions">
                <button class="btn-text" @click="previewVersion(v)">查看</button>
                <button v-if="myRole === 'owner'" class="btn-text" @click="rollbackVersion(v)">
                  回滚到此版本
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 评论区 Tab -->
      <div v-if="activeTab === 'comments'" class="tab-panel">
        <div class="comment-box">
          <div class="comment-input-row">
            <div class="comment-avatar">我</div>
            <textarea
              v-model="newComment"
              class="comment-textarea"
              placeholder="发表你的评论或提问..."
              rows="3"
            ></textarea>
          </div>
          <div class="comment-submit-row">
            <button
              class="btn-primary btn-sm"
              :disabled="!newComment.trim()"
              @click="submitComment"
            >
              发布评论
            </button>
          </div>
        </div>
        <div class="comment-list">
          <div v-for="c in comments" :key="c.id" class="comment-item">
            <div class="comment-avatar-l" :style="{ background: c.color }">{{ c.author[0] }}</div>
            <div class="comment-body">
              <div class="comment-header">
                <span class="comment-author">{{ c.author }}</span>
                <span class="comment-time">{{ c.time }}</span>
                <span v-if="c.isAI" class="ai-badge">AI 回复</span>
              </div>
              <p class="comment-text">{{ c.text }}</p>
              <div class="comment-actions">
                <button class="btn-text" @click="likeComment(c)">👍 {{ c.likes }}</button>
                <button class="btn-text" @click="replyComment(c)">回复</button>
                <button v-if="!c.isAI" class="btn-text" @click="askAI(c)">AI 解答</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分享弹窗 -->
    <ShareModal v-if="showShareModal" :kb="kb" @close="showShareModal = false" />

    <!-- 邀请弹窗 -->
    <div v-if="showInviteModal" class="modal-overlay" @click.self="showInviteModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>邀请协作者</h3>
          <button class="modal-close" @click="showInviteModal = false">✕</button>
        </div>
        <div class="modal-body">
          <label class="form-label">邮箱地址</label>
          <input v-model="inviteEmail" class="form-input" placeholder="输入邮箱..." type="text" />
          <label class="form-label">权限</label>
          <select v-model="inviteRole" class="form-input">
            <option value="author">共同作者（可编辑）</option>
            <option value="viewer">观看者（只读）</option>
          </select>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="showInviteModal = false">取消</button>
          <button class="btn-confirm" @click="sendInvite">发送邀请</button>
        </div>
      </div>
    </div>

    <!-- PR 提交弹窗 -->
    <div v-if="showPrModal" class="modal-overlay" @click.self="showPrModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>提交 Pull Request</h3>
          <button class="modal-close" @click="showPrModal = false">✕</button>
        </div>
        <div class="modal-body">
          <label class="form-label">PR 标题 *</label>
          <input v-model="newPr.title" class="form-input" placeholder="简要描述本次修改..." />
          <label class="form-label">变更描述</label>
          <textarea
            v-model="newPr.desc"
            class="form-input"
            rows="4"
            placeholder="详细说明修改内容、原因..."
          ></textarea>
          <label class="form-label">影响的文档</label>
          <div class="doc-check-list">
            <label v-for="doc in docs" :key="doc.id" class="doc-check-item">
              <input v-model="newPr.docs" type="checkbox" :value="doc.id" />
              {{ doc.name }}
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="showPrModal = false">取消</button>
          <button class="btn-confirm" @click="submitPr">提交 PR</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import ShareModal from '@/components/ShareModal.vue'

const route = useRoute()
const kbId = route.params.id

// ── 基础数据 ──────────────────────────────────────────
const kb = ref({
  id: kbId,
  name: '深度学习笔记',
  description: '系统整理深度学习核心概念、模型架构与实战经验，适合初学者到进阶。',
  visibility: 'public',
  docCount: 24,
  viewCount: 3200,
  starCount: 186,
  forkCount: 42,
  tags: ['AI', '机器学习', '深度学习', 'PyTorch']
})
const myRole = ref<'owner' | 'author' | 'viewer'>('owner')
const roleLabel = computed(
  () => ({ owner: '创建者', author: '共同作者', viewer: '观看者' })[myRole.value]
)
const isStarred = ref(false)
const heroGradient = 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 60%, #8b5cf6 100%)'
const showShareModal = ref(false)
const showInviteModal = ref(false)
const showUploadModal = ref(false)
const showPrModal = ref(false)

const tabs = [
  { id: 'docs', label: '文档', icon: '📄' },
  { id: 'collab', label: '协作', icon: '👥' },
  { id: 'versions', label: '版本历史', icon: '🕐' },
  { id: 'comments', label: '评论区', icon: '💬' }
]
const activeTab = ref('docs')
const editMode = ref<'github' | 'wps' | 'direct'>('github')

// ── 文档 ──────────────────────────────────────────────
const docSearch = ref('')
const docs = ref([
  {
    id: 1,
    name: '第1章-神经网络基础.pdf',
    type: 'pdf',
    size: '2.3MB',
    uploader: '张明远',
    updatedAt: '2天前',
    status: 'ready'
  },
  {
    id: 2,
    name: '第2章-卷积神经网络.pdf',
    type: 'pdf',
    size: '3.1MB',
    uploader: '张明远',
    updatedAt: '2天前',
    status: 'ready'
  },
  {
    id: 3,
    name: '实验代码笔记.docx',
    type: 'docx',
    size: '0.8MB',
    uploader: 'Alice Chen',
    updatedAt: '1天前',
    status: 'ready'
  },
  {
    id: 4,
    name: '模型对比表格.xlsx',
    type: 'xlsx',
    size: '0.2MB',
    uploader: 'Alice Chen',
    updatedAt: '5小时前',
    status: 'processing'
  }
])
const filteredDocs = computed(() =>
  docs.value.filter(d => d.name.toLowerCase().includes(docSearch.value.toLowerCase()))
)
function getDocIcon(type: string) {
  return { pdf: '📕', docx: '📘', doc: '📘', xlsx: '📗', md: '📝', txt: '📄' }[type] || '📄'
}
function previewDoc(doc: any) {
  MessagePlugin.info(`预览：${doc.name}`)
}
function deleteDoc(doc: any) {
  docs.value = docs.value.filter(d => d.id !== doc.id)
  MessagePlugin.success(`已删除 ${doc.name}`)
}

// ── 协作成员 ──────────────────────────────────────────
const roleLabels: Record<string, string> = { owner: '创建者', author: '共同作者', viewer: '观看者' }
const members = ref([
  { id: 1, name: '张明远', email: 'zhang@example.com', role: 'owner', color: '#3b82f6' },
  { id: 2, name: 'Alice Chen', email: 'alice@example.com', role: 'author', color: '#10b981' },
  { id: 3, name: '李研究员', email: 'li@example.com', role: 'viewer', color: '#f59e0b' }
])
const inviteEmail = ref('')
const inviteRole = ref('author')
function updateMemberRole(m: any) {
  MessagePlugin.success(`已将 ${m.name} 设为「${roleLabels[m.role]}」`)
}
function removeMember(m: any) {
  members.value = members.value.filter(x => x.id !== m.id)
  MessagePlugin.success(`已移除 ${m.name}`)
}
function sendInvite() {
  if (!inviteEmail.value.trim()) {
    MessagePlugin.warning('请输入邮箱')
    return
  }
  MessagePlugin.success(`邀请已发送至 ${inviteEmail.value}`)
  inviteEmail.value = ''
  showInviteModal.value = false
}

// ── Pull Requests ──────────────────────────────────────
const prStatusLabel: Record<string, string> = {
  open: '待审核',
  merged: '已合并',
  rejected: '已拒绝'
}
const pullRequests = ref([
  {
    id: 1,
    title: '更新第3章 Transformer 内容',
    author: 'Alice Chen',
    createdAt: '3小时前',
    changes: 12,
    status: 'open'
  },
  {
    id: 2,
    title: '修正第1章公式错误',
    author: 'Alice Chen',
    createdAt: '1天前',
    changes: 3,
    status: 'merged'
  }
])
const newPr = ref({ title: '', desc: '', docs: [] as number[] })
function submitPr() {
  if (!newPr.value.title.trim()) {
    MessagePlugin.warning('请填写 PR 标题')
    return
  }
  pullRequests.value.unshift({
    id: Date.now(),
    title: newPr.value.title,
    author: '我',
    createdAt: '刚刚',
    changes: 1,
    status: 'open'
  })
  MessagePlugin.success('PR 已提交，等待审核')
  newPr.value = { title: '', desc: '', docs: [] }
  showPrModal.value = false
}
function approvePr(pr: any) {
  pr.status = 'merged'
  MessagePlugin.success('PR 已合并')
}
function rejectPr(pr: any) {
  pr.status = 'rejected'
  MessagePlugin.warning('PR 已拒绝')
}
function openWpsCollab() {
  MessagePlugin.info('正在跳转至金山文档协作页面...')
}
function openWpsFile(doc: any) {
  MessagePlugin.info(`打开金山文档：${doc.name}`)
}

// ── 版本历史 ──────────────────────────────────────────
const versions = ref([
  {
    id: 1,
    tag: 'v1.3',
    title: '新增 Transformer 章节',
    author: '张明远',
    createdAt: '2026-03-25',
    changes: 28,
    description: '完整补充了 Attention 机制和 BERT/GPT 系列模型内容。',
    isLatest: true
  },
  {
    id: 2,
    tag: 'v1.2',
    title: '修复公式错误',
    author: 'Alice Chen',
    createdAt: '2026-03-20',
    changes: 5,
    description: '修正了第1、2章中若干公式推导错误。',
    isLatest: false
  },
  {
    id: 3,
    tag: 'v1.1',
    title: '添加实验代码',
    author: '张明远',
    createdAt: '2026-03-15',
    changes: 15,
    description: '补充 PyTorch 实战代码示例。',
    isLatest: false
  },
  {
    id: 4,
    tag: 'v1.0',
    title: '初始版本',
    author: '张明远',
    createdAt: '2026-03-10',
    changes: 0,
    description: '知识库创建，上传前两章基础内容。',
    isLatest: false
  }
])
function previewVersion(v: any) {
  MessagePlugin.info(`查看版本 ${v.tag}`)
}
function rollbackVersion(v: any) {
  MessagePlugin.success(`已回滚到 ${v.tag}`)
}

// ── 评论 ──────────────────────────────────────────────
const newComment = ref('')
const comments = ref([
  {
    id: 1,
    author: 'Alice Chen',
    color: '#10b981',
    time: '10分钟前',
    text: '第二章的卷积可视化部分讲得很清楚！能不能再补充一下 BatchNorm 的内容？',
    likes: 3,
    isAI: false
  },
  {
    id: 2,
    author: 'AI 助手',
    color: '#6366f1',
    time: '8分钟前',
    text: 'BatchNorm 是批归一化技术，通过对每一批数据的激活值进行归一化，可以加速训练并提高稳定性。可以参考原始论文 Ioffe & Szegedy (2015)。',
    likes: 1,
    isAI: true
  },
  {
    id: 3,
    author: '李研究员',
    color: '#f59e0b',
    time: '1小时前',
    text: '这个知识库非常系统，正是我需要的资料，已订阅！',
    likes: 5,
    isAI: false
  }
])
function submitComment() {
  if (!newComment.value.trim()) return
  comments.value.unshift({
    id: Date.now(),
    author: '我',
    color: '#3b82f6',
    time: '刚刚',
    text: newComment.value,
    likes: 0,
    isAI: false
  })
  newComment.value = ''
}
function likeComment(c: any) {
  c.likes++
}
function replyComment(c: any) {
  newComment.value = `@${c.author} `
}
function askAI(c: any) {
  comments.value.splice(comments.value.indexOf(c) + 1, 0, {
    id: Date.now(),
    author: 'AI 助手',
    color: '#6366f1',
    time: '刚刚',
    text: `针对您的问题「${c.text.substring(0, 30)}...」，AI 正在分析知识库内容为您解答...`,
    likes: 0,
    isAI: true
  })
}

// ── 其他 ──────────────────────────────────────────────
function formatNum(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
}
function toggleStar() {
  isStarred.value = !isStarred.value
  MessagePlugin.success(isStarred.value ? '已订阅' : '已取消订阅')
}
function openShare() {
  showShareModal.value = true
}

onMounted(() => {
  const id = Number(kbId)
  if (id === 1) myRole.value = 'owner'
  else if (id % 3 === 0) myRole.value = 'author'
  else myRole.value = 'viewer'
})
</script>

<style scoped>
.shared-detail-page {
  min-height: 100vh;
  background: #f4f6fb;
}

/* Navbar */
.sd-navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 32px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 0;
  z-index: 10;
}
.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
}
.back-btn svg {
  width: 16px;
  height: 16px;
}
.back-btn:hover {
  background: #f9fafb;
}
.sd-navbar-right {
  display: flex;
  gap: 8px;
}
.nav-btn {
  padding: 6px 16px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 6px;
}
.nav-btn svg {
  width: 16px;
  height: 16px;
}
.nav-btn:hover {
  background: #f9fafb;
}
.star-btn.starred {
  background: #fef3c7;
  border-color: #fcd34d;
  color: #92400e;
}
.invite-btn {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}
.invite-btn:hover {
  background: #2563eb;
}

/* Hero */
.sd-hero {
  padding: 40px 32px;
  color: #fff;
}
.sd-hero-content {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  max-width: 900px;
  position: relative;
}
.kb-icon {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.3);
}
.kb-meta-block {
  flex: 1;
}
.kb-title {
  font-size: 26px;
  font-weight: 700;
  margin: 0 0 8px;
}
.kb-desc {
  font-size: 14px;
  opacity: 0.85;
  margin: 0 0 12px;
  line-height: 1.6;
}
.kb-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.meta-chip {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 20px;
  padding: 3px 12px;
  font-size: 12px;
}
.visibility-badge {
  border-radius: 20px;
  padding: 3px 12px;
  font-size: 12px;
}
.visibility-badge.public {
  background: #d1fae5;
  color: #065f46;
}
.visibility-badge.shared {
  background: #dbeafe;
  color: #1e40af;
}
.visibility-badge.private {
  background: #fee2e2;
  color: #991b1b;
}
.kb-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.kb-tag {
  font-size: 12px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  padding: 2px 8px;
}
.role-badge {
  padding: 4px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  position: absolute;
  top: 0;
  right: 0;
}
.role-badge.owner {
  background: #fef3c7;
  color: #92400e;
}
.role-badge.author {
  background: #d1fae5;
  color: #065f46;
}
.role-badge.viewer {
  background: #e0e7ff;
  color: #3730a3;
}

/* Tabs */
.sd-tabs {
  display: flex;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 32px;
}
.sd-tab {
  padding: 14px 20px;
  cursor: pointer;
  font-size: 14px;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
  transition: all 0.2s;
}
.sd-tab.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
  font-weight: 600;
}
.sd-tab:hover:not(.active) {
  color: #374151;
  background: #f9fafb;
}

/* Body */
.sd-body {
  padding: 24px 32px;
  max-width: 960px;
}
.tab-panel {
}

/* Toolbar */
.panel-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.search-input {
  flex: 1;
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}
.search-input:focus {
  border-color: #3b82f6;
}
.btn-primary {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: #3b82f6;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}
.btn-primary:hover {
  background: #2563eb;
}
.btn-primary.btn-sm {
  padding: 5px 14px;
  font-size: 13px;
}

/* Doc List */
.doc-list {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.doc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
  transition: background 0.15s;
}
.doc-item:last-child {
  border-bottom: none;
}
.doc-item:hover {
  background: #f9fafb;
}
.doc-icon {
  font-size: 24px;
  flex-shrink: 0;
}
.doc-info {
  flex: 1;
  min-width: 0;
}
.doc-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.doc-meta {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}
.doc-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.doc-status {
  font-size: 12px;
}
.doc-status.ready {
  color: #16a34a;
}
.doc-status.processing {
  color: #d97706;
}
.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  opacity: 0.6;
  padding: 4px;
  border-radius: 4px;
}
.icon-btn:hover {
  opacity: 1;
  background: #f3f4f6;
}
.empty-docs {
  text-align: center;
  padding: 32px;
  color: #9ca3af;
  font-size: 14px;
}

/* Collab */
.collab-section {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 16px;
}
.member-list {
  margin-bottom: 24px;
  border: 1px solid #f3f4f6;
  border-radius: 8px;
  overflow: hidden;
}
.member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #f3f4f6;
}
.member-row:last-child {
  border-bottom: none;
}
.member-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
}
.member-info {
  flex: 1;
}
.member-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
}
.member-email {
  font-size: 12px;
  color: #9ca3af;
}
.role-select {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}
.role-tag {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 12px;
}
.role-tag.owner {
  background: #fef3c7;
  color: #92400e;
}
.role-tag.author {
  background: #d1fae5;
  color: #065f46;
}
.role-tag.viewer {
  background: #e0e7ff;
  color: #3730a3;
}
.btn-remove {
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid #fca5a5;
  background: #fff;
  color: #ef4444;
  cursor: pointer;
  font-size: 12px;
}
.btn-remove:hover {
  background: #fef2f2;
}

/* Mode Cards */
.collab-mode-section {
  margin-top: 24px;
}
.mode-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.mode-card {
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  position: relative;
}
.mode-card:hover {
  border-color: #3b82f6;
}
.mode-card.active {
  border-color: #3b82f6;
  background: #eff6ff;
}
.mode-icon {
  font-size: 28px;
  margin-bottom: 8px;
}
.mode-name {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}
.mode-desc {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}
.mode-active-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10px;
  background: #3b82f6;
  color: #fff;
  border-radius: 4px;
  padding: 2px 6px;
}

/* PR */
.pr-section {
}
.pr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.pr-header h4 {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}
.pr-list {
  border: 1px solid #f3f4f6;
  border-radius: 8px;
  overflow: hidden;
}
.pr-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #f3f4f6;
}
.pr-item:last-child {
  border-bottom: none;
}
.pr-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  flex-shrink: 0;
  white-space: nowrap;
}
.pr-status.open {
  background: #d1fae5;
  color: #065f46;
}
.pr-status.merged {
  background: #e0e7ff;
  color: #3730a3;
}
.pr-status.rejected {
  background: #fee2e2;
  color: #991b1b;
}
.pr-info {
  flex: 1;
}
.pr-title {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
}
.pr-meta {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}
.pr-actions {
  display: flex;
  gap: 6px;
}
.btn-approve {
  padding: 4px 12px;
  border-radius: 6px;
  border: none;
  background: #3b82f6;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
}
.btn-reject {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid #fca5a5;
  background: #fff;
  color: #ef4444;
  cursor: pointer;
  font-size: 12px;
}

/* WPS */
.wps-section {
}
.wps-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.wps-icon {
  font-size: 32px;
}
.wps-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}
.wps-desc {
  font-size: 13px;
  color: #6b7280;
}
.wps-file-list {
  border: 1px solid #f3f4f6;
  border-radius: 8px;
  overflow: hidden;
}
.wps-file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  font-size: 14px;
}
.wps-file-item:last-child {
  border-bottom: none;
}
.wps-file-item:hover {
  background: #f9fafb;
}
.wps-online {
  font-size: 12px;
  color: #10b981;
}

/* Version Timeline */
.version-timeline {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.version-item {
  display: flex;
  gap: 16px;
  padding-bottom: 24px;
  position: relative;
}
.version-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 18px;
  bottom: 0;
  width: 2px;
  background: #e5e7eb;
}
.version-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e5e7eb;
  border: 2px solid #fff;
  flex-shrink: 0;
  margin-top: 3px;
  box-shadow: 0 0 0 2px #e5e7eb;
}
.version-dot.latest {
  background: #3b82f6;
  box-shadow: 0 0 0 2px #bfdbfe;
}
.version-content {
  flex: 1;
}
.version-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.version-tag {
  font-size: 12px;
  background: #f3f4f6;
  color: #374151;
  border-radius: 4px;
  padding: 2px 8px;
  font-family: monospace;
}
.version-tag.latest {
  background: #dbeafe;
  color: #1e40af;
}
.version-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.latest-badge {
  font-size: 11px;
  background: #3b82f6;
  color: #fff;
  border-radius: 10px;
  padding: 1px 8px;
}
.version-meta {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 4px;
}
.version-desc {
  font-size: 13px;
  color: #4b5563;
  margin: 4px 0 8px;
}
.version-actions {
  display: flex;
  gap: 12px;
}
.btn-text {
  background: none;
  border: none;
  color: #3b82f6;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}
.btn-text:hover {
  text-decoration: underline;
}

/* Comments */
.comment-box {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.comment-input-row {
  display: flex;
  gap: 12px;
}
.comment-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}
.comment-textarea {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  resize: vertical;
  font-family: inherit;
}
.comment-textarea:focus {
  border-color: #3b82f6;
}
.comment-submit-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
.comment-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.comment-item {
  display: flex;
  gap: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.comment-avatar-l {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}
.comment-body {
  flex: 1;
}
.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.comment-author {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.comment-time {
  font-size: 12px;
  color: #9ca3af;
}
.ai-badge {
  font-size: 11px;
  background: #ede9fe;
  color: #6d28d9;
  border-radius: 10px;
  padding: 1px 8px;
}
.comment-text {
  font-size: 14px;
  color: #374151;
  line-height: 1.6;
  margin: 0 0 8px;
}
.comment-actions {
  display: flex;
  gap: 12px;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-card {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  width: 480px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.modal-header h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  color: #6b7280;
}
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}
.form-label {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  display: block;
}
.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}
.form-input:focus {
  border-color: #3b82f6;
}
.doc-check-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 120px;
  overflow-y: auto;
  border: 1px solid #f3f4f6;
  border-radius: 8px;
  padding: 8px;
}
.doc-check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
}
.btn-cancel {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  cursor: pointer;
  font-size: 14px;
}
.btn-confirm {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: #3b82f6;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}
.btn-confirm:hover {
  background: #2563eb;
}
</style>
