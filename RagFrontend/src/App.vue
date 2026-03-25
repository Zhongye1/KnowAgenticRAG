<template>
  <t-config-provider :global-config="{ classPrefix: 't' }">
    <ErrorBoundary>
      <!-- 登录页：不显示侧边栏 -->
      <div v-if="!showSidebar" class="app-fullpage">
        <router-view />
      </div>

      <!-- 主应用布局：左侧导航 + 右侧内容 -->
      <div v-else class="app-layout">
        <SideBar @openSearch="openSearch" />
        <main class="app-main">
          <router-view />
        </main>
      </div>
    </ErrorBoundary>
    <!-- 全局快捷搜索 -->
    <GlobalSearch :visible="searchVisible" @close="searchVisible = false" />
  </t-config-provider>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import SideBar from './components/SideBar.vue';
import GlobalSearch from './components/GlobalSearch.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';
import "@/assets/scroll.css";

const route = useRoute();

// 不需要显示侧边栏的路由（登录/注册页）
const hideSidebarRoutes = ['/LogonOrRegister'];
const showSidebar = computed(() => !hideSidebarRoutes.includes(route.path));

// 全局搜索开关
const searchVisible = ref(false);
const openSearch = () => { searchVisible.value = true; };

// 全局 Ctrl+K 快捷键
const handleKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchVisible.value = true;
  }
};

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  // 恢复已保存的外观设置
  const savedFontSize = localStorage.getItem('fontSize') || 'md'
  const fontMap: Record<string, string> = { sm: '13px', md: '14px', lg: '16px' }
  const px = fontMap[savedFontSize] || '14px'
  document.documentElement.style.fontSize = px
  document.documentElement.style.setProperty('--td-font-size-base', px)
  document.body.setAttribute('data-font-size', savedFontSize)
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme === 'dark') document.documentElement.classList.add('dark')
  const colorMap: Record<string, string> = {
    blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6', cyan: '#06b6d4',
    teal: '#14b8a6', green: '#22c55e', orange: '#f97316', rose: '#f43f5e',
  }
  const savedColor = localStorage.getItem('themeColor') || 'blue'
  document.documentElement.style.setProperty('--color-primary', colorMap[savedColor] || '#3b82f6')
})
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
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
</style>
