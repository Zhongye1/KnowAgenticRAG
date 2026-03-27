<template>
  <div class="square-page">
    <!-- 顶部 Banner -->
    <div class="square-banner">
      <div class="banner-content">
        <h1 class="banner-title">知识广场</h1>
        <p class="banner-sub">发现、订阅、共创 — 汇聚全球知识圈子</p>
        <div class="banner-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/></svg>
          <input v-model="searchKeyword" placeholder="搜索知识库、作者、标签..." @keydown.enter="doSearch" />
          <button @click="doSearch">搜索</button>
        </div>
      </div>
    </div>

    <!-- 分类 Tab + 排序栏 -->
    <div class="square-toolbar">
      <div class="cat-tabs">
        <button
          v-for="cat in categories" :key="cat.id"
          :class="['cat-tab', { active: activeCat === cat.id }]"
          @click="activeCat = cat.id; loadKbs(true)"
        >{{ cat.label }}</button>
      </div>
      <div class="sort-bar">
        <span class="sort-label">排序：</span>
        <button v-for="s in sortOptions" :key="s.value"
          :class="['sort-btn', { active: sortBy === s.value }]"
          @click="sortBy = s.value; loadKbs(true)">{{ s.label }}</button>
        <button class="view-toggle" @click="viewMode = viewMode === 'grid' ? 'list' : 'grid'">
          <svg v-if="viewMode === 'grid'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        </button>
      </div>
    </div>

    <!-- 热门标签 -->
    <div class="tag-row">
      <span class="tag-label">热门标签：</span>
      <span v-for="tag in hotTags" :key="tag"
        :class="['tag-chip', { active: activeTag === tag }]"
        @click="activeTag = activeTag === tag ? '' : tag; loadKbs(true)">
        #{{ tag }}
      </span>
    </div>

    <!-- 内容区 -->
    <div class="square-body">
      <!-- 左侧：推荐圈子 -->
      <aside class="square-aside">
        <div class="aside-section">
          <h3 class="aside-title">🔥 热门圈子</h3>
          <div v-if="circlesLoading" class="aside-loading">加载中...</div>
          <div v-else-if="hotCircles.length === 0" class="aside-empty">暂无圈子，快来创建第一个！</div>
          <div v-for="circle in hotCircles" :key="circle.id" class="circle-item" @click="enterCircle(circle)">
            <div class="circle-avatar" :style="{ background: circle.color }">{{ circle.name[0] }}</div>
            <div class="circle-info">
              <div class="circle-name">{{ circle.name }}</div>
              <div class="circle-meta">{{ circle.member_count }} 成员 · {{ circle.kb_count }} 知识库</div>
            </div>
            <button class="circle-join-btn" :class="{ joined: circle._joined }"
              @click.stop="toggleJoin(circle)">
              {{ circle._joined ? '已加入' : '+ 加入' }}
            </button>
          </div>
        </div>
        <div class="aside-section">
          <h3 class="aside-title">📌 我的圈子</h3>
          <div v-if="myCircles.length === 0" class="aside-empty">还未加入任何圈子</div>
          <div v-for="c in myCircles" :key="c.id" class="circle-item" @click="filterByCircle(c)">
            <div class="circle-avatar" :style="{ background: c.color }">{{ c.name[0] }}</div>
            <div class="circle-info">
              <div class="circle-name">{{ c.name }}</div>
              <div class="circle-meta">{{ c.member_count }} 成员</div>
            </div>
          </div>
          <button class="create-circle-btn" @click="showCreateCircle = true">+ 创建圈子</button>
        </div>

        <!-- 分享我的知识库 -->
        <div class="aside-section">
          <h3 class="aside-title">📤 分享知识库</h3>
          <p class="aside-hint">将你的知识库发布到广场，与大家共享</p>
          <button class="share-my-kb-btn" @click="showShareMyKb = true">选择知识库发布</button>
        </div>
      </aside>

      <!-- 主内容：知识库卡片流 -->
      <main class="square-main">
        <!-- 当前筛选提示 -->
        <div v-if="activeCircleFilter" class="filter-banner">
          <span>圈子：{{ activeCircleFilter.name }}</span>
          <button @click="clearCircleFilter">✕ 清除筛选</button>
        </div>

        <!-- 骨架屏 -->
        <div v-if="loading" :class="['kb-flow', viewMode]">
          <div v-for="i in 8" :key="i" class="kb-card skeleton-card">
            <div class="skeleton-cover"></div>
            <div class="skeleton-line w-3-4"></div>
            <div class="skeleton-line w-1-2"></div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="kbList.length === 0" class="empty-state">
          <div class="empty-icon">📚</div>
          <p>暂无知识库</p>
          <p class="empty-hint">成为第一个发布者！</p>
          <button class="empty-action-btn" @click="showShareMyKb = true">立即发布</button>
        </div>

        <!-- 知识库卡片流 -->
        <div v-else :class="['kb-flow', viewMode]">
          <div v-for="kb in kbList" :key="kb.id" class="kb-card" @click="openKb(kb)">
            <!-- 封面 -->
            <div class="kb-cover" :style="{ background: kb.cover_color || getCoverGradient(kb.id) }">
              <div class="kb-cover-text">{{ kb.kb_name[0] }}</div>
              <!-- 悬浮操作 -->
              <div class="kb-cover-overlay">
                <button class="overlay-btn" @click.stop="openKb(kb)">打开</button>
                <button class="overlay-btn secondary" @click.stop="toggleStar(kb)">
                  {{ starredSet.has(kb.id) ? '★ 已收藏' : '☆ 收藏' }}
                </button>
              </div>
            </div>
            <!-- 信息 -->
            <div class="kb-info">
              <div class="kb-title-row">
                <span class="kb-name">{{ kb.kb_name }}</span>
                <span v-if="kb.view_count > 500" class="hot-badge">🔥热</span>
                <span v-if="isNewKb(kb.created_at)" class="new-badge">NEW</span>
              </div>
              <p class="kb-desc">{{ kb.description || '暂无描述' }}</p>
              <div class="kb-tags">
                <span v-for="tag in (kb.tags || []).slice(0,3)" :key="tag" class="kb-tag">#{{ tag }}</span>
              </div>
              <div class="kb-footer">
                <div class="kb-author">
                  <div class="author-avatar">{{ (kb.author_name || '?')[0] }}</div>
                  <span>{{ kb.author_name || '匿名' }}</span>
                </div>
                <div class="kb-stats">
                  <span class="stat-item">👁 {{ formatNum(kb.view_count) }}</span>
                  <span class="stat-item" :class="{ starred: starredSet.has(kb.id) }">
                    ⭐ {{ formatNum(kb.star_count) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 加载更多 -->
        <div class="load-more-row" v-if="!loading && hasMore">
          <button class="load-more-btn" @click="loadMore" :disabled="loadingMore">
            {{ loadingMore ? '加载中...' : '加载更多' }}
          </button>
        </div>
        <div class="no-more-hint" v-if="!loading && !hasMore && kbList.length > 0">
          — 已加载全部 {{ totalCount }} 个知识库 —
        </div>
      </main>
    </div>

    <!-- 分享弹窗 -->
    <ShareModal v-if="shareTarget" :kb="shareTarget" @close="shareTarget = null" />

    <!-- 发布我的知识库弹窗 -->
    <div v-if="showShareMyKb" class="modal-overlay" @click.self="showShareMyKb = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>📤 发布知识库到广场</h3>
          <button @click="showShareMyKb = false" class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <label class="form-label">选择知识库 *</label>
          <div v-if="myKbsLoading" class="mini-loading">加载知识库列表...</div>
          <select v-else v-model="publishForm.kbId" class="form-input">
            <option value="">-- 请选择 --</option>
            <option v-for="kb in userKbList" :key="kb.id" :value="kb.id">{{ kb.name }}</option>
          </select>
          <label class="form-label">简介</label>
          <textarea v-model="publishForm.description" class="form-input" rows="3" placeholder="介绍一下这个知识库的内容..."></textarea>
          <label class="form-label">分类</label>
          <select v-model="publishForm.category" class="form-input">
            <option v-for="cat in categories.filter(c=>c.id!=='all')" :key="cat.id" :value="cat.id">{{ cat.label }}</option>
          </select>
          <label class="form-label">标签（逗号分隔）</label>
          <input v-model="publishForm.tagsRaw" class="form-input" placeholder="如：Python,机器学习,教程" />
          <label class="form-label">发布到圈子（可选）</label>
          <select v-model="publishForm.circleId" class="form-input">
            <option :value="0">不加入任何圈子</option>
            <option v-for="c in myCircles" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="showShareMyKb = false">取消</button>
          <button class="btn-confirm" @click="doPublishKb" :disabled="publishLoading">
            {{ publishLoading ? '发布中...' : '发布' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 创建圈子弹窗 -->
    <div v-if="showCreateCircle" class="modal-overlay" @click.self="showCreateCircle = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>创建新圈子</h3>
          <button @click="showCreateCircle = false" class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <label class="form-label">圈子名称 *</label>
          <input v-model="newCircle.name" class="form-input" placeholder="如：机器学习爱好者" />
          <label class="form-label">圈子描述</label>
          <textarea v-model="newCircle.desc" class="form-input" rows="3" placeholder="介绍一下这个圈子..."></textarea>
          <label class="form-label">标签（逗号分隔）</label>
          <input v-model="newCircle.tagsRaw" class="form-input" placeholder="如：AI,研究,学术" />
          <label class="form-label">主题色</label>
          <div class="color-picker">
            <div v-for="c in circleColors" :key="c"
              :class="['color-dot', { selected: newCircle.color === c }]"
              :style="{ background: c }"
              @click="newCircle.color = c"></div>
          </div>
          <label class="form-label">加入方式</label>
          <div class="radio-group">
            <label class="radio-item"><input type="radio" v-model="newCircle.joinType" value="open" />公开（任何人可加入）</label>
            <label class="radio-item"><input type="radio" v-model="newCircle.joinType" value="invite" />仅邀请</label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="showCreateCircle = false">取消</button>
          <button class="btn-confirm" @click="createCircle" :disabled="createCircleLoading">
            {{ createCircleLoading ? '创建中...' : '创建圈子' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import ShareModal from '@/components/ShareModal.vue'
import axios from 'axios'

const router = useRouter()

// ── 当前用户（从 localStorage 读取）──────────────────────────
const currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('user_info') || '{}') } catch { return {} }
})()
const userId = currentUser.id || currentUser.email || 'anonymous'
const userName = currentUser.username || currentUser.email || '匿名用户'

// ── API 基础路径 ──────────────────────────────────────────────
const BASE = ''  // 与后端同域，直接用相对路径

// ── 状态 ──────────────────────────────────────────────
const searchKeyword = ref('')
const activeCat = ref('all')
const sortBy = ref('hot')
const viewMode = ref<'grid' | 'list'>('grid')
const activeTag = ref('')
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(false)
const totalCount = ref(0)
const page = ref(1)
const shareTarget = ref<any>(null)
const showCreateCircle = ref(false)
const showShareMyKb = ref(false)
const starredSet = ref<Set<number>>(new Set())

// ── 圈子筛选 ──────────────────────────────────────────
const activeCircleFilter = ref<any>(null)

// ── 分类 / 排序 ───────────────────────────────────────────────
const categories = [
  { id: 'all', label: '全部' },
  { id: 'tech', label: '技术' },
  { id: 'science', label: '科学' },
  { id: 'business', label: '商业' },
  { id: 'art', label: '人文艺术' },
  { id: 'medical', label: '医学' },
  { id: 'law', label: '法律' },
  { id: 'edu', label: '教育' },
]
const sortOptions = [
  { value: 'hot', label: '热度' },
  { value: 'new', label: '最新' },
  { value: 'star', label: '星标' },
  { value: 'update', label: '活跃' },
]
const hotTags = ['机器学习', 'Python', 'RAG', 'LLM', '论文', '考研', '编程', '生物', '法律']

// ── 圈子数据 ──────────────────────────────────────────────────
const hotCircles = ref<any[]>([])
const myCircles = ref<any[]>([])
const circlesLoading = ref(false)

async function loadCircles() {
  circlesLoading.value = true
  try {
    const [hotRes, myRes] = await Promise.all([
      axios.get(`/api/square/circles?page_size=8`),
      axios.get(`/api/square/my-circles?user_id=${encodeURIComponent(userId)}`),
    ])
    const myIds = new Set((myRes.data as any[]).map((c: any) => c.id))
    hotCircles.value = (hotRes.data.items as any[]).map((c: any) => ({
      ...c,
      _joined: myIds.has(c.id),
    }))
    myCircles.value = myRes.data as any[]
  } catch {
    // 网络失败时静默降级
  } finally {
    circlesLoading.value = false
  }
}

async function toggleJoin(circle: any) {
  try {
    if (circle._joined) {
      await axios.delete(`/api/square/circles/${circle.id}/join?user_id=${encodeURIComponent(userId)}`)
      circle._joined = false
      circle.member_count = Math.max(1, circle.member_count - 1)
      myCircles.value = myCircles.value.filter((c: any) => c.id !== circle.id)
      MessagePlugin.success(`已退出「${circle.name}」`)
    } else {
      await axios.post(`/api/square/circles/${circle.id}/join`, { user_id: userId })
      circle._joined = true
      circle.member_count++
      myCircles.value.push({ ...circle })
      MessagePlugin.success(`已加入「${circle.name}」`)
    }
  } catch (e: any) {
    MessagePlugin.error(e?.response?.data?.detail || '操作失败')
  }
}

function enterCircle(c: any) {
  filterByCircle(c)
}

function filterByCircle(c: any) {
  activeCircleFilter.value = c
  loadKbs(true)
}

function clearCircleFilter() {
  activeCircleFilter.value = null
  loadKbs(true)
}

// ── 圈子创建 ──────────────────────────────────────────────────
const createCircleLoading = ref(false)
const newCircle = ref({ name: '', desc: '', color: '#6366f1', joinType: 'open', tagsRaw: '' })
const circleColors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

async function createCircle() {
  if (!newCircle.value.name.trim()) { MessagePlugin.warning('请输入圈子名称'); return }
  createCircleLoading.value = true
  try {
    const tags = newCircle.value.tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    const res = await axios.post('/api/square/circles', {
      name: newCircle.value.name,
      description: newCircle.value.desc,
      color: newCircle.value.color,
      tags,
      join_type: newCircle.value.joinType,
      creator_id: userId,
      creator_name: userName,
    })
    MessagePlugin.success(`圈子「${newCircle.value.name}」创建成功！`)
    newCircle.value = { name: '', desc: '', color: '#6366f1', joinType: 'open', tagsRaw: '' }
    showCreateCircle.value = false
    await loadCircles()
  } catch (e: any) {
    MessagePlugin.error(e?.response?.data?.detail || '创建失败')
  } finally {
    createCircleLoading.value = false
  }
}

// ── 知识库列表 ────────────────────────────────────────────────
const kbList = ref<any[]>([])

async function loadKbs(reset = false) {
  if (reset) { page.value = 1; kbList.value = [] }
  loading.value = reset
  try {
    const params = new URLSearchParams({
      category: activeCat.value,
      sort: sortBy.value,
      tag: activeTag.value,
      keyword: searchKeyword.value.trim(),
      page: String(page.value),
      page_size: '12',
    })
    if (activeCircleFilter.value) params.set('circle_id', String(activeCircleFilter.value.id))

    const res = await axios.get(`/api/square/kbs?${params}`)
    const data = res.data
    if (reset) {
      kbList.value = data.items
    } else {
      kbList.value.push(...data.items)
    }
    hasMore.value = data.has_more
    totalCount.value = data.total
  } catch {
    if (reset) kbList.value = []
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loadingMore.value) return
  loadingMore.value = true
  page.value++
  await loadKbs(false)
  loadingMore.value = false
}

function doSearch() {
  loadKbs(true)
}

// ── 收藏 ──────────────────────────────────────────────────────
async function toggleStar(kb: any) {
  try {
    const res = await axios.post(`/api/square/kbs/${kb.id}/star`, { user_id: userId })
    if (res.data.starred) {
      starredSet.value.add(kb.id)
      kb.star_count++
    } else {
      starredSet.value.delete(kb.id)
      kb.star_count = Math.max(0, kb.star_count - 1)
    }
    // 触发响应式
    starredSet.value = new Set(starredSet.value)
  } catch {
    MessagePlugin.error('操作失败')
  }
}

// ── 发布知识库 ────────────────────────────────────────────────
const userKbList = ref<any[]>([])
const myKbsLoading = ref(false)
const publishLoading = ref(false)
const publishForm = ref({
  kbId: '',
  description: '',
  category: 'tech',
  tagsRaw: '',
  circleId: 0,
})

async function loadUserKbs() {
  myKbsLoading.value = true
  try {
    // 先获取用户在平台上的知识库（使用现有 API）
    const res = await axios.get('/api/list-knowledge-bases/')
    userKbList.value = res.data || []
  } catch {
    userKbList.value = []
  } finally {
    myKbsLoading.value = false
  }
}

async function doPublishKb() {
  const kb = userKbList.value.find((k: any) => k.id === publishForm.value.kbId)
  if (!kb) { MessagePlugin.warning('请选择知识库'); return }
  publishLoading.value = true
  try {
    const tags = publishForm.value.tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    await axios.post('/api/square/kbs', {
      kb_id: kb.id,
      kb_name: kb.name,
      description: publishForm.value.description,
      tags,
      category: publishForm.value.category,
      cover_color: '',
      author_id: userId,
      author_name: userName,
      circle_id: publishForm.value.circleId,
    })
    MessagePlugin.success('知识库已发布到广场！')
    publishForm.value = { kbId: '', description: '', category: 'tech', tagsRaw: '', circleId: 0 }
    showShareMyKb.value = false
    await loadKbs(true)
  } catch (e: any) {
    MessagePlugin.error(e?.response?.data?.detail || '发布失败')
  } finally {
    publishLoading.value = false
  }
}

// ── 工具函数 ──────────────────────────────────────────────────
const gradients = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
]
function getCoverGradient(id: number) { return gradients[id % gradients.length] }
function formatNum(n: number) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n) }
function isNewKb(createdAt: number) { return (Date.now() / 1000 - createdAt) < 86400 * 3 }

function openKb(kb: any) {
  // 增加浏览量（预请求，不阻塞）
  axios.get(`/api/square/kbs/${kb.id}`).catch(() => {})
  MessagePlugin.info(`已打开「${kb.kb_name}」`)
}

function openShare(kb: any) {
  shareTarget.value = kb
}

onMounted(async () => {
  await Promise.all([loadCircles(), loadKbs(true)])
  // 弹窗时预加载用户知识库
  watch(() => showShareMyKb.value, (v) => { if (v) loadUserKbs() })
})

// 需要在 script setup 内引入 watch
import { watch } from 'vue'
</script>

<style scoped>
.square-page { min-height: 100vh; background: #f4f6fb; }

/* Banner */
.square-banner {
  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #8b5cf6 100%);
  padding: 48px 40px 40px;
  color: #fff;
}
.banner-title { font-size: 32px; font-weight: 700; margin: 0 0 8px; }
.banner-sub { font-size: 15px; opacity: .85; margin: 0 0 24px; }
.banner-search {
  display: flex; align-items: center; background: rgba(255,255,255,.15);
  border: 1px solid rgba(255,255,255,.3); border-radius: 28px;
  padding: 8px 16px; max-width: 520px; gap: 8px;
  backdrop-filter: blur(8px);
}
.banner-search svg { width: 18px; height: 18px; opacity: .7; flex-shrink: 0; }
.banner-search input {
  flex: 1; background: transparent; border: none; outline: none;
  color: #fff; font-size: 14px;
}
.banner-search input::placeholder { color: rgba(255,255,255,.6); }
.banner-search button {
  background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.4);
  color: #fff; border-radius: 20px; padding: 4px 16px; cursor: pointer; font-size: 13px;
}
.banner-search button:hover { background: rgba(255,255,255,.35); }

/* Toolbar */
.square-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 40px; background: #fff; border-bottom: 1px solid #e5e7eb;
  position: sticky; top: 0; z-index: 10;
}
.cat-tabs { display: flex; gap: 0; overflow-x: auto; }
.cat-tab {
  padding: 14px 20px; cursor: pointer; font-size: 14px; color: #6b7280;
  border-bottom: 2px solid transparent; background: none; border-top: none;
  border-left: none; border-right: none; white-space: nowrap; transition: all .2s;
}
.cat-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; font-weight: 600; }
.cat-tab:hover:not(.active) { color: #374151; background: #f9fafb; }
.sort-bar { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.sort-label { font-size: 13px; color: #9ca3af; margin-right: 4px; }
.sort-btn {
  padding: 5px 12px; border-radius: 16px; font-size: 13px; cursor: pointer;
  border: 1px solid #e5e7eb; background: #fff; color: #6b7280; transition: all .2s;
}
.sort-btn.active { background: #eff6ff; color: #3b82f6; border-color: #bfdbfe; }
.sort-btn:hover:not(.active) { background: #f9fafb; }
.view-toggle {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; cursor: pointer; color: #6b7280;
}
.view-toggle svg { width: 16px; height: 16px; }
.view-toggle:hover { background: #f9fafb; }

/* Tag Row */
.tag-row {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 12px 40px; background: #fff; border-bottom: 1px solid #f0f0f0;
}
.tag-label { font-size: 13px; color: #9ca3af; }
.tag-chip {
  padding: 3px 12px; border-radius: 20px; font-size: 12px; cursor: pointer;
  background: #f3f4f6; color: #4b5563; border: 1px solid transparent; transition: all .2s;
}
.tag-chip.active { background: #eff6ff; color: #3b82f6; border-color: #bfdbfe; }
.tag-chip:hover:not(.active) { background: #e5e7eb; }

/* Body Layout */
.square-body { display: flex; gap: 24px; padding: 24px 40px; max-width: 1400px; margin: 0 auto; }

/* Aside */
.square-aside { width: 260px; flex-shrink: 0; }
.aside-section {
  background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.aside-title { font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 12px; }
.aside-empty { font-size: 13px; color: #9ca3af; text-align: center; padding: 8px 0; }
.aside-loading { font-size: 12px; color: #9ca3af; text-align: center; padding: 8px 0; }
.aside-hint { font-size: 12px; color: #9ca3af; margin: 0 0 10px; line-height: 1.5; }
.circle-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 4px; cursor: pointer;
  border-radius: 8px; transition: background .15s;
}
.circle-item:hover { background: #f9fafb; }
.circle-avatar {
  width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center;
  justify-content: center; color: #fff; font-weight: 700; font-size: 15px; flex-shrink: 0;
}
.circle-info { flex: 1; min-width: 0; }
.circle-name { font-size: 13px; font-weight: 500; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.circle-meta { font-size: 11px; color: #9ca3af; margin-top: 2px; }
.circle-join-btn {
  padding: 3px 10px; border-radius: 12px; font-size: 12px; cursor: pointer;
  border: 1px solid #3b82f6; color: #3b82f6; background: #fff; white-space: nowrap; flex-shrink: 0;
}
.circle-join-btn.joined { background: #3b82f6; color: #fff; }
.circle-join-btn:hover { opacity: .85; }
.create-circle-btn {
  width: 100%; margin-top: 12px; padding: 8px; border-radius: 8px;
  border: 1px dashed #d1d5db; background: #f9fafb; color: #6b7280; cursor: pointer; font-size: 13px;
}
.create-circle-btn:hover { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; }
.share-my-kb-btn {
  width: 100%; padding: 9px; border-radius: 8px; border: none;
  background: linear-gradient(135deg,#3b82f6,#8b5cf6); color: #fff; cursor: pointer;
  font-size: 13px; font-weight: 600; letter-spacing: .3px;
}
.share-my-kb-btn:hover { opacity: .9; }

/* 筛选提示 */
.filter-banner {
  display: flex; align-items: center; justify-content: space-between;
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;
  padding: 8px 14px; margin-bottom: 14px; font-size: 13px; color: #2563eb;
}
.filter-banner button {
  background: none; border: none; cursor: pointer; color: #6b7280; font-size: 13px;
}
.filter-banner button:hover { color: #ef4444; }

/* Main */
.square-main { flex: 1; min-width: 0; }
.kb-flow.grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px;
}
.kb-flow.list { display: flex; flex-direction: column; gap: 12px; }

/* 卡片 */
.kb-card {
  background: #fff; border-radius: 12px; overflow: hidden; cursor: pointer;
  transition: transform .2s, box-shadow .2s; box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.kb-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.12); }
.kb-flow.list .kb-card { display: flex; flex-direction: row; height: 100px; }

/* Cover */
.kb-cover {
  height: 130px; position: relative; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.kb-flow.list .kb-cover { width: 140px; flex-shrink: 0; height: 100%; }
.kb-cover-text { font-size: 40px; font-weight: 800; color: rgba(255,255,255,.8); }
.kb-cover-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,.4);
  display: flex; align-items: center; justify-content: center; gap: 8px;
  opacity: 0; transition: opacity .2s;
}
.kb-card:hover .kb-cover-overlay { opacity: 1; }
.overlay-btn {
  padding: 6px 16px; border-radius: 20px; font-size: 13px; cursor: pointer;
  background: #fff; color: #1f2937; border: none; font-weight: 500;
}
.overlay-btn.secondary { background: rgba(255,255,255,.2); color: #fff; border: 1px solid rgba(255,255,255,.6); }

/* Info */
.kb-info { padding: 12px; flex: 1; min-width: 0; }
.kb-title-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.kb-name { font-size: 14px; font-weight: 600; color: #1f2937; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hot-badge { font-size: 10px; background: #fef2f2; color: #ef4444; border-radius: 4px; padding: 1px 5px; flex-shrink: 0; }
.new-badge { font-size: 10px; background: #f0fdf4; color: #16a34a; border-radius: 4px; padding: 1px 5px; flex-shrink: 0; }
.kb-desc { font-size: 12px; color: #6b7280; line-height: 1.5; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.kb-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.kb-tag { font-size: 11px; color: #3b82f6; background: #eff6ff; border-radius: 4px; padding: 1px 6px; }
.kb-footer { display: flex; align-items: center; justify-content: space-between; }
.kb-author { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6b7280; }
.author-avatar { width: 20px; height: 20px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #6b7280; }
.kb-stats { display: flex; gap: 8px; }
.stat-item { font-size: 11px; color: #9ca3af; }
.stat-item.starred { color: #f59e0b; }

/* 骨架屏 */
.skeleton-card { pointer-events: none; }
.skeleton-cover { height: 130px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
.skeleton-line { height: 12px; border-radius: 6px; margin: 8px 12px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.w-3-4 { width: 75%; } .w-1-2 { width: 50%; }

/* 加载更多 */
.load-more-row { text-align: center; margin-top: 24px; }
.load-more-btn { padding: 10px 32px; border-radius: 24px; border: 1px solid #d1d5db; background: #fff; color: #374151; font-size: 14px; cursor: pointer; transition: all .2s; }
.load-more-btn:hover:not(:disabled) { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; }
.load-more-btn:disabled { opacity: .5; }
.no-more-hint { text-align: center; margin-top: 20px; font-size: 12px; color: #d1d5db; padding: 8px 0; }

/* 空状态 */
.empty-state { text-align: center; padding: 80px 0; color: #9ca3af; }
.empty-icon { font-size: 56px; margin-bottom: 16px; }
.empty-hint { font-size: 13px; margin-top: 4px; }
.empty-action-btn {
  margin-top: 16px; padding: 10px 28px; border-radius: 24px; border: none;
  background: #3b82f6; color: #fff; cursor: pointer; font-size: 14px; font-weight: 500;
}
.empty-action-btn:hover { background: #2563eb; }
.mini-loading { font-size: 13px; color: #9ca3af; padding: 8px 0; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 1000; display: flex; align-items: center; justify-content: center; }
.modal-card { background: #fff; border-radius: 16px; padding: 24px; width: 440px; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.2); }
.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.modal-header h3 { font-size: 18px; font-weight: 600; margin: 0; }
.modal-close { background: none; border: none; cursor: pointer; font-size: 18px; color: #6b7280; }
.modal-body { display: flex; flex-direction: column; gap: 12px; }
.modal-footer { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
.form-label { font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 4px; display: block; }
.form-input { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; }
.form-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.1); }
.color-picker { display: flex; gap: 8px; flex-wrap: wrap; }
.color-dot { width: 28px; height: 28px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: transform .15s; }
.color-dot.selected { border-color: #1f2937; transform: scale(1.15); }
.radio-group { display: flex; flex-direction: column; gap: 8px; }
.radio-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #374151; cursor: pointer; }
.btn-cancel { padding: 8px 20px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; color: #374151; cursor: pointer; font-size: 14px; }
.btn-confirm { padding: 8px 20px; border-radius: 8px; border: none; background: #3b82f6; color: #fff; cursor: pointer; font-size: 14px; font-weight: 500; }
.btn-confirm:hover:not(:disabled) { background: #2563eb; }
.btn-confirm:disabled { opacity: .6; }
</style>
