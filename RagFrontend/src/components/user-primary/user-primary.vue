<template>
  <div class="p-6">
    <!-- 基本信息 -->
    <section class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-100">
        基本信息
      </h2>

      <div class="flex flex-col md:flex-row items-start gap-8">
        <!-- 头像区域 -->
        <div class="flex flex-col items-center w-48 md:w-64">
          <t-avatar
            :image="displayAvatar"
            :hide-on-load-failed="false"
            size="x-large"
            class="w-32 h-32 md:w-48 md:h-48"
          />
          <t-button class="mt-3" variant="outline" size="small" @click="changeAvatar">
            <template #icon>
              <t-icon name="edit" />
            </template>
            更改头像
          </t-button>
          <!-- 添加隐藏的文件输入框 -->
          <input
            ref="avatarInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleAvatarUpload"
          />
        </div>

        <!-- 基础信息 -->
        <div class="flex-1 w-full">
          <t-form label-align="left" :data="userInfo" @submit="onSubmit">
            <t-form-item label="姓名">
              <t-input v-model="userInfo.name" placeholder="请输入您的姓名" />
            </t-form-item>
            <t-form-item label="公开邮箱">
              <t-input v-model="userInfo.publicEmail" placeholder="公开的邮箱地址" />
            </t-form-item>
            <t-form-item label="个人简介">
              <t-textarea v-model="userInfo.bio" placeholder="简单介绍一下自己" />
            </t-form-item>

            <!---
            <t-form-item label="社交账号">
              <t-input v-model="userInfo.url" placeholder="社交账号地址" />
            </t-form-item>-->
            <t-form-item>
              <t-button theme="primary" type="submit">保存</t-button>
            </t-form-item>
          </t-form>
        </div>
      </div>
    </section>

    <!-- 用户体验改进 -->
    <section class="mb-8 p-5 bg-blue-50 rounded-lg border border-blue-100">
      <div class="flex items-start">
        <div class="flex-shrink-0 mt-0.5">
          <div class="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-3 w-3 text-white"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
        </div>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-blue-800">用户体验改善计划</h3>
          <p class="text-sm text-blue-700 mt-1">
            加入我们的用户体验改善计划，帮助我们提供更好的产品体验。您的反馈对我们非常重要。
          </p>
          <div class="mt-3 flex items-center">
            <t-switch v-model="uxImprovement" size="small" @change="onUxImprovementChange" />
            <span class="ml-2 text-sm text-blue-700">加入用户体验改善计划</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 其他设置 -->
    <section class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-100">
        偏好设置
      </h2>

      <div class="space-y-5">
        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100"
        >
          <div>
            <h3 class="text-gray-900 font-medium">开发模式</h3>
            <p class="text-gray-500 text-sm mt-1">选择您的开发工作流程</p>
          </div>
          <div class="mt-2 sm:mt-0 w-full sm:w-auto">
            <t-select
              v-model="userInfo.devMode"
              :options="devModeOptions"
              class="w-full sm:w-64"
              @change="onDevModeChange"
            />
          </div>
        </div>

        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100"
        >
          <div>
            <h3 class="text-gray-900 font-medium">默认语言</h3>
            <p class="text-gray-500 text-sm mt-1">设置界面显示语言</p>
          </div>
          <div class="mt-2 sm:mt-0 w-full sm:w-auto">
            <t-select
              v-model="userInfo.language"
              :options="languageOptions"
              class="w-full sm:w-64"
              @change="onLanguageChange"
            />
          </div>
        </div>

        <div
          class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100"
        >
          <div>
            <h3 class="text-gray-900 font-medium">通知设置</h3>
            <p class="text-gray-500 text-sm mt-1">管理您接收的通知类型</p>
          </div>
          <div class="mt-2 sm:mt-0">
            <t-button theme="primary" variant="outline" size="small">配置</t-button>
          </div>
        </div>
      </div>
    </section>

    <!-- 危险区域 -->
    <section class="pt-6 border-t border-gray-100">
      <h2 class="text-xl font-semibold text-gray-900 mb-6">其他操作</h2>
      <div class="border border-yello-200 rounded-lg p-5 bg-yellow-50">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between">
          <div>
            <h3 class="text-gray-900 font-medium">登出</h3>
            <p class="text-gray-600 text-sm mt-1">返回登录页面</p>
          </div>
          <div class="mt-3 sm:mt-0">
            <t-button theme="danger" variant="outline" size="small" @click="onLogoutAccount"
              >登出账号</t-button
            >
          </div>
        </div>
      </div>
      <div class="h-5"></div>
      <div class="border border-red-200 rounded-lg p-5 bg-red-50">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between">
          <div>
            <h3 class="text-gray-900 font-medium">账号注销</h3>
            <p class="text-gray-600 text-sm mt-1">注销后所有数据将被永久删除，请谨慎操作。</p>
          </div>
          <div class="mt-3 sm:mt-0">
            <t-button theme="danger" variant="outline" size="small" @click="onDeleteAccount"
              >注销账号</t-button
            >
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useDataUserStore } from '@/store/modules/useDataUser'
import { Icon as TIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import API_ENDPOINTS from '@/utils/apiConfig'
import router from '@/router'
import { setLocale, locale as currentLocale } from '@/i18n'

// 用户体验改进计划开关
const uxImprovement = ref(true)

// 获取用户数据store
const userStore = useDataUserStore()

// 用户信息
const userInfo = reactive({
  avatar: '',
  name: '',
  publicEmail: '',
  bio: '',
  url: '',
  devMode: 'default',
  language: currentLocale.value as string
})

const emails = ref<string[]>([])

const devModeOptions = [{ label: '默认', value: 'default' }]

const languageOptions = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' }
]

// 添加计算属性处理头像URL
const displayAvatar = computed(() => {
  if (userInfo.avatar && userInfo.avatar.startsWith('/static/')) {
    return API_ENDPOINTS.USER.AVATAR(userInfo.avatar)
  }
  return userInfo.avatar
})

// 添加头像输入框的引用
const avatarInput = ref<HTMLInputElement | null>(null)

// 添加更改头像的方法
const changeAvatar = () => {
  if (avatarInput.value) {
    avatarInput.value.click()
  }
}

// 添加处理头像上传的方法
const handleAvatarUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (file) {
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      MessagePlugin.error('请选择图片文件')
      return
    }

    // 验证文件大小（例如限制为5MB）
    if (file.size > 5 * 1024 * 1024) {
      MessagePlugin.error('图片大小不能超过5MB')
      return
    }

    // 创建预览URL
    const reader = new FileReader()
    reader.onload = e => {
      const result = e.target?.result as string
      if (result) {
        userInfo.avatar = result
        MessagePlugin.success('头像已更新，点击保存以应用更改')
      }
    }
    reader.readAsDataURL(file)
  }
}

// 页面加载时获取用户数据
onMounted(async () => {
  try {
    await userStore.fetchUserData()
    // 使用接口返回的数据填充表单
    userInfo.avatar = userStore.userData.avatar || ''
    userInfo.name = userStore.userData.name || ''
    userInfo.publicEmail = userStore.userData.email || ''
    userInfo.bio = userStore.userData.signature || ''
    userInfo.url = userStore.userData.social_media || ''
    // 模拟获取邮箱列表
    emails.value = [userStore.userData.email || '']
  } catch (error) {
    console.error('获取用户数据失败:', error)
    MessagePlugin.error('获取用户数据失败')
  }
})

// 表单提交事件
const onSubmit = async ({
  validateResult,
  firstError
}: {
  validateResult: boolean
  firstError: string
}) => {
  if (validateResult === true) {
    try {
      await userStore.updateUserData(userInfo.name, userInfo.avatar, userInfo.bio)
      //MessagePlugin.success('保存成功');
    } catch (error) {
      console.error('更新用户数据失败:', error)
      MessagePlugin.error('保存失败')
    }
  } else {
    console.error('表单验证失败:', firstError)
    MessagePlugin.error('请检查表单填写是否正确')
  }
}

// 用户体验改善计划变更事件
const onUxImprovementChange = (value: boolean) => {
  MessagePlugin.success(`已${value ? '加入' : '退出'}用户体验改善计划`)
}

// 开发模式变更事件
const onDevModeChange = (value: string) => {
  MessagePlugin.success(`开发模式已更新为: ${value === 'default' ? '默认' : '高级'}`)
}

// 语言设置变更事件 — 真正调用 setLocale 使切换立即生效
const onLanguageChange = (value: string) => {
  setLocale(value as 'zh' | 'en')
  MessagePlugin.success(`界面语言已切换为: ${value === 'zh' ? '中文' : 'English'}`)
}

// 登出账号事件
const onLogoutAccount = () => {
  const dialog = DialogPlugin.confirm({
    header: '确认登出',
    body: '确定要登出账号吗？登出后需要重新登录才能访问。',
    confirmBtn: {
      theme: 'danger',
      content: '确认登出'
    },
    cancelBtn: '取消',
    onConfirm: async () => {
      try {
        await router.push('/LogonOrRegister')
        MessagePlugin.success('已登出账号')
      } catch (error) {
        console.error('路由跳转失败:', error)
      } finally {
        dialog.destroy() // 确保dialog关闭
      }
    }
  })
}

// 注销账号事件
const onDeleteAccount = () => {
  const dialog = DialogPlugin.confirm({
    header: '确认注销',
    body: '确定要注销账号吗？注销后所有数据将被永久删除，无法恢复。',
    confirmBtn: {
      theme: 'danger',
      content: '确认注销'
    },
    cancelBtn: '取消',
    onConfirm: async () => {
      try {
        MessagePlugin.success('账号注销成功，将跳转到登录页面')
        await router.push('/LogonOrRegister')
      } catch (error) {
        console.error('路由跳转失败:', error)
      } finally {
        dialog.destroy() // 确保dialog关闭
      }
    }
  })
}
</script>
