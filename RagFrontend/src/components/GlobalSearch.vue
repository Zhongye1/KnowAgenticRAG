<template>
  <teleport to="body">
    <transition name="search-overlay">
      <div v-if="visible" class="search-overlay" @click.self="close">
        <transition name="search-modal">
          <div v-if="visible" class="search-modal">
            <!-- 搜索输入框 -->
            <div class="search-input-wrapper">
              <svg class="search-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                ref="inputRef"
                v-model="query"
                type="text"
                placeholder="搜索知识库、对话、文件..."
                class="search-input"
                @keydown.esc="close"
                @keydown.enter="doSearch"
                @input="onInput"
                @keydown.up.prevent="moveSelection(-1)"
                @keydown.down.prevent="moveSelection(1)"
              />
              <button v-if="query" class="search-clear" @click="query = ''; results = []">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
              <kbd class="search-esc">ESC</kbd>
            </div>

            <!-- 搜索结果 -->
            <div class="search-body">
              <!-- 加载中 -->
              <div v-if="searching" class="search-loading">
                <div class="search-spinner"></div>
                <span>搜索中...</span>
              </div>

              <!-- 搜索结果列表 -->
              <div v-else-if="results.length > 0" class="search-results">
                <div
                  v-for="(item, idx) in results"
                  :key="idx"
                  :class="['search-result-item', { 'search-result-item--selected': selectedIndex === idx }]"
                  @click="selectResult(item)"
                  @mouseenter="selectedIndex = idx"
                >
                  <div class="result-icon" :class="`result-icon--${item.type}`">
                    <span v-html="getTypeIcon(item.type)"></span>
                  </div>
                  <div class="result-content">
                    <div class="result-title" v-html="highlightQuery(item.title)"></div>
                    <div class="result-desc">{{ item.desc }}</div>
                  </div>
                  <div class="result-type-tag">{{ getTypeLabel(item.type) }}</div>
                </div>
              </div>

              <!-- 无结果 -->
              <div v-else-if="query.length > 0 && !searching" class="search-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
                </svg>
                <p>没有找到 "<strong>{{ query }}</strong>" 相关内容</p>
              </div>

              <!-- 默认提示 -->
              <div v-else class="search-tips">
                <div class="search-tips-title">快速跳转</div>
                <div class="search-tips-list">
                  <button v-for="tip in quickLinks" :key="tip.path" class="search-tip-item" @click="navigateTo(tip.path)">
                    <span class="tip-icon" v-html="tip.icon"></span>
                    <span>{{ tip.label }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- 底部快捷键提示 -->
            <div class="search-footer">
              <span><kbd>↑↓</kbd> 导航</span>
              <span><kbd>Enter</kbd> 确认</span>
              <span><kbd>ESC</kbd> 关闭</span>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits(['close']);

const router = useRouter();
const inputRef = ref<HTMLInputElement>();
const query = ref('');
const results = ref<any[]>([]);
const searching = ref(false);
const selectedIndex = ref(0);
let searchTimer: ReturnType<typeof setTimeout>;

const close = () => emit('close');

const navigateTo = (path: string) => {
  router.push(path);
  close();
};

// 监听visible，打开时聚焦
watch(() => props.visible, async (val) => {
  if (val) {
    query.value = '';
    results.value = [];
    selectedIndex.value = 0;
    await nextTick();
    inputRef.value?.focus();
  }
});

// 防抖搜索
const onInput = () => {
  clearTimeout(searchTimer);
  if (!query.value.trim()) {
    results.value = [];
    return;
  }
  searchTimer = setTimeout(doSearch, 350);
};

const doSearch = async () => {
  if (!query.value.trim()) return;
  searching.value = true;
  results.value = [];
  try {
    // 搜索知识库（卡片名称）
    const kbRes = await axios.get('/api/get-knowledge-item/').catch(() => ({ data: [] }));
    const kbCards: any[] = Array.isArray(kbRes.data) ? kbRes.data : (kbRes.data?.data || []);
    const q = query.value.toLowerCase();
    const kbResults = kbCards
      .filter((c: any) => (c.kbName || c.name || '').toLowerCase().includes(q))
      .slice(0, 5)
      .map((c: any) => ({
        type: 'knowledge',
        title: c.kbName || c.name,
        desc: `知识库 · ${c.docCount ?? 0} 篇文档`,
        id: c.kbId || c.id,
      }));

    // 搜索聊天会话
    const chatRes = await axios.get('/api/chat/chat-documents').catch(() => ({ data: [] }));
    const chatSessions: any[] = Array.isArray(chatRes.data) ? chatRes.data : (chatRes.data?.data || []);
    const chatResults = chatSessions
      .filter((s: any) => (s.title || '').toLowerCase().includes(q))
      .slice(0, 3)
      .map((s: any) => ({
        type: 'chat',
        title: s.title || '无标题对话',
        desc: s.lastMessage || '对话记录',
        id: s.id,
      }));

    results.value = [...kbResults, ...chatResults];
  } catch (e) {
    console.error('搜索失败:', e);
  } finally {
    searching.value = false;
  }
};

const moveSelection = (dir: number) => {
  const len = results.value.length;
  if (!len) return;
  selectedIndex.value = (selectedIndex.value + dir + len) % len;
};

const selectResult = (item: any) => {
  if (item.type === 'knowledge') {
    navigateTo(`/knowledge/knowledgeDetail/${item.id}`);
  } else if (item.type === 'chat') {
    navigateTo(`/chat/${item.id}`);
  } else {
    navigateTo('/knowledge');
  }
};

const highlightQuery = (text: string) => {
  if (!query.value) return text;
  const q = query.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${q})`, 'gi'), '<mark>$1</mark>');
};

const getTypeLabel = (type: string) => {
  const map: Record<string, string> = { knowledge: '知识库', chat: '对话', file: '文件' };
  return map[type] || type;
};

const getTypeIcon = (type: string) => {
  if (type === 'knowledge') return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>`;
  if (type === 'chat') return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>`;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`;
};

const quickLinks = [
  {
    path: '/knowledge',
    label: '知识库',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>`,
  },
  {
    path: '/chat',
    label: 'AI 对话',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>`,
  },
  {
    path: '/files',
    label: '文件管理',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>`,
  },
  {
    path: '/acmd_sre',
    label: '学术检索',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>`,
  },
];

// 全局快捷键 Ctrl+K
const handleKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (!props.visible) emit('close'); // 触发父组件打开
  }
};

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
}

.search-modal {
  width: 600px;
  max-width: 92vw;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.06);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.search-input-icon {
  width: 20px;
  height: 20px;
  color: #9ca3af;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 15px;
  color: #111827;
  background: transparent;
}

.search-input::placeholder {
  color: #9ca3af;
}

.search-clear {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #9ca3af;
  padding: 0;
  display: flex;
  align-items: center;
}

.search-clear svg {
  width: 16px;
  height: 16px;
}

.search-esc {
  background: #f3f4f6;
  border-radius: 5px;
  padding: 2px 7px;
  font-size: 11px;
  color: #6b7280;
  font-family: monospace;
  border: 1px solid #e5e7eb;
}

.search-body {
  flex: 1;
  overflow-y: auto;
  min-height: 180px;
  scrollbar-width: thin;
}

.search-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #9ca3af;
  gap: 12px;
  font-size: 14px;
}

.search-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #e5e7eb;
  border-top-color: #4f7ef8;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.search-results {
  padding: 8px;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s;
}

.search-result-item--selected,
.search-result-item:hover {
  background: #f0f7ff;
}

.result-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.result-icon--knowledge {
  background: #eff6ff;
  color: #4f7ef8;
}
.result-icon--chat {
  background: #f0fdf4;
  color: #22c55e;
}
.result-icon--file {
  background: #fff7ed;
  color: #f97316;
}

.result-icon svg {
  width: 18px;
  height: 18px;
}

.result-content {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 14px;
  font-weight: 500;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-title :deep(mark) {
  background: #fef9c3;
  color: #92400e;
  border-radius: 2px;
  padding: 0 1px;
}

.result-desc {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-type-tag {
  font-size: 11px;
  color: #9ca3af;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
}

.search-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #9ca3af;
  gap: 10px;
}

.search-empty svg {
  width: 40px;
  height: 40px;
  opacity: 0.4;
}

.search-empty p {
  font-size: 14px;
}

.search-tips {
  padding: 12px 16px;
}

.search-tips-title {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.search-tips-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.search-tip-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #4b5563;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.search-tip-item:hover {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #4f7ef8;
}

.tip-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tip-icon svg {
  width: 14px;
  height: 14px;
}

.search-footer {
  padding: 10px 16px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #9ca3af;
}

.search-footer kbd {
  background: #f3f4f6;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: monospace;
  border: 1px solid #e5e7eb;
  margin-right: 4px;
}

/* 动画 */
.search-overlay-enter-active,
.search-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.search-overlay-enter-from,
.search-overlay-leave-to {
  opacity: 0;
}

.search-modal-enter-active,
.search-modal-leave-active {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s;
}
.search-modal-enter-from,
.search-modal-leave-to {
  transform: translateY(-20px) scale(0.97);
  opacity: 0;
}
</style>
