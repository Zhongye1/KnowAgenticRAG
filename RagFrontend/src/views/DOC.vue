<template>
  <div :class="{ 'animate-fade-in': !isAnimationDisabled }">
    <div class="doc-container max-w-7xl mx-auto px-6 py-8">
      <div class="bg-white shadow-sm rounded-lg p-12 max-h-[85vh] overflow-auto">
        <!-- 标题区域 -->
        <h1 class="text-3xl font-bold text-gray-800 mb-6">RAGF-01 项目文档</h1>

        <!-- Markdown 渲染区域 -->
        <div class="markdown-body" v-html="renderedContent"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

const isAnimationDisabled = ref(false) // 设置为 true 来禁用动画
// 配置 marked
marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
  breaks: true
})

const documentContent = ref('')
const renderedContent = ref('')

onMounted(async () => {
  try {
    // 加载 Markdown 文件内容
    const response = await fetch('src/assets/README.md')
    documentContent.value = await response.text()

    // 渲染 Markdown 并净化 HTML
    renderedContent.value = DOMPurify.sanitize(marked(documentContent.value))
  } catch (error) {
    console.error('加载文档失败:', error)
    documentContent.value = '# 文档加载失败\n请稍后重试或联系管理员。'
    renderedContent.value = DOMPurify.sanitize(marked(documentContent.value))
  }
})
</script>

<style>
.doc-container {
  min-height: calc(100vh - 80px);
}

/* Markdown 样式 */
.markdown-body {
  color: #24292e;
  line-height: 1.6;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.markdown-body h1 {
  font-size: 2em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #eaecef;
}

.markdown-body h2 {
  font-size: 1.5em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #eaecef;
}

.markdown-body a {
  color: #0366d6;
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body code {
  padding: 0.2em 0.4em;
  background-color: rgba(27, 31, 35, 0.05);
  border-radius: 3px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.markdown-body pre {
  margin-top: 0;
  margin-bottom: 16px;
  padding: 16px;
  overflow: auto;
  background-color: #f6f8fa;
  border-radius: 3px;
}

.markdown-body pre code {
  padding: 0;
  background-color: transparent;
}

.markdown-body blockquote {
  padding: 0 1em;
  color: #6a737d;
  border-left: 0.25em solid #dfe2e5;
}

.markdown-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 16px 0;
}

.markdown-body table th,
.markdown-body table td {
  padding: 6px 13px;
  border: 1px solid #dfe2e5;
}

.markdown-body table tr {
  background-color: #fff;
  border-top: 1px solid #c6cbd1;
}

.markdown-body table tr:nth-child(2n) {
  background-color: #f6f8fa;
}

/* 列表样式改进 */
.markdown-body ul,
.markdown-body ol {
  padding-left: 2em;
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-body ul ul,
.markdown-body ul ol,
.markdown-body ol ol,
.markdown-body ol ul {
  margin-top: 0;
  margin-bottom: 0;
}

.markdown-body li {
  margin-bottom: 0.25em;
}

.markdown-body li + li {
  margin-top: 0.25em;
}

/* 任务列表 */
.markdown-body ul.task-list {
  list-style-type: none;
  padding-left: 0;
}

.markdown-body .task-list-item {
  padding-left: 1.5em;
  position: relative;
}

.markdown-body .task-list-item input {
  position: absolute;
  left: 0;
  top: 0.3em;
}

.doc-container {
  min-height: calc(100vh - 80px);
  height: max-content;
}

::-webkit-scrollbar {
  display: none;
  /* Chrome Safari */
}
</style>
