/**
 * useScrollReveal — 滚动触发渐入动效
 *
 * 用法：
 * 1. 给元素加 class="reveal"（或 reveal-left / reveal-right / reveal-scale）
 * 2. 在组件 mounted 后调用 useScrollReveal()
 * 3. 离开视口时自动重置（可选 once 参数）
 *
 * 示例：
 *   import { useScrollReveal } from '@/composables/useScrollReveal'
 *   onMounted(() => useScrollReveal())
 */

import { onMounted, onUnmounted } from 'vue'

interface ScrollRevealOptions {
  rootMargin?: string // 触发偏移，默认 "-60px"
  threshold?: number // 可见比例，默认 0.12
  once?: boolean // 只触发一次，默认 true
  selector?: string // 目标选择器，默认 ".reveal, .reveal-left, .reveal-right, .reveal-scale"
}

let observer: IntersectionObserver | null = null

export function useScrollReveal(options: ScrollRevealOptions = {}) {
  const {
    rootMargin = '-60px 0px',
    threshold = 0.12,
    once = true,
    selector = '.reveal, .reveal-left, .reveal-right, .reveal-scale'
  } = options

  const setup = () => {
    observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal--visible')
            if (once) observer?.unobserve(entry.target)
          } else if (!once) {
            entry.target.classList.remove('reveal--visible')
          }
        })
      },
      { rootMargin, threshold }
    )

    document.querySelectorAll<HTMLElement>(selector).forEach(el => {
      // 如果是 reveal-group，改为观察子元素
      if (el.classList.contains('reveal-group')) {
        el.querySelectorAll<HTMLElement>('*').forEach(child => {
          child.classList.add('reveal')
          observer?.observe(child)
        })
      } else {
        observer?.observe(el)
      }
    })
  }

  onMounted(setup)

  onUnmounted(() => {
    observer?.disconnect()
    observer = null
  })

  return { refresh: setup }
}

/**
 * initScrollReveal — 全局版本，不依赖 Vue 生命周期
 * 适合在 App.vue 或路由钩子中调用
 */
export function initScrollReveal(options: ScrollRevealOptions = {}) {
  const {
    rootMargin = '-50px 0px',
    threshold = 0.1,
    once = true,
    selector = '.reveal, .reveal-left, .reveal-right, .reveal-scale'
  } = options

  if (typeof window === 'undefined') return

  const obs = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal--visible')
          if (once) obs.unobserve(entry.target)
        } else if (!once) {
          entry.target.classList.remove('reveal--visible')
        }
      })
    },
    { rootMargin, threshold }
  )

  document.querySelectorAll<HTMLElement>(selector).forEach(el => {
    obs.observe(el)
  })

  return obs
}

/**
 * useRipple — 波纹点击效果
 *
 * 用法：
 *   import { useRipple } from '@/composables/useScrollReveal'
 *   // 在模板中：@mousedown="ripple"
 *   const { ripple } = useRipple()
 */
export function useRipple() {
  const ripple = (e: MouseEvent) => {
    const target = e.currentTarget as HTMLElement
    if (!target) return

    // 确保有相对定位和overflow:hidden
    const style = window.getComputedStyle(target)
    if (style.position === 'static') target.style.position = 'relative'
    if (style.overflow !== 'hidden') target.style.overflow = 'hidden'

    const rect = target.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height) * 2
    const x = e.clientX - rect.left - size / 2
    const y = e.clientY - rect.top - size / 2

    const wave = document.createElement('span')
    wave.className = 'ripple-wave'
    wave.style.cssText = `
      width:${size}px; height:${size}px;
      left:${x}px; top:${y}px;
    `
    target.appendChild(wave)

    // 动画结束后移除
    wave.addEventListener('animationend', () => wave.remove())
  }

  return { ripple }
}
