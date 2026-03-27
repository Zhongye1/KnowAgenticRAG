<template>
  <main class="kb-page">
    <!-- 顶部欢迎区域 -->
    <div class="kb-header">
      <div class="kb-header__left">
        <h1 class="kb-title">知识库</h1>
        <p class="kb-subtitle">管理和检索你的所有知识内容</p>
      </div>
      <div class="kb-header__right">
        <!-- 搜索框 -->
        <div class="kb-search-wrapper">
          <svg class="kb-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜索知识库..."
            class="kb-search-input"
            @input="handleSearch"
          />
          <button v-if="searchKeyword" class="kb-search-clear" @click="searchKeyword = ''; handleSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <!-- 去广场按钮 -->
        <button class="kb-square-btn" @click="$router.push('/square')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          知识广场
        </button>
        <!-- 新建按钮 -->
        <button class="kb-create-btn" @click="toggleUploadModal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" d="M12 4v16m8-8H4"/>
          </svg>
          新建知识库
        </button>
      </div>
    </div>

    <!-- 创建知识库弹窗 -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>新建知识库</h3>
          <button class="modal-close" @click="showCreateModal = false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <label class="modal-label">知识库名称</label>
          <input
            type="text" v-model="kbName"
            placeholder="输入知识库名称..."
            class="modal-input"
            @keydown.enter="createKnowledgeBase"
          />
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="showCreateModal = false">取消</button>
          <button class="btn-confirm" @click="createKnowledgeBase" :disabled="!kbName.trim()">创建</button>
        </div>
      </div>
    </div>

    <!-- 搜索状态 -->
    <div v-if="isSearching" class="kb-section">
      <div class="kb-section__header">
        <span class="kb-section__title">搜索结果</span>
        <span class="kb-section__count">{{ filteredCards.length }} 个知识库</span>
      </div>
      <div v-if="filteredCards.length > 0" class="kb-grid">
        <KbCard
          v-for="card in filteredCards" :key="card.id"
          :card="card"
          :starred="starredIds.has(card.id)"
          :pinned="pinnedIds.has(card.id)"
          @click="goToDetail(card.id)"
          @star="toggleStar(card.id)"
          @pin="togglePin(card.id)"
          @delete="deleteCard(card)"
        />
      </div>
      <div v-else class="kb-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
        </svg>
        <p>没有找到 "{{ searchKeyword }}" 相关知识库</p>
      </div>
    </div>

    <template v-else>
      <!-- 星标知识库 -->
      <div v-if="starredCards.length > 0" class="kb-section">
        <div class="kb-section__header">
          <span class="kb-section__title">
            <svg viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.5">
              <path stroke-linecap="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
            星标知识库
          </span>
          <span class="kb-section__count">{{ starredCards.length }}</span>
        </div>
        <div class="kb-grid">
          <KbCard
            v-for="card in starredCards" :key="card.id"
            :card="card"
            :starred="true"
            :pinned="pinnedIds.has(card.id)"
            @click="goToDetail(card.id)"
            @star="toggleStar(card.id)"
            @pin="togglePin(card.id)"
            @delete="deleteCard(card)"
          />
        </div>
      </div>

      <!-- 最近访问 -->
      <div v-if="recentCards.length > 0" class="kb-section">
        <div class="kb-section__header">
          <span class="kb-section__title">
            <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
              <path stroke-linecap="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            最近访问
          </span>
          <span class="kb-section__count">{{ recentCards.length }}</span>
        </div>
        <div class="kb-grid kb-grid--compact">
          <KbCard
            v-for="card in recentCards" :key="card.id"
            :card="card"
            :starred="starredIds.has(card.id)"
            :pinned="pinnedIds.has(card.id)"
            compact
            @click="goToDetail(card.id)"
            @star="toggleStar(card.id)"
            @pin="togglePin(card.id)"
            @delete="deleteCard(card)"
          />
        </div>
      </div>

      <!-- 全部知识库 -->
      <div class="kb-section">
        <div class="kb-section__header">
          <span class="kb-section__title">
            <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
              <path stroke-linecap="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
            </svg>
            全部知识库
          </span>
          <div style="display:flex;align-items:center;gap:10px;">
            <span v-if="isDragMode" class="kb-drag-hint">拖拽排序中 · 松手完成</span>
            <button class="kb-drag-toggle" :class="{ active: isDragMode }" @click="isDragMode = !isDragMode" title="拖拽排序">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" d="M4 8h16M4 12h16M4 16h16"/>
              </svg>
              {{ isDragMode ? '完成排序' : '排序' }}
            </button>
            <span class="kb-section__count">{{ sortableCards.length }}</span>
          </div>
        </div>

        <div v-if="cardDataStore.loading" class="kb-loading">
          <div class="kb-spinner"></div>
          <span>加载知识库...</span>
        </div>
        <div
          v-else-if="sortableCards.length > 0"
          class="kb-grid"
          :class="{ 'kb-grid--drag': isDragMode }"
        >
          <div
            v-for="(card, index) in sortableCards"
            :key="card.id"
            class="kb-drag-wrapper"
            :class="{
              'kb-drag-wrapper--draggable': isDragMode,
              'kb-drag-wrapper--dragging': dragIndex === index,
              'kb-drag-wrapper--over': dragOverIndex === index && dragIndex !== index,
            }"
            :draggable="isDragMode"
            @dragstart="onDragStart($event, index)"
            @dragover.prevent="onDragOver($event, index)"
            @dragleave="onDragLeave"
            @drop="onDrop($event, index)"
            @dragend="onDragEnd"
          >
            <!-- 拖拽模式下的抓手图标 -->
            <div v-if="isDragMode" class="kb-drag-handle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/>
                <circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
                <circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
              </svg>
            </div>
            <KbCard
              :card="card"
              :starred="starredIds.has(card.id)"
              :pinned="pinnedIds.has(card.id)"
              @click="isDragMode ? undefined : goToDetail(card.id)"
              @star="toggleStar(card.id)"
              @pin="togglePin(card.id)"
              @delete="deleteCard(card)"
            />
          </div>
          <!-- 结束占位符 -->
          <div class="kb-card-end">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p>Nothing more</p>
          </div>
        </div>
        <div v-else class="kb-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
          <p>还没有知识库，点击右上角创建一个吧</p>
        </div>
      </div>
    </template>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import axios from 'axios';
import { useCardDataStore } from '../../store';
import { storeToRefs } from 'pinia';
import KbCard from '@/components/knowledge-unit/KbCard.vue';

const router = useRouter();
const cardDataStore = useCardDataStore();
const { allCards, filteredCards } = storeToRefs(cardDataStore);

// 搜索
const searchKeyword = ref('');
const isSearching = computed(() => searchKeyword.value.trim() !== '');
const handleSearch = () => {
  cardDataStore.filterCardData(searchKeyword.value);
};

// 导航
const goToDetail = (id: string) => {
  // 记录最近访问
  recordRecent(id);
  router.push(`/knowledge/knowledgeDetail/${id}`);
};

// ======= 星标功能（localStorage持久化） =======
const STAR_KEY = 'kb_starred_ids';
const RECENT_KEY = 'kb_recent_ids';
const PIN_KEY = 'kb_pinned_ids';

const starredIds = ref<Set<string>>(new Set());
const recentIds = ref<string[]>([]);
const pinnedIds = ref<Set<string>>(new Set());

const loadStarred = () => {
  try {
    const raw = localStorage.getItem(STAR_KEY);
    starredIds.value = new Set(raw ? JSON.parse(raw) : []);
  } catch { starredIds.value = new Set(); }
};

const loadRecent = () => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    recentIds.value = raw ? JSON.parse(raw) : [];
  } catch { recentIds.value = []; }
};

const loadPinned = () => {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    pinnedIds.value = new Set(raw ? JSON.parse(raw) : []);
  } catch { pinnedIds.value = new Set(); }
};

const toggleStar = (id: string) => {
  if (starredIds.value.has(id)) {
    starredIds.value.delete(id);
    MessagePlugin.info('已取消星标');
  } else {
    starredIds.value.add(id);
    MessagePlugin.success('已加入星标');
  }
  localStorage.setItem(STAR_KEY, JSON.stringify([...starredIds.value]));
};

const togglePin = (id: string) => {
  const s = new Set(pinnedIds.value);
  if (s.has(id)) {
    s.delete(id);
    MessagePlugin.info('已取消置顶');
  } else {
    s.add(id);
    MessagePlugin.success('已置顶');
  }
  pinnedIds.value = s;
  localStorage.setItem(PIN_KEY, JSON.stringify([...s]));
};

const recordRecent = (id: string) => {
  const list = [id, ...recentIds.value.filter(i => i !== id)].slice(0, 6);
  recentIds.value = list;
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
};

const starredCards = computed(() =>
  allCards.value.filter(c => starredIds.value.has(c.id))
);

const recentCards = computed(() => {
  const MAX = 6;
  return recentIds.value
    .map(id => allCards.value.find(c => c.id === id))
    .filter(Boolean)
    .slice(0, MAX) as any[];
});

// ======= 创建知识库 =======
const showCreateModal = ref(false);
const kbName = ref('');

const toggleUploadModal = () => {
  showCreateModal.value = true;
  kbName.value = '';
};

const createKnowledgeBase = async () => {
  if (!kbName.value.trim()) return;
  try {
    const formData = new FormData();
    formData.append('kbName', kbName.value);
    // 写入 owner_id，绑定到当前登录用户
    const userInfo = (() => { try { return JSON.parse(localStorage.getItem('user_info') || '{}') } catch { return {} } })()
    const ownerId = userInfo.id || userInfo.email || ''
    if (ownerId) formData.append('owner_id', ownerId)
    await axios.post('/api/create-knowledgebase/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    MessagePlugin.success('知识库 "' + kbName.value + '" 创建成功');
    kbName.value = '';
    showCreateModal.value = false;
    await cardDataStore.fetchCards();
  } catch (error: any) {
    if (error.response?.status === 400) {
      MessagePlugin.error('知识库已存在');
    } else {
      MessagePlugin.error('创建失败，请稍后重试');
    }
  }
};

// ======= 删除知识库 =======
const deleteCard = async (card: any) => {
  try {
    await axios.delete(`/api/delete-knowledgebase/${card.id}`);
    MessagePlugin.success(`知识库「${card.title}」已删除`);
    // 从星标/最近移除
    starredIds.value.delete(card.id);
    recentIds.value = recentIds.value.filter(id => id !== card.id);
    localStorage.setItem(STAR_KEY, JSON.stringify([...starredIds.value]));
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds.value));
    await cardDataStore.fetchCards();
  } catch {
    MessagePlugin.error('删除失败');
  }
};

onMounted(async () => {
  loadStarred();
  loadRecent();
  loadPinned();
  await cardDataStore.fetchCards();
});

// ======= 拖拽排序 =======
const DRAG_ORDER_KEY = 'kb_card_order';
const isDragMode = ref(false);
const dragIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

// 可拖拽的知识库列表（持久化自定义顺序）
const customOrder = ref<string[]>([]);

const loadOrder = () => {
  try {
    const raw = localStorage.getItem(DRAG_ORDER_KEY);
    customOrder.value = raw ? JSON.parse(raw) : [];
  } catch { customOrder.value = []; }
};

const saveOrder = () => {
  localStorage.setItem(DRAG_ORDER_KEY, JSON.stringify(customOrder.value.map(id => id)));
};

// 按自定义顺序排列的卡片列表（置顶优先）
const sortableCards = computed(() => {
  const cards = [...allCards.value];
  if (customOrder.value.length === 0) {
    return cards.sort((a, b) => {
      const ap = pinnedIds.value.has(a.id) ? 1 : 0;
      const bp = pinnedIds.value.has(b.id) ? 1 : 0;
      return bp - ap;
    });
  }
  const orderMap = new Map(customOrder.value.map((id, i) => [id, i]));
  return cards.sort((a, b) => {
    const ap = pinnedIds.value.has(a.id) ? 1 : 0;
    const bp = pinnedIds.value.has(b.id) ? 1 : 0;
    if (bp !== ap) return bp - ap;
    const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
    const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
    return ai - bi;
  });
});

// 当 allCards 变化时同步更新 customOrder（新增的卡片追加到末尾）
watch(allCards, (newCards) => {
  const newIds = newCards.map(c => c.id);
  const existing = new Set(customOrder.value);
  const appended = newIds.filter(id => !existing.has(id));
  if (appended.length > 0) {
    customOrder.value = [
      ...customOrder.value.filter(id => newIds.includes(id)),
      ...appended,
    ];
    saveOrder();
  }
}, { immediate: true });

const onDragStart = (_e: DragEvent, index: number) => {
  dragIndex.value = index;
};

const onDragOver = (_e: DragEvent, index: number) => {
  dragOverIndex.value = index;
};

const onDragLeave = () => {
  dragOverIndex.value = null;
};

const onDrop = (_e: DragEvent, dropIndex: number) => {
  if (dragIndex.value === null || dragIndex.value === dropIndex) return;
  const cards = [...sortableCards.value];
  const [moved] = cards.splice(dragIndex.value, 1);
  cards.splice(dropIndex, 0, moved);
  customOrder.value = cards.map(c => c.id);
  saveOrder();
  dragIndex.value = null;
  dragOverIndex.value = null;
};

const onDragEnd = () => {
  dragIndex.value = null;
  dragOverIndex.value = null;
};

// 初始化时加载顺序
loadOrder();
</script>

<style scoped>
.kb-page {
  height: 100vh;
  overflow-y: auto;
  padding: 28px 32px;
  background: #f9fafb;
  scrollbar-width: thin;
}

/* ===== 顶部 ===== */
.kb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
  flex-wrap: wrap;
  gap: 16px;
}

.kb-title {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.kb-subtitle {
  font-size: 13px;
  color: #9ca3af;
  margin: 3px 0 0;
}

.kb-header__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 搜索框 */
.kb-search-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 7px 12px;
  width: 220px;
  transition: all 0.2s;
}

.kb-search-wrapper:focus-within {
  border-color: #4f7ef8;
  box-shadow: 0 0 0 3px rgba(79,126,248,0.1);
  width: 280px;
}

.kb-search-icon {
  width: 16px;
  height: 16px;
  color: #9ca3af;
  flex-shrink: 0;
}

.kb-search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  color: #111827;
  background: transparent;
  min-width: 0;
}

.kb-search-input::placeholder { color: #9ca3af; }

.kb-search-clear {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #9ca3af;
  padding: 0;
  display: flex;
  align-items: center;
}
.kb-search-clear svg { width: 14px; height: 14px; }

/* 广场按钮 */
.kb-square-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: #fff;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.kb-square-btn:hover {
  border-color: #3b82f6;
  color: #3b82f6;
  background: #eff6ff;
}
.kb-square-btn svg { width: 16px; height: 16px; }

/* 新建按钮 */
.kb-create-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #4f7ef8, #6366f1);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.kb-create-btn:hover {
  background: linear-gradient(135deg, #3b6de8, #5355e0);
  box-shadow: 0 4px 12px rgba(79,126,248,0.3);
}
.kb-create-btn svg { width: 16px; height: 16px; }

/* ===== 弹窗 ===== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-card {
  background: white;
  border-radius: 14px;
  width: 400px;
  max-width: 92vw;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #f0f0f0;
}
.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0;
}
.modal-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #9ca3af;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-close:hover { background: #f3f4f6; color: #374151; }
.modal-close svg { width: 16px; height: 16px; }

.modal-body { padding: 16px 24px; }
.modal-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
}
.modal-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}
.modal-input:focus {
  border-color: #4f7ef8;
  box-shadow: 0 0 0 3px rgba(79,126,248,0.1);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px 20px;
}
.btn-cancel {
  padding: 8px 18px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  color: #6b7280;
  font-size: 13.5px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-cancel:hover { background: #f9fafb; }
.btn-confirm {
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  background: #4f7ef8;
  color: white;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-confirm:hover:not(:disabled) { background: #3b6de8; }
.btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

/* ===== 区块 ===== */
.kb-section {
  margin-bottom: 32px;
}

.kb-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.kb-section__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}
.kb-section__title svg {
  width: 16px;
  height: 16px;
}

.kb-section__count {
  font-size: 12px;
  color: #9ca3af;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 10px;
}

/* ===== 网格 ===== */
.kb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.kb-grid--compact {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

/* ===== 结束占位符 ===== */
.kb-card-end {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  border: 2px dashed #e5e7eb;
  border-radius: 12px;
  color: #9ca3af;
}
.kb-card-end svg {
  width: 32px;
  height: 32px;
  margin-bottom: 8px;
  opacity: 0.5;
}
.kb-card-end p {
  font-size: 12px;
}

/* ===== 空状态 ===== */
.kb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #9ca3af;
  gap: 12px;
}
.kb-empty svg {
  width: 48px;
  height: 48px;
  opacity: 0.4;
}
.kb-empty p {
  font-size: 14px;
}

/* ===== 加载 ===== */
.kb-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: #9ca3af;
  font-size: 14px;
}

.kb-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e5e7eb;
  border-top-color: #4f7ef8;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .kb-page { padding: 16px; }
  .kb-grid { grid-template-columns: 1fr; }
  .kb-search-wrapper { width: 160px; }
  .kb-search-wrapper:focus-within { width: 190px; }
}

/* ===== 拖拽排序 ===== */
.kb-drag-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  color: #6b7280;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.kb-drag-toggle:hover { background: #f3f4f6; color: #374151; }
.kb-drag-toggle.active {
  background: #eef2ff;
  border-color: #4f7ef8;
  color: #4f7ef8;
}
.kb-drag-toggle svg { width: 14px; height: 14px; }

.kb-drag-hint {
  font-size: 11px;
  color: #4f7ef8;
  background: #eef2ff;
  padding: 2px 8px;
  border-radius: 4px;
  animation: pulse-hint 1.5s ease-in-out infinite;
}
@keyframes pulse-hint {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.kb-grid--drag {
  cursor: default;
}

.kb-drag-wrapper {
  position: relative;
}

.kb-drag-wrapper--draggable {
  cursor: grab;
  transition: transform 0.15s, box-shadow 0.15s;
}
.kb-drag-wrapper--draggable:hover { transform: translateY(-2px); }
.kb-drag-wrapper--draggable:active { cursor: grabbing; }

.kb-drag-wrapper--dragging {
  opacity: 0.4;
  transform: scale(0.97);
}

.kb-drag-wrapper--over::before {
  content: '';
  position: absolute;
  inset: -3px;
  border: 2px dashed #4f7ef8;
  border-radius: 14px;
  z-index: 1;
  pointer-events: none;
  background: rgba(79,126,248,0.04);
}

.kb-drag-handle {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.9);
  border-radius: 6px;
  color: #9ca3af;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  cursor: grab;
}
.kb-drag-handle svg { width: 14px; height: 14px; }

</style>
