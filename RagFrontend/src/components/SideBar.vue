<template>
  <aside :class="['sidebar', { 'sidebar--collapsed': isCollapsed }]">
    <!-- Logo区域 -->
    <div class="sidebar__logo">
      <div class="sidebar__logo-icon">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="8" fill="url(#grad)"/>
          <path d="M8 10h10M8 16h14M8 22h10" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop stop-color="#4f7ef8"/>
              <stop offset="1" stop-color="#8b5cf6"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
      <transition name="fade-text">
        <span v-if="!isCollapsed" class="sidebar__logo-text">RAGF-01</span>
      </transition>
      <!-- 折叠按钮 -->
      <button class="sidebar__collapse-btn" @click="toggleCollapse" :title="isCollapsed ? '展开侧边栏' : '折叠侧边栏'">
        <svg :class="['collapse-icon', { 'rotate-180': isCollapsed }]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
    </div>

    <!-- 快速新建按钮 -->
    <div class="sidebar__quick-action">
      <button class="quick-new-btn" @click="$emit('quickCreate')" :title="isCollapsed ? '新建知识库' : ''">
        <svg class="quick-new-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
        </svg>
        <transition name="fade-text">
          <span v-if="!isCollapsed">快速新建</span>
        </transition>
      </button>
    </div>

    <!-- 主导航菜单 -->
    <nav class="sidebar__nav">
      <div class="sidebar__nav-section">
        <transition name="fade-text">
          <p v-if="!isCollapsed" class="sidebar__nav-label">主要功能</p>
        </transition>
        <ul class="sidebar__nav-list">
          <li v-for="item in mainNavItems" :key="item.path">
            <t-tooltip :content="isCollapsed ? item.label : ''" placement="right" :show-arrow="false">
              <button
                :class="['nav-item', { 'nav-item--active': isActive(item.path) }]"
                @click="navigateTo(item.path)"
              >
                <span class="nav-item__icon" v-html="item.icon"></span>
                <transition name="fade-text">
                  <span v-if="!isCollapsed" class="nav-item__label">{{ item.label }}</span>
                </transition>
                <transition name="fade-text">
                  <span v-if="!isCollapsed && item.badge" class="nav-item__badge">{{ item.badge }}</span>
                </transition>
              </button>
            </t-tooltip>
          </li>
        </ul>
      </div>

      <div class="sidebar__nav-section">
        <transition name="fade-text">
          <p v-if="!isCollapsed" class="sidebar__nav-label">工具</p>
        </transition>
        <ul class="sidebar__nav-list">
          <li v-for="item in toolNavItems" :key="item.path">
            <t-tooltip :content="isCollapsed ? item.label : ''" placement="right" :show-arrow="false">
              <button
                :class="['nav-item', { 'nav-item--active': isActive(item.path) }]"
                @click="navigateTo(item.path)"
              >
                <span class="nav-item__icon" v-html="item.icon"></span>
                <transition name="fade-text">
                  <span v-if="!isCollapsed" class="nav-item__label">{{ item.label }}</span>
                </transition>
              </button>
            </t-tooltip>
          </li>
        </ul>
      </div>
    </nav>

    <!-- 底部区域 -->
    <div class="sidebar__footer">
      <!-- 快捷搜索提示 -->
      <transition name="fade-text">
        <button v-if="!isCollapsed" class="shortcut-hint" @click="$emit('openSearch')">
          <svg class="shortcut-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
          </svg>
          <span>搜索</span>
          <kbd>Ctrl K</kbd>
        </button>
      </transition>
      <t-tooltip :content="isCollapsed ? '搜索 Ctrl+K' : ''" placement="right" :show-arrow="false">
        <button v-if="isCollapsed" class="nav-item" @click="$emit('openSearch')">
          <span class="nav-item__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/>
            </svg>
          </span>
        </button>
      </t-tooltip>

      <!-- 语言切换 -->
      <t-tooltip :content="isCollapsed ? (locale === 'zh' ? 'Switch to English' : '切换中文') : ''" placement="right" :show-arrow="false">
        <button class="nav-item" @click="handleToggleLocale" :title="locale === 'zh' ? 'Switch to English' : '切换中文'">
          <span class="nav-item__icon" style="font-size:15px;">🌐</span>
          <transition name="fade-text">
            <span v-if="!isCollapsed" class="nav-item__label" style="font-size:12px;">{{ locale === 'zh' ? 'EN' : '中文' }}</span>
          </transition>
        </button>
      </t-tooltip>

      <!-- GitHub链接 -->
      <t-tooltip :content="isCollapsed ? 'GitHub仓库' : ''" placement="right" :show-arrow="false">
        <button class="nav-item" @click="openGitHub" title="GitHub仓库">
          <span class="nav-item__icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
          </span>
          <transition name="fade-text">
            <span v-if="!isCollapsed" class="nav-item__label">GitHub</span>
          </transition>
        </button>
      </t-tooltip>

      <!-- App下载 -->
      <t-tooltip :content="isCollapsed ? '下载移动端 App' : ''" placement="right" :show-arrow="false">
        <button class="nav-item nav-item--download" @click="openAppDownload" title="下载移动端 App">
          <span class="nav-item__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12" y2="18.01"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 11l4 4 4-4M12 7v8"/>
            </svg>
          </span>
          <transition name="fade-text">
            <span v-if="!isCollapsed" class="nav-item__label">下载 App</span>
          </transition>
        </button>
      </t-tooltip>

      <!-- 用户信息 -->
      <t-dropdown :min-column-width="160" trigger="click" placement="right-bottom">
        <div :class="['user-info', { 'user-info--collapsed': isCollapsed }]">
          <t-avatar :image="userAvatar" :hide-on-load-failed="false" size="small" class="user-avatar" />
          <transition name="fade-text">
            <div v-if="!isCollapsed" class="user-meta">
              <span class="user-name">{{ userName }}</span>
              <span class="user-email">{{ userEmail }}</span>
            </div>
          </transition>
          <transition name="fade-text">
            <svg v-if="!isCollapsed" class="user-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </transition>
        </div>
        <template #dropdown>
          <t-dropdown-menu>
            <t-dropdown-item @click="navigateTo('/user/userInfo')">
              <t-icon name="user" />
              <span class="ml-2">个人中心</span>
            </t-dropdown-item>
            <t-dropdown-item @click="navigateTo('/devtools')">
              <t-icon name="code" />
              <span class="ml-2">开发者模式</span>
            </t-dropdown-item>
            <t-dropdown-item divided @click="logout" class="text-red-500">
              <t-icon name="logout" />
              <span class="ml-2">退出登录</span>
            </t-dropdown-item>
          </t-dropdown-menu>
        </template>
      </t-dropdown>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useDataUserStore } from '@/store';
import API_ENDPOINTS from '@/utils/apiConfig';
import { useI18n, setLocale, locale as _locale } from '@/i18n';

const { toggleLocale } = useI18n();

// 使用原始 _locale ref 确保响应式
const locale = _locale

// 包装 toggleLocale，切换后强制刷新页面上依赖 locale 的文字
const handleToggleLocale = () => {
  toggleLocale()
  // 触发一次全局响应式更新信号（DOM 属性变化已在 setLocale 中完成）
  MessagePlugin.success(locale.value === 'en' ? 'Language: English' : '语言：中文')
}

const emit = defineEmits(['openSearch']);

const router = useRouter();
const route = useRoute();
const userStore = useDataUserStore();
const isCollapsed = ref(false);

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};

const isActive = (path: string) => {
  if (path === '/chat') return route.path.startsWith('/chat');
  if (path === '/user') return route.path.startsWith('/user');
  return route.path === path || route.path.startsWith(path + '/');
};

const navigateTo = (path: string) => router.push(path);
const openGitHub = () => window.open('https://github.com/March030303/KnowledgeRAG-GZHU/tree/master', '_blank');
const openAppDownload = () => window.open('/download', '_blank');

const logout = async () => {
  await router.push('/LogonOrRegister');
  MessagePlugin.success('已登出账号');
};

const userAvatar = computed(() => {
  if (!userStore.userData) return 'https://tdesign.gtimg.com/site/avatar.jpg';
  const avatar = userStore.userData?.avatar || '';
  if (avatar && avatar.startsWith('/static/')) return API_ENDPOINTS.USER.AVATAR(avatar);
  return avatar || 'https://tdesign.gtimg.com/site/avatar.jpg';
});

const userName = computed(() => {
  return userStore.userData?.name || userStore.userData?.email?.split('@')[0] || '用户';
});

const userEmail = computed(() => {
  const email = userStore.userData?.email || '';
  if (email.length > 18) return email.substring(0, 15) + '...';
  return email;
});

onMounted(async () => {
  try { await userStore.fetchUserData(); } catch {}
});

interface NavItem {
  path: string;
  label: string;
  icon: string;
  badge?: string;
}

// 主导航项
const mainNavItems: NavItem[] = [
  {
    path: '/knowledge',
    label: '知识库',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
    </svg>`,
  },
  {
    path: '/square',
    label: '知识广场',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>`,
  },
  {
    path: '/chat',
    label: 'AI 对话',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
    </svg>`,
  },
  {
    path: '/acmd_sre',
    label: '学术检索',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
    </svg>`,
  },
  {
    path: '/agent',
    label: '任务模式',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v3M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
    </svg>`,
    badge: 'Beta',
  },
];

const toolNavItems: NavItem[] = [
  {
    path: '/history',
    label: '历史记录',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>`,
  },
  {
    path: '/creation',
    label: '文档创作',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
    </svg>`,
    badge: 'New',
  },
  {
    path: '/files',
    label: '文件管理',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
    </svg>`,
  },
  {
    path: '/service',
    label: '模型管理',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"/>
    </svg>`,
  },
  {
    path: '/settings',
    label: '系统设置',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/>
    </svg>`,
  },
  {
    path: '/architecture',
    label: '系统架构',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/>
    </svg>`,
  },
];
</script>

<style scoped>
/* ===== 侧边栏容器 ===== */
.sidebar {
  width: 240px;
  height: 100vh;
  background: #ffffff;
  border-right: 1px solid #f0f0f0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.04);
  position: relative;
  z-index: 100;
}

.sidebar--collapsed {
  width: 64px;
}

/* ===== Logo区域 ===== */
.sidebar__logo {
  display: flex;
  align-items: center;
  padding: 16px 12px 14px;
  border-bottom: 1px solid #f5f5f5;
  gap: 10px;
  min-height: 64px;
  position: relative;
}

.sidebar__logo-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.sidebar__logo-icon svg {
  width: 100%;
  height: 100%;
}

.sidebar__logo-text {
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(135deg, #4f7ef8, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
  flex: 1;
}

.sidebar__collapse-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  transition: all 0.2s;
  flex-shrink: 0;
  margin-left: auto;
}

.sidebar__collapse-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.collapse-icon {
  width: 16px;
  height: 16px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.rotate-180 {
  transform: rotate(180deg);
}

/* 折叠状态下隐藏折叠按钮文字，logo居中 */
.sidebar--collapsed .sidebar__logo {
  justify-content: center;
  padding: 16px 8px;
}
.sidebar--collapsed .sidebar__collapse-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
}

/* ===== 快速新建 ===== */
.sidebar__quick-action {
  padding: 10px 10px 6px;
}

.quick-new-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1.5px dashed #dbeafe;
  background: #f0f7ff;
  color: #4f7ef8;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  overflow: hidden;
}

.quick-new-btn:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}

.quick-new-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.sidebar--collapsed .quick-new-btn {
  justify-content: center;
  padding: 8px;
}

/* ===== 导航区域 ===== */
.sidebar__nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 0;
  scrollbar-width: none;
}
.sidebar__nav::-webkit-scrollbar { display: none; }

.sidebar__nav-section {
  margin-bottom: 4px;
  padding: 0 8px;
}

.sidebar__nav-label {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 8px 4px;
  white-space: nowrap;
  overflow: hidden;
}

.sidebar__nav-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* ===== 导航项 ===== */
.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #4b5563;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  /* 精细过渡：只用 transform/background/color，不用 all */
  transition:
    background   0.14s ease,
    color        0.14s ease,
    transform    0.14s ease,
    box-shadow   0.14s ease;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
  will-change: transform;
}

.nav-item:hover:not(.nav-item--active) {
  background: rgba(79, 126, 248, 0.07);
  color: #4f7ef8;
  transform: translateX(3px);
}

.nav-item:active {
  transform: translateX(1px) scale(0.97) !important;
  transition-duration: 0.06s !important;
}

.nav-item--active {
  background: #eff6ff;
  color: #4f7ef8;
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(79, 126, 248, 0.15);
}

.nav-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%) scaleY(1);
  width: 3px;
  height: 60%;
  background: #4f7ef8;
  border-radius: 0 3px 3px 0;
  /* 进入时弹出 */
  animation: navIndicatorIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes navIndicatorIn {
  from { transform: translateY(-50%) scaleY(0); }
  to   { transform: translateY(-50%) scaleY(1); }
}

.nav-item__icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* hover 时图标轻微弹跳 */
.nav-item:hover .nav-item__icon {
  transform: scale(1.15);
}

.nav-item--active .nav-item__icon {
  transform: scale(1.08);
}

.nav-item__icon svg {
  width: 18px;
  height: 18px;
}

.nav-item__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-item--download .nav-item__icon {
  color: #22c55e;
}
.nav-item--download:hover {
  background: #f0fdf4 !important;
  color: #15803d !important;
}

.nav-item__badge {
  background: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 10px;
  flex-shrink: 0;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.nav-item:hover .nav-item__badge {
  transform: scale(1.1);
}

/* 折叠状态导航项居中 */
.sidebar--collapsed .nav-item {
  justify-content: center;
  padding: 9px;
}

.sidebar--collapsed .nav-item:hover {
  transform: scale(1.08);
}

/* ===== 快速新建按钮升级 ===== */
.quick-new-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1.5px dashed #dbeafe;
  background: #f0f7ff;
  color: #4f7ef8;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.18s ease;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
  will-change: transform;
}

.quick-new-btn:hover {
  background: #dbeafe;
  border-color: #93c5fd;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(79, 126, 248, 0.20);
}

.quick-new-btn:active {
  transform: translateY(0) scale(0.97) !important;
  box-shadow: none !important;
  transition-duration: 0.07s !important;
}

/* 快速新建图标旋转 */
.quick-new-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.quick-new-btn:hover .quick-new-icon {
  transform: rotate(90deg) scale(1.15);
}

.sidebar--collapsed .quick-new-btn {
  justify-content: center;
  padding: 8px;
}

/* ===== 底部区域 ===== */
.sidebar__footer {
  padding: 8px 8px 12px;
  border-top: 1px solid #f5f5f5;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* 快捷搜索提示 */
.shortcut-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  color: #9ca3af;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease,
    color 0.15s ease;
}

.shortcut-hint:hover {
  background: #f3f4f6;
  color: #6b7280;
  border-color: #d1d5db;
  transform: translateY(-1px);
}

.shortcut-hint:active {
  transform: translateY(0) scale(0.98) !important;
  transition-duration: 0.07s !important;
}

.shortcut-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

kbd {
  margin-left: auto;
  background: #e5e7eb;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 11px;
  font-family: monospace;
  color: #6b7280;
}

/* ===== 用户信息 ===== */
.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.14s ease,
    transform  0.14s ease;
  overflow: hidden;
  margin-top: 2px;
}

.user-info:hover {
  background: rgba(79, 126, 248, 0.06);
  transform: translateX(2px);
}

.user-info:active {
  transform: translateX(0) scale(0.98) !important;
  transition-duration: 0.07s !important;
}

.user-info--collapsed {
  justify-content: center;
  padding: 8px;
}

.user-info--collapsed:hover {
  transform: scale(1.06);
}

.user-avatar {
  flex-shrink: 0;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.user-info:hover .user-avatar {
  transform: scale(1.08);
}

.user-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-chevron {
  width: 14px;
  height: 14px;
  color: #9ca3af;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.user-info:hover .user-chevron {
  transform: rotate(90deg);
}

/* ===== 折叠按钮 ===== */
.sidebar__collapse-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
  flex-shrink: 0;
  margin-left: auto;
}

.sidebar__collapse-btn:hover {
  background: #f3f4f6;
  color: #374151;
  transform: scale(1.10);
}

.sidebar__collapse-btn:active {
  transform: scale(0.92) !important;
  transition-duration: 0.07s !important;
}

.collapse-icon {
  width: 16px;
  height: 16px;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.rotate-180 {
  transform: rotate(180deg);
}

/* ===== 文字淡入淡出动画 ===== */
.fade-text-enter-active,
.fade-text-leave-active {
  transition: opacity 0.15s ease, max-width 0.25s ease;
  overflow: hidden;
}

.fade-text-enter-from,
.fade-text-leave-to {
  opacity: 0;
  max-width: 0;
}

.fade-text-enter-to,
.fade-text-leave-from {
  opacity: 1;
  max-width: 200px;
}
</style>
