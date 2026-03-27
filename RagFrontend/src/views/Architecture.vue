<template>
  <div class="arch-page">
    <div class="arch-header">
      <h1>🏗️ 系统架构</h1>
      <p class="arch-subtitle">KnowledgeRAG-GZHU 微服务架构全景图</p>
      <div class="arch-tabs">
        <button v-for="tab in tabs" :key="tab.id"
          :class="['arch-tab', { 'arch-tab--active': activeTab === tab.id }]"
          @click="activeTab = tab.id">
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- 全局架构视图 -->
    <div v-if="activeTab === 'overview'" class="arch-content">
      <div class="arch-diagram">
        <!-- 用户层 -->
        <div class="arch-layer arch-layer--user">
          <div class="layer-title">🧑‍💻 客户端层</div>
          <div class="layer-nodes">
            <div class="arch-node arch-node--frontend">
              <div class="node-icon">🌐</div>
              <div class="node-name">Web 前端</div>
              <div class="node-tech">Vue 3 + TDesign</div>
            </div>
            <div class="arch-node arch-node--mobile">
              <div class="node-icon">📱</div>
              <div class="node-name">移动端</div>
              <div class="node-tech">React Native + Expo</div>
            </div>
          </div>
        </div>

        <!-- 网关层 -->
        <div class="arch-arrow">↕ HTTP / SSE / WebSocket</div>
        <div class="arch-layer arch-layer--gateway">
          <div class="layer-title">🔀 API 网关层</div>
          <div class="layer-nodes">
            <div class="arch-node arch-node--gateway">
              <div class="node-icon">⚡</div>
              <div class="node-name">FastAPI 主服务</div>
              <div class="node-tech">Port 8000 · CORS · JWT Auth</div>
            </div>
            <div class="arch-node arch-node--gateway">
              <div class="node-icon">📋</div>
              <div class="node-name">审计中间件</div>
              <div class="node-tech">AuditMiddleware · 操作日志</div>
            </div>
          </div>
        </div>

        <!-- 服务层 -->
        <div class="arch-arrow">↕</div>
        <div class="arch-layer arch-layer--service">
          <div class="layer-title">🧩 业务服务层</div>
          <div class="layer-nodes service-grid">
            <div class="arch-node arch-node--service">
              <div class="node-icon">📚</div>
              <div class="node-name">知识库管理</div>
              <div class="node-tech">CRUD · 版本管理 · 标签 · 权限(RBAC)</div>
            </div>
            <div class="arch-node arch-node--service">
              <div class="node-icon">🔍</div>
              <div class="node-name">RAG 服务</div>
              <div class="node-tech">向量检索 · 重排序 · 评估面板</div>
            </div>
            <div class="arch-node arch-node--service">
              <div class="node-icon">🤖</div>
              <div class="node-name">Agent 服务</div>
              <div class="node-tech">ReAct Agent · 联网搜索 · 工具链</div>
            </div>
            <div class="arch-node arch-node--service">
              <div class="node-icon">💬</div>
              <div class="node-name">对话管理</div>
              <div class="node-tech">会话历史 · 多轮对话 · 对话记忆</div>
            </div>
            <div class="arch-node arch-node--service">
              <div class="node-icon">📄</div>
              <div class="node-name">文档处理</div>
              <div class="node-tech">分块上传 · OCR · 向量化 · PDF解析</div>
            </div>
            <div class="arch-node arch-node--service">
              <div class="node-icon">🔗</div>
              <div class="node-name">办公联动</div>
              <div class="node-tech">飞书 · 钉钉 · 企微 · Obsidian · GitHub</div>
            </div>
            <div class="arch-node arch-node--service">
              <div class="node-icon">👤</div>
              <div class="node-name">用户管理</div>
              <div class="node-tech">注册/登录 · JWT · QQ OAuth · 密码重置</div>
            </div>
            <div class="arch-node arch-node--service">
              <div class="node-icon">✍️</div>
              <div class="node-name">文档创作</div>
              <div class="node-tech">大纲/摘要/翻译/润色/扩写 · SSE流式</div>
            </div>
          </div>
        </div>

        <!-- 模型层 -->
        <div class="arch-arrow">↕</div>
        <div class="arch-layer arch-layer--ai">
          <div class="layer-title">🧠 AI 模型层</div>
          <div class="layer-nodes">
            <div class="arch-node arch-node--ai">
              <div class="node-icon">🦙</div>
              <div class="node-name">Ollama 本地模型</div>
              <div class="node-tech">qwen2:0.5b · qwen:7b · Port 11434/11435</div>
            </div>
            <div class="arch-node arch-node--ai">
              <div class="node-icon">☁️</div>
              <div class="node-name">云端模型（可配置）</div>
              <div class="node-tech">阿里百炼 / DeepSeek / OpenAI 兼容接口</div>
            </div>
            <div class="arch-node arch-node--ai">
              <div class="node-icon">🔢</div>
              <div class="node-name">Embedding 模型</div>
              <div class="node-tech">sentence-transformers/all-MiniLM-L6-v2</div>
            </div>
          </div>
        </div>

        <!-- 存储层 -->
        <div class="arch-arrow">↕</div>
        <div class="arch-layer arch-layer--storage">
          <div class="layer-title">🗄️ 存储层</div>
          <div class="layer-nodes">
            <div class="arch-node arch-node--storage">
              <div class="node-icon">🐬</div>
              <div class="node-name">MySQL</div>
              <div class="node-tech">用户数据 · 会话记录</div>
            </div>
            <div class="arch-node arch-node--storage">
              <div class="node-icon">🗃️</div>
              <div class="node-name">SQLite</div>
              <div class="node-tech">审计日志 · API Key · 数据源配置</div>
            </div>
            <div class="arch-node arch-node--storage">
              <div class="node-icon">🔵</div>
              <div class="node-name">FAISS 向量库</div>
              <div class="node-tech">本地持久化向量索引</div>
            </div>
            <div class="arch-node arch-node--storage">
              <div class="node-icon">📁</div>
              <div class="node-name">本地文件系统</div>
              <div class="node-tech">local-KLB-files/ · 分块上传缓存</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 数据流视图 -->
    <div v-if="activeTab === 'dataflow'" class="arch-content">
      <div class="flow-diagram">
        <h3 class="flow-title">📥 RAG 问答数据流</h3>
        <div class="flow-steps">
          <div v-for="(step, i) in ragFlow" :key="i" class="flow-step">
            <div class="flow-step-num">{{ i + 1 }}</div>
            <div class="flow-step-content">
              <div class="flow-step-name">{{ step.name }}</div>
              <div class="flow-step-desc">{{ step.desc }}</div>
            </div>
            <div v-if="i < ragFlow.length - 1" class="flow-arrow">→</div>
          </div>
        </div>

        <h3 class="flow-title mt-8">📤 文件上传向量化流程</h3>
        <div class="flow-steps">
          <div v-for="(step, i) in uploadFlow" :key="i" class="flow-step">
            <div class="flow-step-num">{{ i + 1 }}</div>
            <div class="flow-step-content">
              <div class="flow-step-name">{{ step.name }}</div>
              <div class="flow-step-desc">{{ step.desc }}</div>
            </div>
            <div v-if="i < uploadFlow.length - 1" class="flow-arrow">→</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 技术栈详情 -->
    <div v-if="activeTab === 'stack'" class="arch-content">
      <div class="stack-grid">
        <div v-for="cat in techStack" :key="cat.category" class="stack-card">
          <div class="stack-category">{{ cat.emoji }} {{ cat.category }}</div>
          <div class="stack-items">
            <div v-for="item in cat.items" :key="item.name" class="stack-item">
              <span class="stack-item__name">{{ item.name }}</span>
              <span class="stack-item__desc">{{ item.desc }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 部署架构 -->
    <div v-if="activeTab === 'deploy'" class="arch-content">
      <div class="deploy-grid">
        <div class="deploy-card">
          <h3>🖥️ 本地开发部署</h3>
          <div class="code-block">
            <pre># 方法一：一键启动脚本
.\dev.ps1

# 方法二：手动启动
# 1. 启动 MySQL（服务名: MySQL96）
# 2. 启动后端
cd RagBackend
uvicorn main:app --port 8000

# 3. 启动前端
cd RagFrontend
npm run dev  # → http://localhost:5173

# 4. 启动 Ollama（另开终端）
ollama serve
ollama run qwen2:0.5b</pre>
          </div>
        </div>
        <div class="deploy-card">
          <h3>🐳 Docker 容器化部署</h3>
          <div class="code-block">
            <pre># 完整部署（含 MySQL + Ollama）
docker compose up -d

# 轻量部署（使用云端 API，无 MySQL/Ollama）
docker compose -f docker-compose.lite.yml up -d

# 访问地址
# 前端: http://localhost:8089
# 后端: http://localhost:8000/docs
# Ollama: http://localhost:11435</pre>
          </div>
        </div>
        <div class="deploy-card">
          <h3>📦 服务端口一览</h3>
          <table class="port-table">
            <thead><tr><th>服务</th><th>端口</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td>FastAPI 后端</td><td>8000</td><td>REST API + SSE</td></tr>
              <tr><td>Vue 前端（开发）</td><td>5173</td><td>Vite Dev Server</td></tr>
              <tr><td>Vue 前端（生产）</td><td>8089</td><td>Docker Nginx</td></tr>
              <tr><td>Ollama（本地）</td><td>11434</td><td>LLM 推理</td></tr>
              <tr><td>Ollama（Docker）</td><td>11435</td><td>Docker 映射</td></tr>
              <tr><td>MySQL</td><td>3306</td><td>用户数据</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const activeTab = ref('overview')
const tabs = [
  { id: 'overview', label: '🗺️ 全局架构' },
  { id: 'dataflow', label: '🔄 数据流' },
  { id: 'stack', label: '📦 技术栈' },
  { id: 'deploy', label: '🚀 部署方案' },
]

const ragFlow = [
  { name: '用户提问', desc: '前端输入框 → POST /api/RAG/native_query' },
  { name: '检索向量库', desc: 'FAISS 相似度搜索 Top-K 文档片段' },
  { name: 'Cross-Encoder 重排', desc: '对候选片段二次排序，提升相关性' },
  { name: 'Prompt 构建', desc: '将检索结果注入 Prompt 模板（ChatML/Lite）' },
  { name: 'Ollama 推理', desc: 'qwen2:0.5b 生成回答（支持流式/SSE）' },
  { name: '返回结果', desc: 'SSE 流式推送 → 前端逐字显示' },
]

const uploadFlow = [
  { name: '文件选择', desc: '前端支持拖拽/点击，多文件批量' },
  { name: '分块上传', desc: '100KB/chunk → POST /api/upload-chunk/' },
  { name: '合并文件', desc: '所有块传完 → POST /api/upload-complete/' },
  { name: '文档解析', desc: 'PDF/DOCX/TXT → LangChain DocumentLoader' },
  { name: '文本分块', desc: 'RecursiveCharacterTextSplitter（1000/200）' },
  { name: '生成向量', desc: 'Sentence-Transformers Embedding' },
  { name: '存入 FAISS', desc: '增量索引更新（SHA256 哈希去重）' },
]

const techStack = [
  {
    emoji: '🌐', category: '前端',
    items: [
      { name: 'Vue 3 + TypeScript', desc: 'Composition API，响应式' },
      { name: 'Vite 5', desc: '极速构建工具' },
      { name: 'TDesign Vue Next', desc: '腾讯企业级 UI 组件库' },
      { name: 'Tailwind CSS', desc: '原子化 CSS（darkMode: class）' },
      { name: 'Pinia', desc: '状态管理' },
      { name: 'Vue Router v4', desc: '前端路由' },
      { name: 'Axios', desc: 'HTTP 请求' },
      { name: 'marked + DOMPurify', desc: 'Markdown 安全渲染' },
    ]
  },
  {
    emoji: '⚙️', category: '后端',
    items: [
      { name: 'FastAPI', desc: '高性能异步 Python Web 框架' },
      { name: 'Python 3.10+', desc: '类型提示，异步支持' },
      { name: 'Pydantic v2', desc: '数据校验与序列化' },
      { name: 'LangChain', desc: 'RAG 框架，文档处理，Agent' },
      { name: 'FAISS', desc: '向量相似度搜索' },
      { name: 'Sentence-Transformers', desc: 'Embedding 模型' },
      { name: 'PyPDF / pdfplumber', desc: 'PDF 解析（含容错降级）' },
      { name: 'aiofiles', desc: '异步文件 I/O' },
    ]
  },
  {
    emoji: '🧠', category: 'AI 模型',
    items: [
      { name: 'Ollama', desc: '本地 LLM 推理运行时' },
      { name: 'qwen2:0.5b', desc: '轻量模型（默认，~400MB）' },
      { name: 'qwen:7b-chat', desc: '高质量模型（需 17GB+ RAM）' },
      { name: '阿里百炼 API', desc: '云端大模型（可配置）' },
      { name: 'DeepSeek API', desc: '高性价比云端模型' },
      { name: 'cross-encoder', desc: 'RAG 重排序模型' },
    ]
  },
  {
    emoji: '🗄️', category: '数据存储',
    items: [
      { name: 'MySQL 9.6', desc: '用户账户，会话，知识库元数据' },
      { name: 'SQLite', desc: '审计日志，API Key，数据源（轻量）' },
      { name: 'FAISS Index', desc: '本地持久化向量索引文件' },
      { name: 'JSON 元数据', desc: '文档信息，向量哈希索引' },
    ]
  },
  {
    emoji: '🐳', category: '运维部署',
    items: [
      { name: 'Docker + Docker Compose', desc: '容器化一键部署' },
      { name: 'Nginx', desc: '前端静态文件服务（Docker 模式）' },
      { name: 'GitHub Actions', desc: 'CI/CD 自动化（可配置）' },
      { name: 'Vite Proxy', desc: '开发环境 API 代理（/api → :8000）' },
    ]
  },
]
</script>

<style scoped>
.arch-page {
  min-height: 100vh;
  background: var(--bg-page, #f8fafc);
  padding: 0;
}

.arch-header {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 24px 32px 0;
}
.dark .arch-header { background: var(--bg-card); border-bottom-color: var(--border-color); }

.arch-header h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; color: var(--text-primary, #111); }
.arch-subtitle { font-size: 13px; color: #6b7280; margin: 0 0 16px; }

.arch-tabs { display: flex; gap: 4px; }
.arch-tab {
  padding: 8px 16px;
  font-size: 13px;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.arch-tab:hover { color: #374151; }
.arch-tab--active { color: #4f7ef8; border-bottom-color: #4f7ef8; font-weight: 600; }

.arch-content {
  padding: 24px 32px;
  max-width: 1200px;
  margin: 0 auto;
}

/* 架构图 */
.arch-diagram { display: flex; flex-direction: column; gap: 0; }
.arch-layer {
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  margin: 4px 0;
}
.dark .arch-layer { border-color: var(--border-color); }
.arch-layer--user { background: linear-gradient(135deg, #eff6ff, #f0fdf4); }
.arch-layer--gateway { background: linear-gradient(135deg, #fff7ed, #fef3c7); }
.arch-layer--service { background: linear-gradient(135deg, #f0fdf4, #f0f9ff); }
.arch-layer--ai { background: linear-gradient(135deg, #faf5ff, #f0f9ff); }
.arch-layer--storage { background: linear-gradient(135deg, #fef2f2, #f8fafc); }
.dark .arch-layer--user,
.dark .arch-layer--gateway,
.dark .arch-layer--service,
.dark .arch-layer--ai,
.dark .arch-layer--storage { background: var(--bg-card); }

.layer-title { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 10px; }
.dark .layer-title { color: var(--text-primary); }
.layer-nodes { display: flex; flex-wrap: wrap; gap: 8px; }
.service-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }

.arch-node {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.07);
  min-width: 160px;
  flex: 1;
}
.arch-node--frontend { background: #dbeafe; }
.arch-node--mobile { background: #dcfce7; }
.arch-node--gateway { background: #fef3c7; }
.arch-node--service { background: white; }
.arch-node--ai { background: #f3e8ff; }
.arch-node--storage { background: #fef2f2; }
.dark .arch-node { background: var(--bg-hover) !important; border-color: var(--border-color); }

.node-icon { font-size: 20px; margin-bottom: 4px; }
.node-name { font-size: 13px; font-weight: 600; color: #1f2937; }
.dark .node-name { color: var(--text-primary); }
.node-tech { font-size: 11px; color: #6b7280; margin-top: 2px; }

.arch-arrow { text-align: center; font-size: 12px; color: #9ca3af; padding: 4px 0; }

/* 数据流 */
.flow-title { font-size: 15px; font-weight: 700; color: #374151; margin: 0 0 12px; }
.dark .flow-title { color: var(--text-primary); }
.flow-steps { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.flow-step {
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 14px;
}
.dark .flow-step { background: var(--bg-card); border-color: var(--border-color); }
.flow-step-num {
  width: 24px; height: 24px;
  background: #4f7ef8;
  color: white;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
}
.flow-step-name { font-size: 13px; font-weight: 600; color: #1f2937; }
.dark .flow-step-name { color: var(--text-primary); }
.flow-step-desc { font-size: 11px; color: #6b7280; }
.flow-arrow { font-size: 18px; color: #9ca3af; }
.mt-8 { margin-top: 32px; }

/* 技术栈 */
.stack-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.stack-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
.dark .stack-card { background: var(--bg-card); border-color: var(--border-color); }
.stack-category { font-size: 14px; font-weight: 700; color: #1f2937; margin-bottom: 12px; }
.dark .stack-category { color: var(--text-primary); }
.stack-item { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f3f4f6; }
.dark .stack-item { border-bottom-color: var(--border-light); }
.stack-item:last-child { border-bottom: none; }
.stack-item__name { font-size: 13px; font-weight: 500; color: #374151; }
.dark .stack-item__name { color: var(--text-secondary); }
.stack-item__desc { font-size: 12px; color: #6b7280; text-align: right; max-width: 55%; }

/* 部署 */
.deploy-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
.deploy-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; }
.dark .deploy-card { background: var(--bg-card); border-color: var(--border-color); }
.deploy-card h3 { font-size: 15px; font-weight: 700; color: #1f2937; margin: 0 0 12px; }
.dark .deploy-card h3 { color: var(--text-primary); }
.code-block {
  background: #0d1117;
  border-radius: 8px;
  padding: 14px;
}
.code-block pre { color: #b5d0fb; font-size: 12px; margin: 0; white-space: pre-wrap; font-family: 'Consolas', monospace; }
.port-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.port-table th { text-align: left; padding: 6px 10px; background: #f8fafc; color: #374151; font-weight: 600; }
.dark .port-table th { background: var(--bg-hover); color: var(--text-secondary); }
.port-table td { padding: 6px 10px; border-top: 1px solid #f3f4f6; color: #374151; }
.dark .port-table td { border-top-color: var(--border-light); color: var(--text-secondary); }
.port-table tr:hover td { background: #f9fafb; }
.dark .port-table tr:hover td { background: var(--bg-hover); }
</style>
