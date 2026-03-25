<template>
  <t-layout class="bg-gray-50 min-h-screen p-4">
    <t-content class="max-w-6xl max-h-[80vh] mx-auto">
      <!-- 主要内容区域 -->
      <div class="flex lg:flex-row gap-2 mt-8">
        <!-- 左侧导航栏 -->
        <t-aside class="lg:w-64 bg-white h-[80vh] rounded-xl shadow-sm border border-gray-100 p-4">
          <t-menu :value="activeMenu" :collapsed="false" theme="light" variant="default" width="100%" height="100%"
            @change="handleMenuChange">
            <template #logo>
              <div class="uppercase text-blue-600 font-bold text-sm mb-2">账号设置</div>
            </template>

            <t-menu-item v-for="item in mainNav" :key="item.path" :value="item.path">
              <template #icon>
                <t-icon :name="item.icon" class="mr-3 text-lg" />
              </template>
              {{ item.label }}
            </t-menu-item>
          </t-menu>
        </t-aside>

        <!-- 右侧内容区域 -->
        <t-content class="flex-1 bg-white overflow-auto max-h-[80vh] rounded-xl shadow-sm border border-gray-100">
          <!-- 路由区域 -->
          <router-view v-slot="{ Component }">
            <transition name="fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </t-content>
      </div>
    </t-content>
  </t-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";

import { Icon as TIcon, Layout as TLayout, Content as TContent, Aside as TAside, Menu as TMenu, MenuItem as TMenuItem, MenuValue } from "tdesign-vue-next";

const router = useRouter();
const route = useRoute();

// 当前激活的菜单项
const activeMenu = computed(() => route.path);

// 处理菜单切换
const handleMenuChange = (value: MenuValue) => {
  const path = String(value);
  console.log("点击了:", path);
  router.push(path);
};


// 导航配置

const mainNav = ref([
  { label: "基本设置", icon: "user", path: "/user/userInfo" },
  { label: "外观设置", icon: "palette", path: "/user/coming-soon/1" },
  { label: "第三方账号绑定", icon: "link", path: "/user/coming-soon/2" },
  { label: "探索新功能", icon: "lab", path: "/user/coming-soon/3" },
  { label: "反馈与建议", icon: "chat", path: "/user/coming-soon/4" },
  { label: "隐私政策", icon: "certificate", path: "/user/coming-soon/5" },
  { label: "关于本项目", icon: "info-circle", path: "/user/coming-soon/6" },
]);


// 初始化时如果没有子路由，则跳转到默认页面
onMounted(() => {
  if (route.path === "/user") {
    router.push("/user/userInfo");
  }
});
</script>

<style scoped>
/* 自定义滚动条样式 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 82, 217, 0.2);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 82, 217, 0.4);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>