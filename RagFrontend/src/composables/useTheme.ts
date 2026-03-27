/**
 * useTheme — 统一主题管理器（单一数据源）
 *
 * 解决的历史问题：
 *   - App.vue 读 localStorage.theme + classList.add('dark')
 *   - Settings.vue 写 app_appearance + setAttribute('data-theme', id)
 *   - CSS变量 --color-primary vs --primary 命名不一致
 *   - auto 跟随系统未实现
 *
 * 规范（本文件确立）：
 *   - 唯一存储键：localStorage.app_appearance（JSON）
 *   - DOM 操作：document.documentElement.classList toggle 'dark'
 *   - CSS 主题色变量：同时写 --color-primary 和 --primary（兼容两端）
 *   - auto 模式：监听 prefers-color-scheme 媒体查询
 */

// ── 颜色映射表 ──────────────────────────────────────────────────
export const COLOR_MAP: Record<string, string> = {
  blue:   '#4f7ef8',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  cyan:   '#06b6d4',
  teal:   '#14b8a6',
  green:  '#22c55e',
  orange: '#f97316',
  rose:   '#f43f5e',
}

// ── 字体大小映射 ─────────────────────────────────────────────────
export const FONT_SIZE_MAP: Record<string, string> = {
  small:  '13px',
  medium: '14px',
  large:  '16px',
  sm:     '13px',
  md:     '14px',
  lg:     '16px',
}

// ── 默认外观配置 ─────────────────────────────────────────────────
export interface AppearanceConfig {
  theme: 'light' | 'dark' | 'auto'
  color: string
  fontSize: string
  layout: string
}

const DEFAULT_APPEARANCE: AppearanceConfig = {
  theme:    'light',
  color:    'blue',
  fontSize: 'medium',
  layout:   'normal',
}

// ── 系统媒体查询（跟随系统用）────────────────────────────────────
let _mediaQuery: MediaQueryList | null = null
let _mediaListener: ((e: MediaQueryListEvent) => void) | null = null

// ── 读取当前外观配置 ──────────────────────────────────────────────
export function loadAppearance(): AppearanceConfig {
  try {
    // 兼容旧的 localStorage.theme 键
    const raw = localStorage.getItem('app_appearance')
    if (raw) {
      return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) }
    }
    // 旧版迁移：读 theme + themeColor + fontSize 三个独立键
    const legacyTheme = localStorage.getItem('theme') as AppearanceConfig['theme'] | null
    const legacyColor = localStorage.getItem('themeColor') || 'blue'
    const legacyFont  = localStorage.getItem('fontSize') || 'medium'
    if (legacyTheme) {
      const config: AppearanceConfig = {
        theme:    legacyTheme,
        color:    legacyColor,
        fontSize: legacyFont,
        layout:   'normal',
      }
      // 迁移到新键
      saveAppearance(config)
      return config
    }
  } catch {}
  return { ...DEFAULT_APPEARANCE }
}

// ── 保存外观配置 ──────────────────────────────────────────────────
export function saveAppearance(config: AppearanceConfig) {
  localStorage.setItem('app_appearance', JSON.stringify(config))
  // 同步旧键（兼容其他地方可能读的旧键）
  localStorage.setItem('theme', config.theme === 'auto' ? 'auto' : config.theme)
  localStorage.setItem('themeColor', config.color)
  localStorage.setItem('fontSize', config.fontSize)
}

// ── 应用主题模式（dark/light/auto）──────────────────────────────
export function applyTheme(theme: 'light' | 'dark' | 'auto') {
  // 移除旧媒体查询监听
  if (_mediaQuery && _mediaListener) {
    _mediaQuery.removeEventListener('change', _mediaListener)
    _mediaQuery = null
    _mediaListener = null
  }

  if (theme === 'auto') {
    _mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (dark: boolean) => {
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
      document.documentElement.style.setProperty(
        '--app-bg', dark ? '#1e1e2e' : '#f9fafb'
      )
    }
    apply(_mediaQuery.matches)
    _mediaListener = (e) => apply(e.matches)
    _mediaQuery.addEventListener('change', _mediaListener)
  } else {
    const isDark = theme === 'dark'
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.setProperty(
      '--app-bg', isDark ? '#1e1e2e' : '#f9fafb'
    )
    // 更新背景色（直接作用于 html/body）
    document.documentElement.style.backgroundColor = isDark ? '#1e1e2e' : ''
    document.body.style.backgroundColor = isDark ? '#1e1e2e' : ''
    if (isDark) {
      document.documentElement.style.colorScheme = 'dark'
    } else {
      document.documentElement.style.colorScheme = 'light'
    }
  }
}

// ── 应用主题色 ────────────────────────────────────────────────────
export function applyColor(colorId: string) {
  const value = COLOR_MAP[colorId] || COLOR_MAP.blue
  // 同时写两个变量名，兼容整个项目的 CSS
  document.documentElement.style.setProperty('--color-primary', value)
  document.documentElement.style.setProperty('--primary', value)
  // 派生色
  document.documentElement.style.setProperty('--color-primary-dark', adjustColor(value, -20))
  document.documentElement.style.setProperty('--color-primary-light', hexToRgba(value, 0.12))
  document.documentElement.style.setProperty('--ripple-color', hexToRgba(value, 0.25))
  document.documentElement.style.setProperty('--shadow-hover-btn', `0 6px 18px ${hexToRgba(value, 0.32)}`)
}

// ── 应用字体大小 ──────────────────────────────────────────────────
export function applyFontSize(fontSize: string) {
  const px = FONT_SIZE_MAP[fontSize] || '14px'
  document.documentElement.style.fontSize = px
  document.documentElement.style.setProperty('--td-font-size-base', px)
  document.body.setAttribute('data-font-size', fontSize)
}

// ── 应用布局密度 ──────────────────────────────────────────────────
export function applyLayout(layout: string) {
  document.documentElement.setAttribute('data-layout', layout)
  const densityMap: Record<string, string> = {
    compact:  '12px',
    normal:   '16px',
    spacious: '20px',
  }
  document.documentElement.style.setProperty(
    '--spacing-base', densityMap[layout] || '16px'
  )
}

// ── 一次性应用全部外观 ────────────────────────────────────────────
export function applyAllAppearance(config?: AppearanceConfig) {
  const c = config || loadAppearance()
  applyTheme(c.theme)
  applyColor(c.color)
  applyFontSize(c.fontSize)
  applyLayout(c.layout)
}

// ── 工具函数 ──────────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function adjustColor(hex: string, amount: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  const r = clamp(parseInt(hex.slice(1, 3), 16) + amount)
  const g = clamp(parseInt(hex.slice(3, 5), 16) + amount)
  const b = clamp(parseInt(hex.slice(5, 7), 16) + amount)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
