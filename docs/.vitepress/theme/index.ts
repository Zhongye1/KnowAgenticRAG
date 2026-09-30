import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import ArsHome from './components/ArsHome.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  // 在首页（layout: home）的最顶部注入完全自定义的官网首页，
  // 同时保留 VitePress 的顶部导航、搜索、暗黑切换与页脚。
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'home-hero-before': () => h(ArsHome)
    })
  }
}
