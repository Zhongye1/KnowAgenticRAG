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

onMounted(() => document.addEventListener('keydown', handleKeydown));
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
</style>
