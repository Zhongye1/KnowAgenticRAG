<template>
  <t-config-provider :global-config="{ classPrefix: 't' }">
    <ErrorBoundary>
      <!-- 路由切换顶部进度条 -->
      <div v-if="pageLoading" class="page-loading-bar" />

      <!-- 登录页：不显示侧边栏 -->
      <div v-if="!showSidebar" class="app-fullpage">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>

      <!-- 主应用布局：左侧导航 + 右侧内容 -->
      <div v-else class="app-layout">
        <SideBar @openSearch="openSearch" />
        <main class="app-main" ref="mainRef">
          <router-view v-slot="{ Component }">
            <transition name="page" mode="out-in"
              @before-enter="onPageBeforeEnter"
              @after-enter="onPageAfterEnter"
            >
              <component :is="Component" />
            </transition>
          </router-view>
        </main>
      </div>
    </ErrorBoundary>

    <!-- 全局快捷搜索 -->
    <GlobalSearch :visible="searchVisible" @close="searchVisible = false" />
    <!-- 右侧智能助理（登录后显示） -->
    <SmartAssistant v-if="showSidebar" />
    <!-- 回到顶部 FAB -->
    <BackToTop v-if="showSidebar" />
  </t-config-provider>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SideBar from './components/SideBar.vue';
import GlobalSearch from './components/GlobalSearch.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';
import SmartAssistant from './components/SmartAssistant.vue';
import BackToTop from './components/BackToTop.vue';
import { initInteractions } from './composables/useInteractions';
import "@/assets/scroll.css";
import "@/styles/animations.css";

const route  = useRoute();
const router = useRouter();

// 不需要显示侧边栏的路由（登录/注册页）
const hideSidebarRoutes = ['/LogonOrRegister'];
const showSidebar = computed(() => !hideSidebarRoutes.includes(route.path));

// 全局搜索开关
const searchVisible = ref(false);
const openSearch = () => { searchVisible.value = true; };

// 页面切换顶部进度条
const pageLoading = ref(false);
router.beforeEach(() => { pageLoading.value = true });
router.afterEach(() => { setTimeout(() => { pageLoading.value = false }, 350) });

// 路由切换后触发动效初始化
const onPageBeforeEnter = () => { /* 页面开始进入 */ };
const onPageAfterEnter  = () => {
  // DOM 就绪后重新扫描 reveal 元素 & 注入 ripple
  setTimeout(() => initInteractions(), 50);
};

// 主内容区 ref（用于 BackToTop 的滚动监听）
const mainRef = ref<HTMLElement | null>(null);

// 全局 Ctrl+K 快捷键
const handleKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchVisible.value = true;
  }
};

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);

  // ── 恢复外观设置 ──
  const savedFontSize = localStorage.getItem('fontSize') || 'md';
  const fontMap: Record<string, string> = { sm: '13px', md: '14px', lg: '16px' };
  const px = fontMap[savedFontSize] || '14px';
  document.documentElement.style.fontSize = px;
  document.documentElement.style.setProperty('--td-font-size-base', px);
  document.body.setAttribute('data-font-size', savedFontSize);

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') document.documentElement.classList.add('dark');

  const colorMap: Record<string, string> = {
    blue:   '#3b82f6', indigo:  '#6366f1', violet: '#8b5cf6', cyan:  '#06b6d4',
    teal:   '#14b8a6', green:   '#22c55e', orange: '#f97316', rose:  '#f43f5e',
  };
  const savedColor = localStorage.getItem('themeColor') || 'blue';
  document.documentElement.style.setProperty('--color-primary', colorMap[savedColor] || '#3b82f6');

  // ── 初始化全局交互动效 ──
  initInteractions(router);
});

onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>

<style>
* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
}

#app {
  height: 100vh;
  width: 100vw;
}

/* 登录页全屏 */
.app-fullpage {
  height: 100vh;
  width: 100vw;
  background-color: #f9fafb;
}

/* 主布局：左侧导航 + 右侧内容 */
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: #f9fafb;
  overflow: hidden;
}

/* 右侧主内容区 */
.app-main {
  flex: 1;
  height: 100vh;
  overflow: hidden;
  min-width: 0;
}

/* 页面过渡动效 */
.page-enter-active {
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
.page-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
