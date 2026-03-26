<template>
  <div class="history-page">
    <!-- 头部 -->
    <div class="history-header">
      <div class="history-header__left">
        <div class="header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div>
          <h1>历史记录</h1>
          <p>查看所有问答、任务和笔记历史</p>
        </div>
      </div>
      <div class="history-header__right">
        <t-input
          v-model="searchKeyword"
          placeholder="搜索历史记录..."
          clearable
          class="search-input"
        >
          <template #prefix-icon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </template>
        </t-input>
        <t-button theme="danger" variant="outline" size="small" @click="clearAll">
          清空全部
        </t-button>
      </div>
    </div>

    <!-- 过滤标签 -->
    <div class="filter-bar">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        :class="['filter-tab', { active: activeTab === tab.value }]"
        @click="activeTab = tab.value as HistoryType | 'all'"
      >
        <span>{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
        <span class="tab-count">{{ getTabCount(tab.value) }}</span>
      </button>
    </div>

    <!-- 主内容 -->
    <div class="history-content">
      <div v-if="filteredItems.length === 0" class="empty-state">
        <div class="empty-icon">📭</div>
        <p>{{ searchKeyword ? '没有找到匹配的记录' : '暂无历史记录' }}</p>
        <span>{{ searchKeyword ? '尝试其他关键词' : '开始对话或创建任务后，记录会出现在这里' }}</span>
      </div>

      <div v-else class="history-list">
        <!-- 按日期分组 -->
        <div v-for="group in groupedItems" :key="group.date" class="date-group">
          <div class="date-label">{{ group.label }}</div>
          <div class="group-items">
            <div
              v-for="item in group.items"
              :key="item.id"
              :class="['history-card', { 'history-card--pinned': pinnedIds.has(item.id) }]"
              @click="openItem(item)"
            >
              <div class="history-card__pin-badge" v-if="pinnedIds.has(item.id)" title="已置顶">📌</div>
              <div class="history-card__icon" :data-type="item.type">
                {{ typeIcon(item.type) }}
              </div>
              <div class="history-card__body">
                <div class="history-card__title">{{ item.title }}</div>
                <div class="history-card__preview">{{ item.preview }}</div>
                <div class="history-card__meta">
                  <span class="type-tag" :data-type="item.type">{{ typeLabel(item.type) }}</span>
                  <span class="time-tag">{{ item.timeStr }}</span>
                  <span v-if="item.kbName" class="kb-tag">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3 h-3">
                      <path stroke-linecap="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                    </svg>
                    {{ item.kbName }}
                  </span>
                </div>
              </div>
              <div class="history-card__actions">
                <button
                  :class="['card-action-btn', { 'card-action-btn--pinned': pinnedIds.has(item.id) }]"
                  @click.stop="togglePin(item.id)"
                  :title="pinnedIds.has(item.id) ? '取消置顶' : '置顶'"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                  </svg>
                </button>
                <button class="card-action-btn" @click.stop="copyItem(item)" title="复制内容">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2"/>
                  </svg>
                </button>
                <button class="card-action-btn danger" @click.stop="deleteItem(item.id)" title="删除">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 详情抽屉 -->
    <t-drawer
      :visible="!!selectedItem"
      :header="selectedItem?.title || '详情'"
      placement="right"
      size="600px"
      @close="selectedItem = null"
    >
      <div v-if="selectedItem" class="drawer-content">
        <div class="drawer-meta">
          <span class="type-tag" :data-type="selectedItem.type">{{ typeLabel(selectedItem.type) }}</span>
          <span class="time-tag">{{ selectedItem.timeStr }}</span>
        </div>
        <div class="drawer-body" v-html="selectedItem.content"></div>
      </div>
    </t-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useRouter } from 'vue-router';
import axios from 'axios';

// ── Types ──────────────────────────────────────────────
type HistoryType = 'chat' | 'task' | 'note' | 'search';

interface HistoryItem {
  id: string;
  type: HistoryType;
  title: string;
  preview: string;
  content: string;
  timestamp: number;
  timeStr: string;
  kbName?: string;
  link?: string;
}

interface DateGroup {
  date: string;
  label: string;
  items: HistoryItem[];
}

// ── State ──────────────────────────────────────────────
const router = useRouter();
const searchKeyword = ref('');
const activeTab = ref<HistoryType | 'all'>('all');
const selectedItem = ref<HistoryItem | null>(null);
const allItems = ref<HistoryItem[]>([]);

// 置顶 IDs（持久化到 localStorage）
const PINNED_KEY = 'history_pinned_ids';
const pinnedIds = ref<Set<string>>(new Set(JSON.parse(localStorage.getItem(PINNED_KEY) || '[]')));

function togglePin(id: string) {
  const s = new Set(pinnedIds.value);
  if (s.has(id)) { s.delete(id); MessagePlugin.success('已取消置顶'); }
  else { s.add(id); MessagePlugin.success('已置顶'); }
  pinnedIds.value = s;
  localStorage.setItem(PINNED_KEY, JSON.stringify([...s]));
}

const tabs = [
  { value: 'all',    icon: '📋', label: '全部' },
  { value: 'chat',   icon: '💬', label: '对话' },
  { value: 'task',   icon: '🤖', label: '任务' },
  { value: 'note',   icon: '📝', label: '笔记' },
  { value: 'search', icon: '🔍', label: '搜索' },
];

// ── Helpers ────────────────────────────────────────────
const typeIcon  = (t: string) => ({ chat: '💬', task: '🤖', note: '📝', search: '🔍' }[t] ?? '📄');
const typeLabel = (t: string) => ({ chat: 'AI对话', task: '任务', note: '笔记', search: '搜索' }[t] ?? t);

const getTabCount = (tab: string) => {
  if (tab === 'all') return allItems.value.length;
  return allItems.value.filter(i => i.type === tab).length;
};

// ── Filtering ─────────────────────────────────────────
const filteredItems = computed(() => {
  let items = activeTab.value === 'all'
    ? allItems.value
    : allItems.value.filter(i => i.type === activeTab.value);

  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.toLowerCase();
    items = items.filter(i =>
      i.title.toLowerCase().includes(kw) ||
      i.preview.toLowerCase().includes(kw)
    );
  }

  return items.sort((a, b) => {
    // 置顶的优先显示
    const aPinned = pinnedIds.value.has(a.id) ? 1 : 0;
    const bPinned = pinnedIds.value.has(b.id) ? 1 : 0;
    if (bPinned !== aPinned) return bPinned - aPinned;
    return b.timestamp - a.timestamp;
  });
});

// ── Grouping by date ────────────────────────────────────
const groupedItems = computed((): DateGroup[] => {
  const groups = new Map<string, HistoryItem[]>();
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterdayStr = new Date(now.getTime() - 86400000).toDateString();

  filteredItems.value.forEach(item => {
    const d = new Date(item.timestamp);
    const ds = d.toDateString();
    const key = ds === todayStr ? 'today' :
                ds === yesterdayStr ? 'yesterday' :
                d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  });

  return Array.from(groups.entries()).map(([key, items]) => ({
    date: key,
    label: key === 'today' ? '今天' : key === 'yesterday' ? '昨天' : key,
    items,
  }));
});

// ── Data Loading ────────────────────────────────────────
const loadChatHistory = async () => {
  try {
    const res = await axios.get('/api/chat/chat-documents');
    const sessions = Array.isArray(res.data) ? res.data : [];
    sessions.forEach((s: any) => {
      const lastMsg = s.history?.[s.history.length - 1];
      allItems.value.push({
        id: `chat_${s.id}`,
        type: 'chat',
        title: s.title || s.history?.[1]?.content?.slice(0, 30) || '新对话',
        preview: lastMsg?.content?.slice(0, 80) || '',
        content: (s.history || []).map((m: any) =>
          `<p><strong>${m.role === 'user' ? '我' : 'AI'}：</strong>${m.content}</p>`
        ).join(''),
        timestamp: (s.created_at || 0) * 1000,
        timeStr: formatTime(s.created_at * 1000),
        link: `/chat/${s.id}`,
      });
    });
  } catch { /* ignore */ }
};

const loadTaskHistory = () => {
  try {
    const raw = localStorage.getItem('agent_task_history');
    if (!raw) return;
    const tasks = JSON.parse(raw);
    tasks.forEach((t: any) => {
      allItems.value.push({
        id: `task_${t.id}`,
        type: 'task',
        title: t.input?.slice(0, 50) || '任务',
        preview: t.output?.slice(0, 80) || '',
        content: `<pre>${t.output || ''}</pre>`,
        timestamp: parseInt(t.id) || Date.now(),
        timeStr: t.time || formatTime(parseInt(t.id)),
      });
    });
  } catch { /* ignore */ }
};

const loadNoteHistory = () => {
  // 从 KnowledgeDetail 笔记模块收集
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('kb_notes_'));
    keys.forEach(key => {
      const kbId = key.replace('kb_notes_', '');
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const notes = JSON.parse(raw);
      notes.forEach((n: any) => {
        allItems.value.push({
          id: `note_${n.id}`,
          type: 'note',
          title: n.title || '无标题笔记',
          preview: n.content?.slice(0, 80) || '',
          content: `<p>${n.content || ''}</p>`,
          timestamp: n.updatedAt || n.createdAt || Date.now(),
          timeStr: formatTime(n.updatedAt || n.createdAt),
          kbName: `知识库 ${kbId.slice(-6)}`,
          link: `/knowledge/knowledgeDetail/${kbId}`,
        });
      });
    });
  } catch { /* ignore */ }
};

const loadAll = async () => {
  allItems.value = [];
  await loadChatHistory();
  loadTaskHistory();
  loadNoteHistory();
};

// ── Actions ─────────────────────────────────────────────
const openItem = (item: HistoryItem) => {
  if (item.link) {
    router.push(item.link);
  } else {
    selectedItem.value = item;
  }
};

const copyItem = (item: HistoryItem) => {
  navigator.clipboard.writeText(item.preview || item.title).then(() => {
    MessagePlugin.success('已复制');
  });
};

const deleteItem = (id: string) => {
  allItems.value = allItems.value.filter(i => i.id !== id);
  MessagePlugin.success('已删除');
};

const clearAll = () => {
  if (!confirm('确定清空全部历史记录？此操作不可恢复。')) return;
  allItems.value = [];
  localStorage.removeItem('agent_task_history');
  MessagePlugin.success('已清空历史记录');
};

const formatTime = (ts: number): string => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

onMounted(loadAll);
</script>

<style scoped>
.history-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f8fafc;
  overflow: hidden;
}

/* Header */
.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.history-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}
.header-icon svg { width: 20px; height: 20px; }
.history-header__left h1 {
  font-size: 18px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0;
}
.history-header__left p {
  font-size: 12px;
  color: #6b7280;
  margin: 0;
}
.history-header__right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.search-input { width: 240px; }

/* Filter Tabs */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.filter-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: #6b7280;
  background: white;
  transition: all 0.15s;
}
.filter-tab:hover { border-color: #4f7ef8; color: #4f7ef8; }
.filter-tab.active {
  background: #eff6ff;
  border-color: #4f7ef8;
  color: #3b82f6;
}
.tab-count {
  background: #f3f4f6;
  color: #9ca3af;
  font-size: 11px;
  padding: 0 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}
.filter-tab.active .tab-count {
  background: #dbeafe;
  color: #3b82f6;
}

/* Content */
.history-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 60px 20px;
}
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-state p {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}
.empty-state span { font-size: 13px; color: #9ca3af; }

/* Date Group */
.date-group { margin-bottom: 24px; }
.date-label {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
  padding: 0 4px;
}
.group-items { display: flex; flex-direction: column; gap: 8px; }

/* History Card */
.history-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}
.history-card:hover {
  border-color: #4f7ef8;
  box-shadow: 0 2px 8px rgba(79,126,248,0.1);
}
.history-card__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
  background: #f3f4f6;
}
.history-card__icon[data-type="chat"]   { background: #eff6ff; }
.history-card__icon[data-type="task"]   { background: #f0fdf4; }
.history-card__icon[data-type="note"]   { background: #fefce8; }
.history-card__icon[data-type="search"] { background: #fdf4ff; }
.history-card__body { flex: 1; min-width: 0; }
.history-card__title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}
.history-card__preview {
  font-size: 12px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6px;
}
.history-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.type-tag {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  font-weight: 600;
}
.type-tag[data-type="chat"]   { background: #dbeafe; color: #2563eb; }
.type-tag[data-type="task"]   { background: #dcfce7; color: #16a34a; }
.type-tag[data-type="note"]   { background: #fef9c3; color: #ca8a04; }
.type-tag[data-type="search"] { background: #fae8ff; color: #9333ea; }
.time-tag { font-size: 11px; color: #9ca3af; }
.kb-tag {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 1px 8px;
  border-radius: 10px;
}
.history-card__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}
.history-card:hover .history-card__actions { opacity: 1; }
.card-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #4b5563;
  transition: all 0.15s;
}
.card-action-btn:hover { background: #f3f4f6; }
.card-action-btn.danger:hover { background: #fef2f2; color: #dc2626; border-color: #fca5a5; }
.card-action-btn--pinned { color: #4f7ef8; border-color: #c7d7ff; background: #eff4ff; opacity: 1 !important; }
.card-action-btn--pinned:hover { background: #dbeafe; }

/* 置顶卡片样式 */
.history-card--pinned {
  border-color: #a5b4fc;
  background: linear-gradient(to right, #fafbff, white);
  box-shadow: 0 1px 6px rgba(79,126,248,0.08);
}
.history-card__pin-badge {
  position: absolute;
  top: -8px; right: 8px;
  font-size: 12px;
  background: #4f7ef8;
  color: white;
  padding: 1px 6px;
  border-radius: 8px;
  font-style: normal;
}

/* Drawer */
.drawer-content { padding: 16px; }
.drawer-meta { display: flex; gap: 8px; margin-bottom: 16px; }
.drawer-body {
  font-size: 14px;
  line-height: 1.7;
  color: #1f2937;
}
.drawer-body :deep(p) { margin: 8px 0; }
.drawer-body :deep(pre) {
  background: #f3f4f6;
  padding: 12px;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}
</style>
