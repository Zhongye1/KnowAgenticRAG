<template>
  <div class="min-h-screen relative font-sans overflow-hidden">
    <!-- 背景：广州珠江新城夜景风格渐变 + 城市剪影 -->
    <div class="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d2240] to-[#0a1c35]"></div>
    <!-- 背景装饰：光带与城市轮廓感 -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <!-- 珠江水面倒影感光晕 -->
      <div class="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[#1a3a6e]/30 to-transparent"></div>
      <!-- 远处高楼光晕 -->
      <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl"></div>
      <div class="absolute top-1/3 right-1/4 w-80 h-80 bg-cyan-400/5 rounded-full blur-3xl"></div>
      <div class="absolute bottom-1/4 left-1/2 w-64 h-64 bg-indigo-500/8 rounded-full blur-2xl"></div>
      <!-- 网格线背景 -->
      <div class="absolute inset-0 opacity-[0.04]"
        style="background-image: linear-gradient(#4a9eff 1px, transparent 1px), linear-gradient(90deg, #4a9eff 1px, transparent 1px); background-size: 60px 60px;">
      </div>
      <!-- 流动光线 -->
      <div class="absolute top-0 left-1/3 w-px h-full bg-gradient-to-b from-transparent via-cyan-400/20 to-transparent animate-pulse"></div>
      <div class="absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-blue-400/15 to-transparent animate-pulse" style="animation-delay:1s"></div>
    </div>

    <!-- 顶部标题区域 -->
    <div class="text-center py-10 relative z-10">
      <div class="flex items-center justify-center gap-3 mb-3">
        <!-- 项目图标 -->
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
          <svg viewBox="0 0 24 24" fill="none" class="w-6 h-6" stroke="white" stroke-width="1.8">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" opacity="0.8"/>
          </svg>
        </div>
        <div class="text-4xl font-light text-white tracking-widest drop-shadow-lg">RAG-F</div>
        <div class="text-xs text-cyan-400 font-mono bg-cyan-400/10 border border-cyan-400/30 rounded px-2 py-0.5 self-end mb-1">智能知识库</div>
      </div>
      <div class="flex justify-center h-8">
        <vue-typewriter-effect :strings="typewriterStrings" class="text-base text-blue-200/80 font-light" :loop="true" />
      </div>
    </div>

    <!-- 主要内容区域 -->
    <div class="grid grid-cols-[1fr_1fr] gap-16 max-w-6xl mx-auto px-8 pb-16 relative z-10">
      <!-- 左侧 Logo 粒子区域 -->
      <div class="relative flex flex-col h-full items-center gap-8">
        <div
          class="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 sticky top-8 min-h-[400px] flex flex-col items-center justify-center w-full">

          <!-- 粒子 Logo 展示 -->
          <div v-if="currentDisplayImage.src" class="relative w-full">
            <transition name="image-fade" mode="out-in">
              <DynamicLogo :key="currentDisplayImage.src" :logo-src="currentDisplayImage.src"
                class="w-full object-cover rounded-xl" />
            </transition>
            <!-- 标题覆盖层 -->
            <div class="absolute bottom-4 left-4 right-4 bg-black/40 backdrop-blur-sm rounded-lg p-3">
              <transition name="text-fade" mode="out-in">
                <p :key="currentDisplayImage.alt" class="text-white/90 text-sm font-light text-center tracking-wide">
                  {{ currentDisplayImage.alt }}
                </p>
              </transition>
            </div>
          </div>

          <!-- 底部功能标签 -->
          <div class="flex gap-2 mt-6 flex-wrap justify-center">
            <span v-for="tag in featureTags" :key="tag.label"
              class="flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-white/10 text-white/60 bg-white/5">
              <span>{{ tag.icon }}</span>
              <span>{{ tag.label }}</span>
            </span>
          </div>
        </div>

        <!-- 装饰性元素 -->
        <div class="absolute -top-4 -right-4 w-20 h-20 pointer-events-none">
          <div class="absolute w-12 h-12 border border-cyan-400/20 rounded-full animate-spin-slow"></div>
          <div class="absolute top-1/2 left-1/2 w-16 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent transform -translate-x-1/2 -translate-y-1/2 animate-pulse"></div>
        </div>
      </div>

      <!-- 右侧登录注册区域 -->
      <div class="grid grid-rows-[auto_1fr] gap-12">
        <div class="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-8 min-h-[450px]">
          <LoginRegisterForm @image-change="handleImageChange" @form-submit="handleFormSubmit" />
        </div>
      </div>
    </div>

    <!-- 全局加载遮罩 -->
    <div v-if="isLoading" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div class="bg-white/10 backdrop-blur-lg rounded-xl p-8 border border-white/20">
        <div class="flex items-center space-x-4">
          <div class="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
          <span class="text-white font-light">{{ loadingText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import DynamicLogo from '@/components/canvas-point-unit/DynamicLogo.vue'
import LoginRegisterForm from './LoginRegisterForm.vue'
import VueTypewriterEffect from 'vue-typewriter-effect'

const currentImageKey = ref<string>('welcome')
const isLoading = ref(false)
const loadingText = ref('')

// 粒子 Logo 图片映射 — 全部使用与项目主题相符的开源/可公开图像
// 使用通用技术/AI 相关视觉，避免任何校徽/校名
const imageMap: Record<string, { src: string; alt: string }> = {
  welcome: {
    // 知识图谱/神经网络风格 logo — 项目特点图
    src: 'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=400&q=80',
    alt: '智能知识管理 · 让知识触手可及'
  },
  login: {
    // 数字光线/数据流
    src: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=400&q=80',
    alt: '安全登录 · 保护您的知识资产'
  },
  register: {
    // 抽象科技节点
    src: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
    alt: '加入我们 · 开启智能知识之旅'
  },
  forgot: {
    // 简洁抽象蓝色
    src: 'https://images.unsplash.com/photo-1604079628040-94301bb21b91?w=400&q=80',
    alt: '找回密码 · 安全验证您的身份'
  },
  success: {
    // 成功/完成感绿光
    src: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&q=80',
    alt: '验证成功 · 欢迎回来'
  }
}

const currentDisplayImage = computed(() => imageMap[currentImageKey.value] || imageMap.welcome)

// 功能标签
const featureTags = [
  { icon: '🧠', label: 'RAG 检索增强' },
  { icon: '📚', label: '知识库管理' },
  { icon: '🤖', label: 'Agent 推理' },
  { icon: '🔒', label: '端到端加密' },
  { icon: '🌐', label: '多模型支持' },
]

const handleImageChange = (imageKey: string) => {
  currentImageKey.value = imageKey
}

const handleFormSubmit = async (data: any) => {
  isLoading.value = true
  loadingText.value = data.type === 'login' ? '正在登录...' : '正在注册...'
  try {
    if (data.token) {
      localStorage.setItem('jwt', data.token)
      const redirectUrl = new URLSearchParams(window.location.search).get('redirect') || '/knowledge'
      window.location.href = redirectUrl
    } else {
      console.error(`${data.type === 'login' ? '登录' : '注册'}失败: 未获取到token`)
      alert(`${data.type === 'login' ? '登录' : '注册'}失败: 未获取到访问令牌`)
    }
  } catch (error) {
    console.error('认证失败:', error)
    alert('认证过程中发生错误，请稍后重试')
  } finally {
    isLoading.value = false
    loadingText.value = ''
  }
}

const typewriterStrings = computed(() => [
  '安全、便捷、智能的知识管理解决方案',
  '基于 RAG 的多模型知识检索系统',
  '让您的知识库拥有 AI 的力量',
])
</script>

<style scoped>
.image-fade-enter-active,
.image-fade-leave-active {
  transition: all 0.4s ease-in-out;
}
.image-fade-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}
.image-fade-leave-to {
  opacity: 0;
  transform: scale(1.05) translateY(-10px);
}
.text-fade-enter-active,
.text-fade-leave-active {
  transition: all 0.3s ease;
}
.text-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.text-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
@keyframes spin-slow {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.animate-spin-slow {
  animation: spin-slow 20s linear infinite;
}
</style>
