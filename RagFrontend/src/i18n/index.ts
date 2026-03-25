// src/i18n/index.ts
// 简易 i18n 实现 - 中英文切换

import { ref, computed } from 'vue'

export type Locale = 'zh' | 'en'

const _locale = ref<Locale>((localStorage.getItem('locale') as Locale) || 'zh')

export const locale = _locale

export function setLocale(lang: Locale) {
  _locale.value = lang
  localStorage.setItem('locale', lang)
  document.documentElement.lang = lang
}

export function toggleLocale() {
  setLocale(_locale.value === 'zh' ? 'en' : 'zh')
}

// ── 翻译字典 ──────────────────────────────────────────────────
const messages: Record<Locale, Record<string, string>> = {
  zh: {
    // 通用
    'app.name': 'RAGF-01',
    'common.confirm': '确认',
    'common.cancel': '取消',
    'common.delete': '删除',
    'common.edit': '编辑',
    'common.save': '保存',
    'common.search': '搜索',
    'common.loading': '加载中...',
    'common.noData': '暂无数据',
    'common.create': '创建',
    'common.close': '关闭',
    'common.back': '返回',
    'common.refresh': '刷新',
    'common.upload': '上传',
    'common.download': '下载',
    'common.copy': '复制',
    'common.success': '成功',
    'common.error': '错误',
    'common.warning': '警告',
    // 侧边栏
    'sidebar.knowledge': '知识库',
    'sidebar.chat': 'AI 对话',
    'sidebar.search': '学术检索',
    'sidebar.agent': '任务模式',
    'sidebar.history': '历史记录',
    'sidebar.files': '文件管理',
    'sidebar.models': '模型管理',
    'sidebar.profile': '个人主页',
    'sidebar.quickCreate': '快速新建',
    'sidebar.searchHint': '搜索',
    'sidebar.github': 'GitHub',
    'sidebar.logout': '退出登录',
    'sidebar.userCenter': '个人中心',
    // 知识库
    'knowledge.title': '知识库',
    'knowledge.subtitle': '管理和检索你的所有知识内容',
    'knowledge.create': '新建知识库',
    'knowledge.createPlaceholder': '输入知识库名称...',
    'knowledge.starred': '星标知识库',
    'knowledge.recent': '最近访问',
    'knowledge.all': '全部知识库',
    'knowledge.searchPlaceholder': '搜索知识库...',
    'knowledge.noResults': '没有找到相关知识库',
    'knowledge.empty': '暂无知识库',
    'knowledge.emptyHint': '点击「新建知识库」开始',
    // 聊天
    'chat.history': '对话历史',
    'chat.newChat': '新对话',
    'chat.ragMode': '知识库问答',
    'chat.selectKb': '选择知识库',
    'chat.ragEnabled': '已启用知识库增强',
    'chat.ollamaSettings': 'Ollama 服务设置',
    'chat.serverUrl': '服务器地址',
    'chat.timeout': '连接超时（秒）',
    'chat.inputPlaceholder': '输入消息...',
    // Agent
    'agent.title': '任务模式',
    'agent.subtitle': '输入自然语言任务，AI 自动拆解步骤并执行',
    'agent.historyBtn': '历史任务',
    'agent.inputPlaceholder': '描述你的任务...',
    'agent.useKb': '使用知识库',
    'agent.webSearch': '联网搜索',
    'agent.start': '开始执行',
    'agent.stop': '停止',
    'agent.newTask': '新任务',
    'agent.examples': '示例任务',
    'agent.running': '执行中...',
    'agent.completed': '已完成',
    'agent.failed': '执行失败',
    // 历史
    'history.title': '历史记录',
    'history.all': '全部',
    'history.chat': '对话',
    'history.task': '任务',
    'history.note': '笔记',
    'history.search': '搜索',
    'history.today': '今天',
    'history.yesterday': '昨天',
    'history.older': '更早',
    'history.empty': '暂无历史记录',
    'history.searchPlaceholder': '搜索历史...',
    // 模型
    'model.title': '模型选择',
    'model.local': '本地模型',
    'model.cloud': '云端模型',
    'model.notConfigured': '未配置',
    'model.configureKey': '配置 API Key',
    'model.select': '选择模型',
    // 错误
    'error.network': '网络连接失败，请检查网络',
    'error.server': '服务器错误，请稍后重试',
    'error.unauthorized': '登录已过期，请重新登录',
    'error.notFound': '资源不存在',
    'error.uploadFailed': '文件上传失败',
    'error.retry': '重试',
    'error.ollamaDown': 'Ollama 服务未启动，请先运行 ollama serve',
  },
  en: {
    // General
    'app.name': 'RAGF-01',
    'common.confirm': 'Confirm',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.save': 'Save',
    'common.search': 'Search',
    'common.loading': 'Loading...',
    'common.noData': 'No data',
    'common.create': 'Create',
    'common.close': 'Close',
    'common.back': 'Back',
    'common.refresh': 'Refresh',
    'common.upload': 'Upload',
    'common.download': 'Download',
    'common.copy': 'Copy',
    'common.success': 'Success',
    'common.error': 'Error',
    'common.warning': 'Warning',
    // Sidebar
    'sidebar.knowledge': 'Knowledge Base',
    'sidebar.chat': 'AI Chat',
    'sidebar.search': 'Academic Search',
    'sidebar.agent': 'Task Mode',
    'sidebar.history': 'History',
    'sidebar.files': 'File Manager',
    'sidebar.models': 'Model Manager',
    'sidebar.profile': 'Profile',
    'sidebar.quickCreate': 'Quick Create',
    'sidebar.searchHint': 'Search',
    'sidebar.github': 'GitHub',
    'sidebar.logout': 'Logout',
    'sidebar.userCenter': 'User Center',
    // Knowledge Base
    'knowledge.title': 'Knowledge Base',
    'knowledge.subtitle': 'Manage and search all your knowledge',
    'knowledge.create': 'New Knowledge Base',
    'knowledge.createPlaceholder': 'Enter knowledge base name...',
    'knowledge.starred': 'Starred',
    'knowledge.recent': 'Recent',
    'knowledge.all': 'All',
    'knowledge.searchPlaceholder': 'Search knowledge base...',
    'knowledge.noResults': 'No knowledge base found',
    'knowledge.empty': 'No knowledge base yet',
    'knowledge.emptyHint': 'Click "New Knowledge Base" to start',
    // Chat
    'chat.history': 'Chat History',
    'chat.newChat': 'New Chat',
    'chat.ragMode': 'Knowledge Q&A',
    'chat.selectKb': 'Select Knowledge Base',
    'chat.ragEnabled': 'Knowledge Enhancement Enabled',
    'chat.ollamaSettings': 'Ollama Settings',
    'chat.serverUrl': 'Server URL',
    'chat.timeout': 'Timeout (seconds)',
    'chat.inputPlaceholder': 'Type a message...',
    // Agent
    'agent.title': 'Task Mode',
    'agent.subtitle': 'Describe a task, AI will auto-plan and execute',
    'agent.historyBtn': 'Task History',
    'agent.inputPlaceholder': 'Describe your task...',
    'agent.useKb': 'Use Knowledge Base',
    'agent.webSearch': 'Web Search',
    'agent.start': 'Execute',
    'agent.stop': 'Stop',
    'agent.newTask': 'New Task',
    'agent.examples': 'Example Tasks',
    'agent.running': 'Running...',
    'agent.completed': 'Completed',
    'agent.failed': 'Failed',
    // History
    'history.title': 'History',
    'history.all': 'All',
    'history.chat': 'Chat',
    'history.task': 'Task',
    'history.note': 'Note',
    'history.search': 'Search',
    'history.today': 'Today',
    'history.yesterday': 'Yesterday',
    'history.older': 'Earlier',
    'history.empty': 'No history yet',
    'history.searchPlaceholder': 'Search history...',
    // Model
    'model.title': 'Select Model',
    'model.local': 'Local Models',
    'model.cloud': 'Cloud Models',
    'model.notConfigured': 'Not Configured',
    'model.configureKey': 'Configure API Key',
    'model.select': 'Select Model',
    // Errors
    'error.network': 'Network error, please check your connection',
    'error.server': 'Server error, please try again later',
    'error.unauthorized': 'Session expired, please login again',
    'error.notFound': 'Resource not found',
    'error.uploadFailed': 'File upload failed',
    'error.retry': 'Retry',
    'error.ollamaDown': 'Ollama service not running, please run: ollama serve',
  },
}

// ── 核心 t() 函数 ─────────────────────────────────────────────
export function t(key: string, params?: Record<string, string>): string {
  const dict = messages[_locale.value] || messages['zh']
  let text = dict[key] || messages['zh'][key] || key
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, v)
    })
  }
  return text
}

// ── Vue composable ─────────────────────────────────────────────
export function useI18n() {
  const currentLocale = computed(() => _locale.value)
  const isZh = computed(() => _locale.value === 'zh')
  const isEn = computed(() => _locale.value === 'en')
  return { t, locale: currentLocale, setLocale, toggleLocale, isZh, isEn }
}
