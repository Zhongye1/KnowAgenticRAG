<template>
  <!-- 回到顶部 FAB 按钮 -->
  <transition name="back-to-top">
    <button
      v-if="visible"
      class="back-to-top"
      :class="{ 'back-to-top--scrolling': isScrolling }"
      @click="scrollToTop"
      @mousedown="ripple"
      title="回到顶部"
      aria-label="回到顶部"
    >
      <!-- 进度圆环 -->
      <svg class="back-to-top__ring" viewBox="0 0 36 36">
        <circle
          class="ring-bg"
          cx="18" cy="18" r="15"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          stroke-width="2"
        />
        <circle
          class="ring-progress"
          cx="18" cy="18" r="15"
          fill="none"
          stroke="white"
          stroke-width="2"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="dashOffset"
          transform="rotate(-90 18 18)"
        />
      </svg>
      <!-- 箭头图标 -->
      <svg class="back-to-top__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/>
      </svg>
    </button>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRipple } from '@/composables/useScrollReveal'

const { ripple } = useRipple()

const visible   = ref(false)
const progress  = ref(0)
const isScrolling = ref(false)

const circumference = 2 * Math.PI * 15  // r=15
const dashOffset = computed(() => circumference * (1 - progress.value / 100))

let scrollTimer: ReturnType<typeof setTimeout> | null = null

const updateProgress = () => {
  const scrollTop    = document.documentElement.scrollTop || document.body.scrollTop
  const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight
  progress.value = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0
  visible.value  = scrollTop > 200

  // 滚动中指示
  isScrolling.value = true
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => { isScrolling.value = false }, 150)
}

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', updateProgress, { passive: true })
  // 也监听主内容区滚动（SPA 中 window 可能不滚动）
  document.querySelector('.app-main')?.addEventListener('scroll', updateProgress, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', updateProgress)
  document.querySelector('.app-main')?.removeEventListener('scroll', updateProgress)
  if (scrollTimer) clearTimeout(scrollTimer)
})
</script>

<style scoped>
.back-to-top {
  position: fixed;
  bottom: 32px;
  right: 28px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary, #4f7ef8), #818cf8);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(79, 126, 248, 0.40);
  transition:
    transform  0.22s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.18s ease;
}

.back-to-top:hover {
  transform: translateY(-3px) scale(1.08);
  box-shadow: 0 8px 24px rgba(79, 126, 248, 0.50);
}

.back-to-top:active {
  transform: translateY(0) scale(0.94) !important;
  box-shadow: 0 2px 8px rgba(79, 126, 248, 0.30) !important;
  transition-duration: 0.07s !important;
}

/* 滚动中轻微缩小 */
.back-to-top--scrolling {
  transform: scale(0.92);
  opacity: 0.85;
}

/* 进度圆环 */
.back-to-top__ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.ring-progress {
  transition: stroke-dashoffset 0.3s ease;
}

/* 箭头 */
.back-to-top__arrow {
  position: relative;
  z-index: 1;
  width: 18px;
  height: 18px;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.back-to-top:hover .back-to-top__arrow {
  transform: translateY(-2px);
}
</style>
