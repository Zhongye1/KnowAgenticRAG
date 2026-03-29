<template>
  <t-header class="shadow-sm bg-white border-b border-gray-200">
    <t-head-menu theme="light" :value="currentMenuItem" height="80px" class="flex items-center">
      <template #logo>
        <h2 class="logo-title font-bold text-blue-600 text-xl flex items-center">
          <t-icon name="cloud" class="mr-2 text-blue-500" />
          RAGF-01
        </h2>
      </template>

      <t-menu-item
        value="item1"
        class="mx-1 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
        :class="{
          'bg-blue-50 text-blue-600': $route.path === '/knowledge',
          'text-gray-700 hover:bg-gray-100': $route.path !== '/knowledge'
        }"
        @click="navigateTo('/knowledge')"
      >
        <t-icon name="book" class="mr-2" />
        知识库
      </t-menu-item>

      <t-menu-item
        value="item2"
        class="mx-1 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
        :class="{
          'bg-blue-50 text-blue-600': $route.path === '/chat',
          'text-gray-700 hover:bg-gray-100': $route.path !== '/chat'
        }"
        @click="navigateTo('/chat')"
      >
        <t-icon name="chat" class="mr-2" />
        对话
      </t-menu-item>
      <t-menu-item
        value="itemacmd"
        class="mx-1 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
        :class="{
          'bg-blue-50 text-blue-600': $route.path === '/acmd_sre',
          'text-gray-700 hover:bg-gray-100': $route.path !== '/acmd_sre'
        }"
        @click="navigateTo('/acmd_sre')"
      >
        <t-icon name="mobile-list" class="mr-2" />
        学术检索
      </t-menu-item>

      <t-menu-item
        value="item3"
        class="mx-1 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
        :class="{
          'bg-blue-50 text-blue-600': $route.path === '/service',
          'text-gray-700 hover:bg-gray-100': $route.path !== '/service'
        }"
        @click="navigateTo('/service')"
      >
        <t-icon name="server" class="mr-2" />
        模型管理
      </t-menu-item>

      <t-menu-item
        value="item5"
        class="mx-1 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
        :class="{
          'bg-blue-50 text-blue-600': $route.path === '/files',
          'text-gray-700 hover:bg-gray-100': $route.path !== '/files'
        }"
        @click="navigateTo('/files')"
      >
        <t-icon name="file" class="mr-2" />
        文件管理
      </t-menu-item>

      <t-menu-item
        value="item4"
        class="mx-1 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
        :class="{
          'bg-blue-50 text-blue-600': $route.path.startsWith('/user'),
          'text-gray-700 hover:bg-gray-100': !$route.path.startsWith('/user')
        }"
        @click="navigateTo('/user')"
      >
        <t-icon name="user" class="mr-2" />
        个人主页
      </t-menu-item>

      <t-menu-item
        value="item6"
        class="mx-1 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200"
        :class="{
          'bg-blue-50 text-blue-600': $route.path === '/DOC',
          'text-gray-700 hover:bg-gray-100': $route.path !== '/DOC'
        }"
        @click="navigateTo('/DOC')"
      >
        <t-icon name="mobile-list" class="mr-2" />
        开发文档
      </t-menu-item>
      <div class="w-10"></div>

      <template #operations>
        <div class="flex items-center ml-4 space-x-1">
          <t-tooltip content="GitHub仓库" placement="bottom">
            <t-button
              theme="default"
              shape="square"
              variant="text"
              class="rounded-lg hover:bg-gray-100 transition-colors duration-200 p-2"
              @click="navToGitHub"
            >
              <t-icon name="logo-github" class="text-lg text-gray-600" />
            </t-button>
          </t-tooltip>

          <t-tooltip content="帮助文档" placement="bottom">
            <t-button
              theme="default"
              shape="square"
              variant="text"
              class="rounded-lg hover:bg-gray-100 transition-colors duration-200 p-2"
              @click="navToHelper"
            >
              <t-icon name="help-circle" class="text-lg text-gray-600" />
            </t-button>
          </t-tooltip>

          <t-tooltip content="返回首页" placement="bottom">
            <t-button
              theme="default"
              shape="square"
              variant="text"
              class="rounded-lg hover:bg-gray-100 transition-colors duration-200 p-2"
              @click="navigateTo('/knowledge')"
            >
              <t-icon name="home" class="text-lg text-gray-600" />
            </t-button>
          </t-tooltip>

          <div class="h-6 w-px bg-gray-300 mx-2"></div>

          <!-- 用户头像和下拉菜单 -->
          <t-dropdown :min-column-width="130" trigger="click" placement="bottom-right">
            <t-avatar
              :image="userAvatar"
              :hide-on-load-failed="false"
              size="medium"
              class="cursor-pointer border-2 border-transparent hover:border-blue-500 transition-all duration-200"
            />
            <template #dropdown>
              <t-dropdown-menu class="rounded-lg shadow-lg">
                <t-dropdown-item
                  class="px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 rounded-md mx-2 mt-2 transition-colors duration-200"
                  @click="goToProfile"
                >
                  <t-icon name="user" class="text-blue-500" />
                  <span class="ml-2">个人中心</span>
                </t-dropdown-item>
                <!---  <t-dropdown-item @click="toggleSettingPanel"
                  class="px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 rounded-md mx-2 transition-colors duration-200">
                  <t-icon name="setting" class="text-blue-500" />
                  <span class="ml-2">系统设置</span>
                </t-dropdown-item>-->
                <t-dropdown-item
                  divided
                  class="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md mx-2 mb-2 transition-colors duration-200"
                  @click="logout"
                >
                  <t-icon name="logout" class="text-red-500" />
                  <span class="ml-2">退出登录</span>
                </t-dropdown-item>
              </t-dropdown-menu>
            </template>
          </t-dropdown>
        </div>
      </template>
    </t-head-menu>
  </t-header>

  <t-drawer
    v-model:visible="drawerVisible"
    placement="bottom"
    :header="'设置面板'"
    :footer="null"
    size="400px"
  >
    <!-- 在这里挂载你的子组件 -->
    <your-child-component />
    <div class="text-center py-8">
      <t-icon name="info-circle" class="text-5xl text-blue-500 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 mb-2">功能即将上线</h3>
      <p class="text-gray-500 max-w-md mx-auto">我们正在努力开发中，请耐心等待！</p>
    </div>
  </t-drawer>
</template>

<script setup lang="ts">
//import CanvasPoint from './canvas-point-unit/CanvasPoint.vue';
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'

import { useDataUserStore } from '@/store'

const userStore = useDataUserStore()

import API_ENDPOINTS from '@/utils/apiConfig'

// 修改 userAvatar 计算属性，添加加载状态处理
const userAvatar = computed(() => {
  // 如果用户数据还未加载，返回默认头像
  if (!userStore.userData) {
    console.log('用户头像数据未加载')
    return 'https://tdesign.gtimg.com/site/avatar.jpg'
  }

  const avatar = userStore.userData?.avatar || ''
  if (avatar && avatar.startsWith('/static/')) {
    return API_ENDPOINTS.USER.AVATAR(avatar)
  }
  return avatar || 'https://tdesign.gtimg.com/site/avatar.jpg'
})

const goToProfile = () => {
  router.push('/user/userInfo')
}

const logout = async () => {
  try {
    await router.push('/LogonOrRegister')
    MessagePlugin.success('已登出账号')
  } catch (error) {
    console.error('路由跳转失败:', error)
  }
}

// 在组件挂载时立即获取用户数据
onMounted(async () => {
  try {
    // 即使用户数据已存在，也尝试重新获取以确保是最新的
    await userStore.fetchUserData()
    handleUserDropdownOpen()
  } catch (error) {
    console.error('获取用户数据失败:', error)
    // 即使获取失败，也使用默认头像，不影响页面显示
  }
})

// 添加一个方法来主动刷新用户数据
const refreshUserAvatar = async () => {
  try {
    await userStore.fetchUserData()
  } catch (error) {
    console.error('刷新用户数据失败:', error)
  }
}

// 在用户执行操作时（如打开下拉菜单）刷新用户数据
const handleUserDropdownOpen = () => {
  // 可以在这里添加刷新逻辑
  refreshUserAvatar()
}

const route = useRoute()
const router = useRouter()

const currentMenuItem = computed(() => {
  const path = route.path

  if (path.startsWith('/chat')) {
    return 'item2'
  }
  //匹配特殊路由，因为类型问题把它拿出来了

  switch (path) {
    case '/knowledge':
      return 'item1'
    case '/service':
      return 'item3'
    case '/files':
      return 'item5'
    case '/DOC':
      return 'item6'
    case '/acmd_sre':
      return 'itemacmd'
    default:
      // 处理所有以 /user 开头的路径
      if (path.startsWith('/user')) {
        return 'item4'
      }
      return ''
  }
})

const navigateTo = (path: string) => {
  router.push(path)
}

//import { useSettingStore } from '@/store';

//const settingStore = useSettingStore();

const navToGitHub = () => {
  window.open('https://github.com/Zhongye1')
}

const navToHelper = () => {
  window.open('https://tdesign.tencent.com/vue-next/overview')
  // 你的帮助页面链接
}

// 新增 toggleSettingPanel 方法
const drawerVisible = ref(false)
const toggleSettingPanel = () => {
  drawerVisible.value = !drawerVisible.value
}
</script>
