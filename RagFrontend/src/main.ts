import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import TDesign from 'tdesign-vue-next'
import './assets/tailwind.css'
import pinia from './store' // 导入 Pinia 实例
import TDesignChat from '@tdesign-vue-next/chat' // 引入chat组件
import 'tdesign-vue-next/es/style/index.css' // 引入少量全局样式变量

const app = createApp(App)

// 启用Devtools (在开发和生产环境中)
//app.config.devtools = true
app.config.performance = true

app.use(TDesignChat)
app.use(TDesign)
app.use(router)
app.use(pinia) // 使用 Pinia 实例
app.mount('#app')
