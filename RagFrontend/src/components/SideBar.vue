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
      <button class="quick-new-btn" @click="navigateTo('/knowledge')" :title="isCollapsed ? '知识库' : ''">
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
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useDataUserStore } from '@/store';
import API_ENDPOINTS from '@/utils/apiConfig';

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
const openGitHub = () => window.open('https://github.com/March030303/KnowledgeRAG-GZHU');

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
];

const toolNavItems: NavItem[] = [
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
    path: '/user',
    label: '个人主页',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
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
  transition: all 0.15s;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
}

.nav-item:hover {
  background: #f5f5f5;
  color: #111827;
}

.nav-item--active {
  background: #eff6ff;
  color: #4f7ef8;
  font-weight: 600;
}

.nav-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: #4f7ef8;
  border-radius: 0 3px 3px 0;
}

.nav-item__icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
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

.nav-item__badge {
  background: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 10px;
  flex-shrink: 0;
}

/* 折叠状态导航项居中 */
.sidebar--collapsed .nav-item {
  justify-content: center;
  padding: 9px;
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
  transition: all 0.2s;
  white-space: nowrap;
}

.shortcut-hint:hover {
  background: #f3f4f6;
  color: #6b7280;
  border-color: #d1d5db;
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
  transition: all 0.15s;
  overflow: hidden;
  margin-top: 2px;
}

.user-info:hover {
  background: #f5f5f5;
}

.user-info--collapsed {
  justify-content: center;
  padding: 8px;
}

.user-avatar {
  flex-shrink: 0;
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
