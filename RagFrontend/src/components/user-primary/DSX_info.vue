<template>
  <div class="p-6">
    <!-- 外观设置页面 -->
    <section v-if="activePage === '#1'" class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-100">
        外观设置
      </h2>

      <div class="text-center py-12">
        <t-icon name="palette" class="text-5xl text-blue-500 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 mb-2">功能即将上线</h3>
        <p class="text-gray-500 max-w-md mx-auto">我们正在开发个性化的外观设置功能，敬请期待！</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div class="border border-gray-200 rounded-lg p-5 text-center">
          <t-icon name="color-invert" class="text-3xl text-blue-500 mx-auto mb-3" />
          <h4 class="font-medium text-gray-900 mb-2">主题颜色</h4>
          <p class="text-sm text-gray-500">自定义界面主题颜色</p>
        </div>

        <div class="border border-gray-200 rounded-lg p-5 text-center">
          <t-icon name="layout" class="text-3xl text-blue-500 mx-auto mb-3" />
          <h4 class="font-medium text-gray-900 mb-2">布局选项</h4>
          <p class="text-sm text-gray-500">选择不同的界面布局</p>
        </div>

        <div class="border border-gray-200 rounded-lg p-5 text-center">
          <t-icon name="contrast" class="text-3xl text-blue-500 mx-auto mb-3" />
          <h4 class="font-medium text-gray-900 mb-2">深色模式</h4>
          <p class="text-sm text-gray-500">启用深色或浅色主题</p>
        </div>
      </div>
    </section>

    <!-- 第三方账号绑定页面 -->
    <section v-else-if="activePage === '#2'" class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-100">
        第三方账号绑定
      </h2>

      <div class="text-center py-12">
        <t-icon name="link" class="text-5xl text-blue-500 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 mb-2">功能即将上线</h3>
        <p class="text-gray-500 max-w-md mx-auto">
          我们正在开发第三方账号绑定功能，您将可以通过其他平台账号快速登录。
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        <div class="border border-gray-200 rounded-lg p-4 flex items-center">
          <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
            <t-icon name="logo-github" class="text-xl text-blue-500" />
          </div>
          <div>
            <h4 class="font-medium text-gray-900">GitHub</h4>
            <p class="text-xs text-gray-500">待上线</p>
          </div>
        </div>

        <div class="border border-gray-200 rounded-lg p-4 flex items-center">
          <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
            <t-icon name="logo-wechat" class="text-xl text-green-500" />
          </div>
          <div>
            <h4 class="font-medium text-gray-900">微信</h4>
            <p class="text-xs text-gray-500">待上线</p>
          </div>
        </div>

        <div class="border border-gray-200 rounded-lg p-4 flex items-center">
          <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
            <t-icon name="logo-qq" class="text-xl text-blue-400" />
          </div>
          <div>
            <h4 class="font-medium text-gray-900">QQ</h4>
            <p class="text-xs text-gray-500">待上线</p>
          </div>
        </div>

        <div class="border border-gray-200 rounded-lg p-4 flex items-center">
          <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
            <t-icon name="logo-google" class="text-xl text-red-500" />
          </div>
          <div>
            <h4 class="font-medium text-gray-900">Google</h4>
            <p class="text-xs text-gray-500">待上线</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 实验性功能页面 -->
    <section v-else-if="activePage === '#3'" class="mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-100">
        实验性功能
      </h2>

      <div class="text-center py-12">
        <t-icon name="sitemap" class="text-5xl text-blue-500 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 mb-2">探索新功能</h3>
        <p class="text-gray-500 max-w-md mx-auto">
          我们正在开发一些实验性功能，开启后可以体验最新特性。
        </p>
      </div>

      <div class="border border-yellow-200 rounded-lg p-5 bg-yellow-50 mt-6">
        <div class="flex items-start">
          <t-icon name="error" class="text-yellow-500 text-xl mr-3 mt-0.5" />
          <div>
            <h4 class="font-medium text-yellow-800">注意</h4>
            <p class="text-yellow-700 text-sm mt-1">
              实验性功能可能不稳定，仅供测试和体验，请谨慎使用。
            </p>
          </div>
        </div>
      </div>

      <div class="mt-8 space-y-4">
        <div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <h4 class="font-medium text-gray-900">新界面布局</h4>
            <p class="text-sm text-gray-500">尝试全新的界面布局设计</p>
          </div>
          <t-switch size="large" disabled />
        </div>

        <div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <h4 class="font-medium text-gray-900">AI智能助手</h4>
            <p class="text-sm text-gray-500">体验增强版AI功能</p>
          </div>
          <t-switch size="large" disabled />
        </div>

        <div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <h4 class="font-medium text-gray-900">语音交互</h4>
            <p class="text-sm text-gray-500">通过语音与系统交互</p>
          </div>
          <t-switch size="large" disabled />
        </div>
      </div>
    </section>

    <!-- 默认占位页面 -->
    <section v-else class="mb-8">
      <div class="text-center py-12">
        <t-icon name="info-circle" class="text-5xl text-blue-500 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 mb-2">功能即将上线</h3>
        <p class="text-gray-500 max-w-md mx-auto">我们正在努力开发中，请耐心等待！</p>
      </div>
    </section>

    <!-- 敬请期待 -->
    <section class="mt-12 text-center py-8 border-t border-gray-100">
      <h3 class="text-lg font-medium text-gray-900 mb-2">更多功能正在路上</h3>
      <p class="text-gray-500 max-w-2xl mx-auto">
        我们将持续为您带来更多实用功能和更好的使用体验，请保持关注！
      </p>
      <t-button theme="primary" variant="outline" class="mt-4">
        <template #icon>
          <t-icon name="refresh" />
        </template>
        刷新查看最新功能
      </t-button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Icon as TIcon, Switch as TSwitch, Button as TButton } from 'tdesign-vue-next'

const route = useRoute()

const activePage = computed(() => route.path)
</script>
