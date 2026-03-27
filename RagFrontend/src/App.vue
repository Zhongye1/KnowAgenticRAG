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
    <!-- 全局评测进度浮层（评测运行时始终可见） -->
    <div v-if="showSidebar && evalStore.isRunning" class="eval-toast-bar" @click="goToEval">
      <span class="eval-toast-spinner"></span>
      <span class="eval-toast-text">{{ evalStore.progress || `正在评测 ${evalStore.models}...` }}</span>
      <span class="eval-toast-link">查看详情 →</span>
    </div>
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
import { applyAllAppearance } from './composables/useTheme';
import { setLocale } from './i18n/index';
import { useEvalStore } from './store';
import "@/assets/scroll.css";
import "@/styles/animations.css";

const route  = useRoute();
const router = useRouter();

// 评测全局状态
const evalStore = useEvalStore();
const goToEval = () => router.push('/settings');

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

  // ── 恢复外观设置（统一由 useTheme 管理，单一数据源）──
  applyAllAppearance();

  // ── 初始化语言设置（确保默认语言在每次启动时生效）──
  const savedLocale = localStorage.getItem('locale') as 'zh' | 'en' | null;
  if (savedLocale && (savedLocale === 'zh' || savedLocale === 'en')) {
    setLocale(savedLocale);
  }

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
  background-color: var(--app-bg, #f9fafb);
}

/* 主布局：左侧导航 + 右侧内容 */
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: var(--app-bg, #f9fafb);
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

/* ── 全局评测进度浮层 ── */
.eval-toast-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  background: #1e1e2e;
  color: #e2e8f0;
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 13px;
  z-index: 9999;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0,0,0,0.25);
  animation: toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1);
}
.eval-toast-bar:hover {
  background: #2d2d45;
}
@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(16px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.eval-toast-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.2);
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
.eval-toast-text { flex: 1; white-space: nowrap; max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
.eval-toast-link { color: #818cf8; font-weight: 600; flex-shrink: 0; }
</style>
