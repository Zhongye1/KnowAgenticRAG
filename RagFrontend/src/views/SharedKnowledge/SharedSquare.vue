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
          @click="activeCat = cat.id; loadKbs()"
        >{{ cat.label }}</button>
      </div>
      <div class="sort-bar">
        <span class="sort-label">排序：</span>
        <button v-for="s in sortOptions" :key="s.value"
          :class="['sort-btn', { active: sortBy === s.value }]"
          @click="sortBy = s.value; loadKbs()">{{ s.label }}</button>
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
        @click="activeTag = activeTag === tag ? '' : tag; loadKbs()">
        #{{ tag }}
      </span>
    </div>

    <!-- 内容区 -->
    <div class="square-body">
      <!-- 左侧：推荐圈子 -->
      <aside class="square-aside">
        <div class="aside-section">
          <h3 class="aside-title">🔥 热门圈子</h3>
          <div v-for="circle in hotCircles" :key="circle.id" class="circle-item" @click="enterCircle(circle)">
            <div class="circle-avatar" :style="{ background: circle.color }">{{ circle.name[0] }}</div>
            <div class="circle-info">
              <div class="circle-name">{{ circle.name }}</div>
              <div class="circle-meta">{{ circle.memberCount }} 成员 · {{ circle.kbCount }} 知识库</div>
            </div>
            <button class="circle-join-btn" :class="{ joined: circle.joined }" @click.stop="toggleJoin(circle)">
              {{ circle.joined ? '已加入' : '+ 加入' }}
            </button>
          </div>
        </div>
        <div class="aside-section">
          <h3 class="aside-title">📌 我的圈子</h3>
          <div v-if="myCircles.length === 0" class="aside-empty">还未加入任何圈子</div>
          <div v-for="c in myCircles" :key="c.id" class="circle-item" @click="enterCircle(c)">
            <div class="circle-avatar" :style="{ background: c.color }">{{ c.name[0] }}</div>
            <div class="circle-info">
              <div class="circle-name">{{ c.name }}</div>
              <div class="circle-meta">{{ c.memberCount }} 成员</div>
            </div>
          </div>
          <button class="create-circle-btn" @click="showCreateCircle = true">+ 创建圈子</button>
        </div>
      </aside>

      <!-- 主内容：知识库卡片流 -->
      <main class="square-main">
        <!-- 骨架屏 -->
        <div v-if="loading" :class="['kb-flow', viewMode]">
          <div v-for="i in 8" :key="i" class="kb-card skeleton-card">
            <div class="skeleton-cover"></div>
            <div class="skeleton-line w-3/4"></div>
            <div class="skeleton-line w-1/2"></div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else-if="kbList.length === 0" class="empty-state">
          <div class="empty-icon">📚</div>
          <p>暂无知识库</p>
          <p class="empty-hint">成为第一个发布者！</p>
        </div>

        <!-- 知识库卡片流 -->
        <div v-else :class="['kb-flow', viewMode]">
          <div v-for="kb in kbList" :key="kb.id" class="kb-card" @click="openKb(kb)">
            <!-- 封面 -->
            <div class="kb-cover" :style="{ background: kb.coverColor || getCoverGradient(kb.id) }">
              <img v-if="kb.coverUrl" :src="kb.coverUrl" alt="封面" />
              <div v-else class="kb-cover-text">{{ kb.name[0] }}</div>
              <!-- 悬浮操作 -->
              <div class="kb-cover-overlay">
                <button class="overlay-btn" @click.stop="openKb(kb)">打开</button>
                <button class="overlay-btn secondary" @click.stop="openShare(kb)">分享</button>
              </div>
            </div>
            <!-- 信息 -->
            <div class="kb-info">
              <div class="kb-title-row">
                <span class="kb-name">{{ kb.name }}</span>
                <span v-if="kb.isHot" class="hot-badge">🔥热</span>
                <span v-if="kb.isNew" class="new-badge">NEW</span>
              </div>
              <p class="kb-desc">{{ kb.description || '暂无描述' }}</p>
              <div class="kb-tags">
                <span v-for="tag in (kb.tags || []).slice(0,3)" :key="tag" class="kb-tag">#{{ tag }}</span>
              </div>
              <div class="kb-footer">
                <div class="kb-author">
                  <div class="author-avatar">{{ (kb.authorName || '?')[0] }}</div>
                  <span>{{ kb.authorName || '匿名' }}</span>
                </div>
                <div class="kb-stats">
                  <span class="stat-item">👁 {{ formatNum(kb.viewCount) }}</span>
                  <span class="stat-item">⭐ {{ formatNum(kb.starCount) }}</span>
                  <span class="stat-item">🔀 {{ formatNum(kb.forkCount) }}</span>
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
      </main>
    </div>

    <!-- 分享弹窗 -->
    <ShareModal v-if="shareTarget" :kb="shareTarget" @close="shareTarget = null" />

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
          <button class="btn-confirm" @click="createCircle">创建圈子</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import ShareModal from '@/components/ShareModal.vue'

const router = useRouter()

// ── 状态 ──────────────────────────────────────────────
const searchKeyword = ref('')
const activeCat = ref('all')
const sortBy = ref('hot')
const viewMode = ref<'grid' | 'list'>('grid')
const activeTag = ref('')
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)
const page = ref(1)
const shareTarget = ref<any>(null)
const showCreateCircle = ref(false)

const newCircle = ref({ name: '', desc: '', color: '#6366f1', joinType: 'open' })
const circleColors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

// ── 分类 / 排序 ───────────────────────────────────────
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

// ── 圈子数据 ──────────────────────────────────────────
const hotCircles = ref([
  { id: 1, name: 'AI研究者', color: '#6366f1', memberCount: 1204, kbCount: 89, joined: false },
  { id: 2, name: '考研共学', color: '#10b981', memberCount: 3560, kbCount: 212, joined: true },
  { id: 3, name: '法律人社区', color: '#f59e0b', memberCount: 867, kbCount: 134, joined: false },
  { id: 4, name: '医学笔记圈', color: '#ef4444', memberCount: 2109, kbCount: 98, joined: false },
])
const myCircles = computed(() => hotCircles.value.filter(c => c.joined))

// ── 知识库列表 ────────────────────────────────────────
const kbList = ref<any[]>([])

function generateMockKbs(offset = 0) {
  const names = ['深度学习笔记', 'Python进阶指南', '考研数学宝典', '临床医学手册', '法律法规汇编',
    '机器学习算法', 'RAG实战指南', '前端开发精华', '量子计算基础', '经济学原理', '英语学习资料', '历史文献汇总']
  const authors = ['张明远', 'Alice Chen', '李研究员', 'GPT工程师', '知识达人', '学术小分队']
  const tagSets = [['AI','机器学习','深度学习'], ['Python','编程','开发'], ['考研','数学','复习'],
    ['医学','临床','笔记'], ['法律','法规','合规'], ['RAG','LLM','向量检索']]
  return Array.from({ length: 8 }, (_, i) => {
    const idx = (offset + i) % names.length
    return {
      id: offset + i + 1,
      name: names[idx],
      description: `这是一个关于${names[idx]}的优质知识库，包含系统整理的学习资料和研究笔记。`,
      authorName: authors[idx % authors.length],
      coverColor: null,
      tags: tagSets[idx % tagSets.length],
      viewCount: Math.floor(Math.random() * 9000) + 100,
      starCount: Math.floor(Math.random() * 500) + 10,
      forkCount: Math.floor(Math.random() * 100),
      isHot: Math.random() > 0.7,
      isNew: offset === 0 && i < 2,
    }
  })
}

async function loadKbs() {
  loading.value = true
  page.value = 1
  await new Promise(r => setTimeout(r, 400))
  kbList.value = generateMockKbs(0)
  hasMore.value = true
  loading.value = false
}

async function loadMore() {
  if (loadingMore.value) return
  loadingMore.value = true
  await new Promise(r => setTimeout(r, 500))
  const more = generateMockKbs(page.value * 8)
  kbList.value.push(...more)
  page.value++
  if (page.value >= 3) hasMore.value = false
  loadingMore.value = false
}

function doSearch() {
  if (!searchKeyword.value.trim()) return
  MessagePlugin.info(`搜索：${searchKeyword.value}`)
  loadKbs()
}

// ── 工具函数 ──────────────────────────────────────────
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

function openKb(kb: any) {
  router.push(`/shared/${kb.id}`)
}
function openShare(kb: any) {
  shareTarget.value = kb
}
function enterCircle(c: any) {
  MessagePlugin.info(`进入圈子：${c.name}`)
}
function toggleJoin(circle: any) {
  circle.joined = !circle.joined
  MessagePlugin.success(circle.joined ? `已加入「${circle.name}」` : `已退出「${circle.name}」`)
}
function createCircle() {
  if (!newCircle.value.name.trim()) { MessagePlugin.warning('请输入圈子名称'); return }
  hotCircles.value.push({
    id: Date.now(),
    name: newCircle.value.name,
    color: newCircle.value.color,
    memberCount: 1,
    kbCount: 0,
    joined: true,
  })
  MessagePlugin.success(`圈子「${newCircle.value.name}」创建成功！`)
  newCircle.value = { name: '', desc: '', color: '#6366f1', joinType: 'open' }
  showCreateCircle.value = false
}

onMounted(() => { loadKbs() })
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
.cat-tabs { display: flex; gap: 0; }
.cat-tab {
  padding: 14px 20px; cursor: pointer; font-size: 14px; color: #6b7280;
  border-bottom: 2px solid transparent; background: none; border-top: none; border-left: none; border-right: none;
  transition: all .2s;
}
.cat-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; font-weight: 600; }
.cat-tab:hover:not(.active) { color: #374151; background: #f9fafb; }
.sort-bar { display: flex; align-items: center; gap: 4px; }
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
.kb-cover img { width: 100%; height: 100%; object-fit: cover; }
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
.kb-info { padding: 12px; }
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

/* 骨架屏 */
.skeleton-card { pointer-events: none; }
.skeleton-cover { height: 130px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
.skeleton-line { height: 12px; border-radius: 6px; margin: 8px 0; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
.w-3\/4 { width: 75%; } .w-1\/2 { width: 50%; }

/* 加载更多 */
.load-more-row { text-align: center; margin-top: 24px; }
.load-more-btn { padding: 10px 32px; border-radius: 24px; border: 1px solid #d1d5db; background: #fff; color: #374151; font-size: 14px; cursor: pointer; transition: all .2s; }
.load-more-btn:hover:not(:disabled) { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; }
.load-more-btn:disabled { opacity: .5; }

/* 空状态 */
.empty-state { text-align: center; padding: 80px 0; color: #9ca3af; }
.empty-icon { font-size: 56px; margin-bottom: 16px; }
.empty-hint { font-size: 13px; margin-top: 4px; }

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
.btn-confirm:hover { background: #2563eb; }
</style>
