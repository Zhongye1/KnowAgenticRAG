<template>
  <div
    :class="['kb-card', { 'kb-card--compact': compact, 'kb-card--starred': starred }]"
    @click="$emit('click')"
  >
    <!-- 封面颜色条（基于title hash） -->
    <div class="kb-card__color-bar" :style="{ background: cardColor }"></div>

    <!-- 卡片主体 -->
    <div class="kb-card__body">
      <div class="kb-card__top">
        <!-- 图标 -->
        <div class="kb-card__icon" :style="{ background: cardColorLight }">
          <svg viewBox="0 0 24 24" fill="none" :stroke="cardColorDark" stroke-width="2">
            <path stroke-linecap="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
        </div>
        <!-- 操作按钮（悬浮显示） -->
        <div class="kb-card__actions" @click.stop>
          <!-- 星标按钮 -->
          <button
            :class="['action-btn', 'star-btn', { 'star-btn--active': starred }]"
            @click.stop="$emit('star')"
            :title="starred ? '取消星标' : '加入星标'"
          >
            <svg viewBox="0 0 24 24" :fill="starred ? '#f59e0b' : 'none'" :stroke="starred ? '#f59e0b' : 'currentColor'" stroke-width="2">
              <path stroke-linecap="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
          </button>
          <!-- 更多操作 -->
          <t-dropdown :options="dropdownOptions" trigger="click" @click="handleDropdown">
            <button class="action-btn" @click.stop title="更多操作">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>
          </t-dropdown>
        </div>
      </div>

      <!-- 标题 -->
      <h3 class="kb-card__title">{{ card.title }}</h3>

      <!-- 描述 -->
      <p v-if="!compact && card.description" class="kb-card__desc">{{ card.description }}</p>

      <!-- 底部信息 -->
      <div class="kb-card__footer">
        <span class="kb-card__time">{{ formattedTime }}</span>
        <div class="kb-card__tags" v-if="!compact">
          <span class="kb-card__tag">RAG</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DropdownProps } from 'tdesign-vue-next';

interface Card {
  id: string;
  title: string;
  avatar?: string;
  description?: string;
  cover?: string;
  createdTime?: string;
}

const props = defineProps<{
  card: Card;
  starred?: boolean;
  compact?: boolean;
}>();

const emit = defineEmits(['click', 'star', 'delete']);

// 颜色方案基于title hash
const COLOR_SETS = [
  { bar: 'linear-gradient(135deg,#4f7ef8,#818cf8)', light: '#eff6ff', dark: '#4f7ef8' },
  { bar: 'linear-gradient(135deg,#10b981,#34d399)', light: '#f0fdf4', dark: '#059669' },
  { bar: 'linear-gradient(135deg,#f59e0b,#fbbf24)', light: '#fffbeb', dark: '#d97706' },
  { bar: 'linear-gradient(135deg,#ec4899,#f472b6)', light: '#fdf2f8', dark: '#db2777' },
  { bar: 'linear-gradient(135deg,#8b5cf6,#a78bfa)', light: '#f5f3ff', dark: '#7c3aed' },
  { bar: 'linear-gradient(135deg,#14b8a6,#2dd4bf)', light: '#f0fdfa', dark: '#0d9488' },
  { bar: 'linear-gradient(135deg,#f97316,#fb923c)', light: '#fff7ed', dark: '#ea580c' },
];

const colorIndex = computed(() => {
  let hash = 0;
  for (let i = 0; i < props.card.title.length; i++) {
    hash = props.card.title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % COLOR_SETS.length;
});

const cardColor = computed(() => COLOR_SETS[colorIndex.value].bar);
const cardColorLight = computed(() => COLOR_SETS[colorIndex.value].light);
const cardColorDark = computed(() => COLOR_SETS[colorIndex.value].dark);

const formattedTime = computed(() => {
  const t = props.card.createdTime;
  if (!t) return '';
  try {
    const d = new Date(t);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays} 天前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch { return t; }
});

const dropdownOptions: DropdownProps['options'] = [
  { content: '打开', value: 'open' },
  { content: '删除', value: 'delete' },
];

const handleDropdown = (data: any) => {
  if (data.value === 'open') emit('click');
  if (data.value === 'delete') emit('delete');
};
</script>

<style scoped>
.kb-card {
  background: white;
  border-radius: 12px;
  border: 1px solid #f0f0f0;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.kb-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 28px rgba(0,0,0,0.1);
  border-color: #e0e0e0;
}

.kb-card--starred {
  border-color: #fde68a;
}

/* 顶部颜色条 */
.kb-card__color-bar {
  height: 4px;
  width: 100%;
}

.kb-card__body {
  padding: 14px 14px 12px;
}

.kb-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
}

.kb-card__icon {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kb-card__icon svg {
  width: 20px;
  height: 20px;
}

/* 操作按钮：平时透明，卡片hover时显示 */
.kb-card__actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.18s;
}

.kb-card:hover .kb-card__actions {
  opacity: 1;
}

/* 星标始终亮着 */
.kb-card--starred .kb-card__actions,
.kb-card--starred .star-btn {
  opacity: 1;
}

.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  transition: all 0.15s;
}

.action-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.action-btn svg {
  width: 15px;
  height: 15px;
}

.star-btn--active {
  color: #f59e0b;
}

.kb-card__title {
  font-size: 14.5px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.kb-card__desc {
  font-size: 12.5px;
  color: #6b7280;
  margin: 0 0 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

.kb-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.kb-card__time {
  font-size: 11.5px;
  color: #9ca3af;
}

.kb-card__tags {
  display: flex;
  gap: 4px;
}

.kb-card__tag {
  font-size: 10.5px;
  padding: 1px 7px;
  background: #f3f4f6;
  color: #6b7280;
  border-radius: 10px;
}

/* 紧凑模式 */
.kb-card--compact .kb-card__body {
  padding: 10px 12px;
}

.kb-card--compact .kb-card__icon {
  width: 30px;
  height: 30px;
  border-radius: 7px;
}

.kb-card--compact .kb-card__icon svg {
  width: 16px;
  height: 16px;
}

.kb-card--compact .kb-card__title {
  font-size: 13.5px;
}
</style>
