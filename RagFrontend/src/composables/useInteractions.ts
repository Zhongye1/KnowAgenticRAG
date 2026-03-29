/**
 * useInteractions — 全局交互动效初始化器
 *
 * 功能：
 * 1. 为所有按钮注入 Ripple 波纹
 * 2. 初始化 ScrollReveal 观察器
 * 3. 为所有可交互元素添加 cursor:pointer
 * 4. 导航栏吸顶监听（添加 .scrolled 类）
 * 5. 监听路由变化，在每次跳转后重新扫描 reveal 元素
 *
 * 在 App.vue 的 onMounted 中调用一次即可。
 */

import { watch } from 'vue'
import type { Router } from 'vue-router'

// ── 波纹效果（复用 useScrollReveal 中的逻辑，独立版） ──
function createRipple(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement
  if (!target) return

  const rect = target.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height) * 2
  const x = e.clientX - rect.left - size / 2
  const y = e.clientY - rect.top - size / 2

  const wave = document.createElement('span')
  wave.className = 'ripple-wave'
  wave.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`
  target.appendChild(wave)
  wave.addEventListener('animationend', () => wave.remove())
}

// ── Ripple：为主要按钮注入波纹 ──
function injectRipple() {
  // 选择器：高频操作按钮
  const selectors = [
    '.t-button--theme-primary',
    '.t-button--variant-base',
    '.quick-new-btn',
    '.btn-primary',
    '.ripple-container'
  ]

  const els = document.querySelectorAll<HTMLElement>(selectors.join(','))
  els.forEach(el => {
    // 防止重复注入
    if (el.dataset.rippleInited) return
    el.dataset.rippleInited = '1'
    el.addEventListener('mousedown', createRipple)
  })
}

// ── ScrollReveal：扫描并观察 .reveal 元素 ──
let revealObserver: IntersectionObserver | null = null

function initReveal() {
  revealObserver?.disconnect()

  revealObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal--visible')
          revealObserver?.unobserve(entry.target)
        }
      })
    },
    { rootMargin: '-50px 0px', threshold: 0.1 }
  )

  const selector = '.reveal, .reveal-left, .reveal-right, .reveal-scale'
  document.querySelectorAll<HTMLElement>(selector).forEach(el => {
    if (!el.classList.contains('reveal--visible')) {
      revealObserver?.observe(el)
    }
  })
}

// ── 导航栏吸顶 ──
function initNavSticky() {
  const navbar = document.querySelector<HTMLElement>('.navbar-sticky')
  if (!navbar) return

  const scrollEl = document.querySelector<HTMLElement>('.app-main') || window

  const handler = () => {
    const scrollTop =
      scrollEl instanceof Window ? window.scrollY : (scrollEl as HTMLElement).scrollTop

    navbar.classList.toggle('scrolled', scrollTop > 10)
  }

  scrollEl.addEventListener('scroll', handler, { passive: true })
}

// ── 主初始化函数 ──
export function initInteractions(router?: Router) {
  // 延迟一帧，确保 DOM 已渲染
  requestAnimationFrame(() => {
    injectRipple()
    initReveal()
    initNavSticky()
  })

  // 路由切换后重新扫描（SPA 核心）
  if (router) {
    watch(
      () => router.currentRoute.value.fullPath,
      () => {
        // 等待新页面 DOM 就绪
        setTimeout(() => {
          injectRipple()
          initReveal()
        }, 80)
      }
    )
  }
}

// ── 全局页面 loading 进度条 ──
let loadingBar: HTMLElement | null = null

export function showPageLoading() {
  if (loadingBar) return
  loadingBar = document.createElement('div')
  loadingBar.className = 'page-loading-bar'
  document.body.appendChild(loadingBar)
}

export function hidePageLoading() {
  if (!loadingBar) return
  loadingBar.style.opacity = '0'
  loadingBar.style.transition = 'opacity 0.3s ease'
  setTimeout(() => {
    loadingBar?.remove()
    loadingBar = null
  }, 350)
}
