# RAG-F 智能知识管理平台 · 功能全览

> **项目仓库**：https://github.com/March030303/KnowledgeRAG-GZHU  
> **主分支**：`暖霜的分支`  
> **最新版本**：commit `59ffcfe`（2026-03-27）

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术架构](#2-技术架构)
3. [快速启动](#3-快速启动)
4. [核心功能模块](#4-核心功能模块)
   - 4.1 [用户认证系统](#41-用户认证系统)
   - 4.2 [知识库管理](#42-知识库管理)
   - 4.3 [RAG 智能问答](#43-rag-智能问答)
   - 4.4 [Agent 任务模式](#44-agent-任务模式)
   - 4.5 [多模型适配](#45-多模型适配)
   - 4.6 [检索策略配置](#46-检索策略配置)
   - 4.7 [语音交互](#47-语音交互)
   - 4.8 [联网搜索](#48-联网搜索)
   - 4.9 [文档创作](#49-文档创作新)
   - 4.10 [RAG 评测](#410-rag-评测新)
5. [扩展功能模块](#5-扩展功能模块)
   - 5.1 [个人主页与设置](#51-个人主页与设置)
   - 5.2 [外观与主题](#52-外观与主题)
   - 5.3 [第三方账号绑定](#53-第三方账号绑定)
   - 5.4 [反馈与建议](#54-反馈与建议)
   - 5.5 [历史记录](#55-历史记录)
   - 5.6 [全局搜索](#56-全局搜索)
   - 5.7 [置顶功能](#57-置顶功能)
   - 5.8 [全局交互动效](#58-全局交互动效)
   - 5.9 [系统设置（Win11 风格）](#59-系统设置win11-风格)
   - 5.10 [系统架构图](#510-系统架构图新)
6. [集成与联动](#6-集成与联动)
   - 6.1 [Obsidian 笔记同步](#61-obsidian-笔记同步)
   - 6.2 [飞书机器人](#62-飞书机器人)
   - 6.3 [钉钉 / 企微 / Notion / GitHub](#63-钉钉--企微--notion--github)
   - 6.4 [多数据源接入](#64-多数据源接入)
7. [系统管理](#7-系统管理)
   - 7.1 [开放 API](#71-开放-api)
   - 7.2 [审计日志](#72-审计日志)
   - 7.3 [增量向量化](#73-增量向量化)
   - 7.4 [RBAC 权限管理](#74-rbac-权限管理)
   - 7.5 [OCR 文档解析](#75-ocr-文档解析)
   - 7.6 [系统监控](#76-系统监控新)
8. [移动端 App](#8-移动端-app)
9. [部署方案](#9-部署方案)
10. [目录结构](#10-目录结构)
11. [环境变量说明](#11-环境变量说明)

---

## 1. 项目概述

**RAG-F** 是一套面向个人与团队的智能知识管理平台，核心能力是将私有文档与大语言模型深度结合，实现**检索增强生成（RAG）**问答。平台支持多种文档格式、多种 LLM 后端，提供 Web 端与移动端双入口，并通过丰富的集成扩展（Obsidian、飞书、对象存储、多数据库）打通知识流转的全链路。

**核心价值：**
- 🧠 让 AI 真正"懂"你的私有文档
- 📚 统一管理分散在各处的知识资产
- 🔗 与现有工作流无缝集成
- 🚀 本地部署，数据安全可控

---

## 2. 技术架构

```
┌──────────────────────────────────────────────────────┐
│                    客户端层                           │
│  Web 前端 (Vue3 + Vite + TDesign)                    │
│  移动端 App (React Native + Expo)                    │
└────────────────────┬─────────────────────────────────┘
                     │ HTTP / SSE
┌────────────────────▼─────────────────────────────────┐
│                   服务层                              │
│  FastAPI 后端 (Python 3.10+)                         │
│  ├── 用户认证 (JWT + MySQL)                          │
│  ├── 知识库管理 (文档解析 + 向量化)                  │
│  ├── RAG Pipeline (LangChain + Cross-Encoder 重排)   │
│  ├── Agent (ReAct + 工具链)                          │
│  ├── 多模型路由 (Ollama/OpenAI/DeepSeek/混元)        │
│  ├── 语音 ASR (Whisper)                              │
│  ├── 文档创作 (5 种模式 SSE)                         │
│  ├── RAG 评测 (多指标可视化)                          │
│  ├── Prometheus 监控中间件                            │
│  ├── 联网搜索 (DuckDuckGo)                           │
│  └── 集成服务 (Obsidian/飞书/钉钉/企微/Notion/GitHub)│
└────────────────────┬─────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────┐
│                   存储层                              │
│  MySQL (用户数据)  │  向量数据库  │  SQLite (审计日志) │
│  OSS/S3 (文件存储)│  本地文件系统                     │
└──────────────────────────────────────────────────────┘
```

| 层级 | 技术选型 |
|------|---------|
| 前端框架 | Vue 3 + TypeScript + Vite 5 |
| UI 组件库 | TDesign Vue Next |
| 状态管理 | Pinia（跨路由持久化） |
| 后端框架 | FastAPI + uvicorn |
| LLM 框架 | LangChain |
| 本地模型 | Ollama（qwen2:0.5b / qwen:7b-chat） |
| 重排模型 | Cross-Encoder（sentence-transformers） |
| 关系数据库 | MySQL 9.6 |
| 移动端 | React Native + Expo SDK 53 + zustand |
| 容器化 | Docker + Docker Compose |
| 语音识别 | OpenAI Whisper（本地） |
| 监控 | Prometheus 中间件 + ECharts |

---

## 3. 快速启动

### 方式一：Docker Compose（推荐）

```bash
# 克隆仓库
git clone https://github.com/March030303/KnowledgeRAG-GZHU.git
cd KnowledgeRAG-GZHU

# 配置环境变量
cp RagBackend/.env.example RagBackend/.env
# 编辑 .env 填写数据库密码、JWT密钥等

# 一键启动（前端+后端+MySQL+Ollama）
docker compose up -d

# 访问地址
# 前端：http://localhost:8089
# 后端 API 文档：http://localhost:8000/docs
# Ollama：http://localhost:11435
```

### 方式二：本地开发模式

```bash
# 1. 启动 MySQL
Start-Process "E:\PROGRAM\mysql-9.6.0-winx64\bin\mysqld.exe" -ArgumentList "--console" -WindowStyle Hidden

# 2. 启动后端
cd KnowledgeRAG-GZHU/RagBackend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 3. 启动前端
cd KnowledgeRAG-GZHU/RagFrontend
npm install
npm run dev  # → http://localhost:5173

# 4. 启动 Ollama（可选）
ollama pull qwen2:0.5b
ollama serve
```

---

## 4. 核心功能模块

### 4.1 用户认证系统

**功能描述：** 完整的账号生命周期管理，支持邮箱注册/登录。

| 功能 | 说明 |
|------|------|
| 邮箱注册 | 输入邮箱+密码创建账户，bcrypt 加密存储 |
| 邮箱登录 | JWT Token 鉴权，自动续期 |
| 忘记密码 | 验证码找回流程 |
| 个人资料 | 头像、昵称、邮箱修改 |
| 语言设置 | 中文/English 切换，localStorage 持久化 |

**数据库表：**
```sql
user (id, email, password, created_at, qq_openid)
user_profile (user_id, nickname, avatar, ...)
```

**API 端点：**
```
POST /api/user/register    -- 注册
POST /api/user/login       -- 登录
GET  /api/user/profile     -- 获取资料
PUT  /api/user/profile     -- 更新资料
```

---

### 4.2 知识库管理

**功能描述：** 以"知识库"为单位组织文档，支持多格式上传、URL 批量导入、全文检索。

#### 知识库列表页
- ⭐ **星标置顶**：重要知识库一键收藏，星标分区展示
- 📌 **置顶固定**：重要知识库/文件/模型可置顶，localStorage 持久化，页面顶部固定展示
- 🕐 **最近访问**：自动记录访问历史，快速找回
- 🔍 **搜索过滤**：实时搜索知识库名称
- ↕️ **拖拽排序**：原生 HTML5 拖拽，localStorage 持久化排序
- 🃏 **卡片视图**：彩色色条标识 + 悬浮操作菜单

#### 知识库详情页
- 📄 **文档管理**：列表展示所有文档，支持删除、重命名
- 📤 **文件上传**：支持 PDF、Word、TXT、Markdown、Excel、图片等格式
- 🔗 **URL 批量导入**：弹窗输入多个 URL，自动抓取并向量化
- 📝 **笔记模块**：在详情页直接记录笔记，关联到知识库
- ⚙️ **知识库设置**：名称、描述、权限配置

#### 权限体系（三级）
```
个人（Private） → 仅创建者可见
共享（Shared）  → 指定成员可访问，支持分享链接
广场（Public）  → 所有用户可见，支持搜索发现
```

- 🔒 **安全策略**：设置访问密码、有效期
- 🔗 **分享链接**：一键生成带权限的分享 URL

**API 端点：**
```
GET    /api/knowledge/list          -- 知识库列表
POST   /api/knowledge/create        -- 创建知识库
DELETE /api/knowledge/{id}          -- 删除知识库
POST   /api/knowledge/{id}/upload   -- 上传文档
POST   /api/knowledge/{id}/url      -- URL导入
GET    /api/knowledge/{id}/docs     -- 文档列表
```

---

### 4.3 RAG 智能问答

**功能描述：** 基于 LangChain 的 RAG Pipeline，将用户问题与知识库文档结合，生成有据可查的回答。

#### 对话界面
- 💬 **流式输出**：SSE（Server-Sent Events）实时打字机效果
- 📚 **RAG 模式开关**：可切换纯 LLM 对话 vs 知识库增强对话
- 🗂️ **知识库选择器**：侧边栏面板，勾选参与问答的知识库
- 🔍 **引用溯源气泡**：AI 回答标注来源，点击展开原文段落
- 📋 **多轮对话**：保持上下文，支持追问

#### RAG Pipeline（v3）
```
用户问题
  → 问题向量化（embedding）
  → 检索策略执行（见4.6）
  → 召回相关段落（Top-K）
  → Cross-Encoder 重排（二次精排，提升相关性）
  → Prompt 构建（问题 + 上下文）
  → LLM 生成回答（流式）
  → 引用来源标注
```

**API 端点：**
```
POST /api/chat/send         -- 发送消息（SSE流式）
GET  /api/chat/history      -- 对话历史
DELETE /api/chat/{id}       -- 删除对话
```

---

### 4.4 Agent 任务模式

**功能描述：** 基于 ReAct（Reasoning + Acting）框架的智能 Agent，能够分解复杂任务、调用工具链自主完成目标。

#### 任务输入
- 自然语言描述任务目标
- 支持指定知识库范围
- 可开启/关闭联网搜索

#### 执行可视化
```
任务输入
  → 🤔 Thought（推理步骤）
  → 🔧 Action（工具调用）
  → 👁️ Observation（执行结果）
  → 循环直到任务完成
  → ✅ Final Answer
```

- 步骤实时展示，每步骤可展开详情
- 执行状态：待执行 / 执行中 / 已完成 / 失败

#### 工具链
| 工具 | 说明 |
|------|------|
| 知识库检索 | 在指定知识库中语义搜索 |
| 联网搜索 | DuckDuckGo 实时搜索（零 API Key） |
| 文档读取 | 读取并分析指定文档内容 |
| 代码执行 | 运行 Python 代码片段 |

#### 任务历史
- localStorage 持久化存储
- 按日期分组展示
- 可重新加载历史任务上下文

**API 端点：**
```
POST /api/agent/run         -- 启动Agent任务（SSE流式）
GET  /api/agent/history     -- 任务历史
POST /api/agent/web-search  -- 联网搜索工具
```

---

### 4.5 多模型适配

**功能描述：** 统一的多模型路由层，支持本地和云端多种 LLM，按需切换。

#### 支持的模型
| 类型 | 模型 | 说明 |
|------|------|------|
| 本地 | Ollama (qwen2:0.5b) | ~400MB，仅需 600MB 内存，推荐低配 |
| 本地 | Ollama (qwen:7b-chat) | 4.2GB，需 17GB+ 内存 |
| 云端 | OpenAI GPT-4/3.5 | 需配置 API Key |
| 云端 | DeepSeek | 需配置 API Key |
| 云端 | 腾讯混元 | 需配置 API Key |

#### 模型切换 UI
- 顶部 ModelSelector 组件一键切换
- 云厂商 API Key 在设置页配置，加密存储
- 对话中可随时切换，不影响历史上下文

#### 用户自定义模型配置（新）
- 设置页「⚡ 模型配置」Tab
- 可自定义：Ollama 地址、模型名称、请求超时时长
- **离线也可保存**：优先存 localStorage，后端不可用时仍提示成功
- Chat 侧边栏绿色徽章显示当前使用模型，点击跳转设置页

```python
# RagBackend/models/user_model_config.py
GET  /api/model-config/user       -- 获取用户模型配置
POST /api/model-config/user       -- 保存用户模型配置
GET  /api/model-config/local      -- 查询本地已安装 Ollama 模型
POST /api/model-config/test       -- 测试模型连接
```

#### 技术实现
```python
# RagBackend/multi_model/model_router.py
# SSE 流式统一路由，自动适配不同厂商 API 格式
POST /api/model/chat    -- 统一对话接口
GET  /api/model/list    -- 可用模型列表
```

---

### 4.6 检索策略配置

**功能描述：** 提供 5 种检索策略，可在前端实时配置，满足不同场景的召回需求。

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| **Vector** | 纯向量语义相似度检索 | 语义理解要求高 |
| **BM25** | 关键词稀疏检索 | 精确词匹配场景 |
| **Hybrid** | 向量 + BM25 线性加权融合 | 通用场景推荐 |
| **RRF** | 倒数排名融合（Reciprocal Rank Fusion） | 多路召回重排 |
| **MMR** | 最大边际相关性（减少冗余） | 需要多样性的场景 |

#### 配置参数
```json
{
  "strategy": "hybrid",
  "top_k": 5,
  "vector_weight": 0.7,
  "bm25_weight": 0.3,
  "mmr_lambda": 0.5
}
```

前端 `RetrievalConfig.vue` 组件提供滑块、选择器等直观配置界面，参数透传至 RAG Pipeline。

---

### 4.7 语音交互

**功能描述：** 全链路语音输入支持，从录音到文字自动转录，可直接发起问答。

#### 录音流程
```
点击麦克风按钮
  → MediaRecorder 开始录音（WebM 格式）
  → 波形动画实时显示（8条动态柱）
  → 再次点击停止录音
  → POST /api/voice/transcribe（Whisper 后端）
  → 转录文字填入输入框
  → 一键发送问答
```

#### 降级策略
当后端 Whisper 服务不可用时，自动降级为浏览器原生 **Web Speech API**（需 Chrome/Edge）：
```javascript
const recognition = new webkitSpeechRecognition()
recognition.lang = 'zh-CN'
recognition.start()
```

#### 后端 ASR 服务
```python
# RagBackend/multimodal/whisper_asr.py
# 本地 Whisper 模型，支持 tiny/base/small/medium
POST /api/voice/transcribe   -- 音频转文字
GET  /api/voice/status       -- ASR 服务状态
```

**聊天页集成**：输入框右侧麦克风图标，录音状态有视觉反馈（红点 + 波形动画）。

---

### 4.8 联网搜索

**功能描述：** 集成 DuckDuckGo 联网搜索，无需 API Key，Agent 可调用实时获取最新信息。

- 零配置，开箱即用
- Agent 工具链调用：`web_search_tool.py`
- 返回结构化摘要（标题 + URL + 摘要）
- 前端 Chat 页可开启"联网增强"模式

```python
# RagBackend/agent_tools/web_search_tool.py
POST /api/agent/web-search   -- 联网搜索
参数：{"query": "搜索关键词", "max_results": 5}
```

---

### 4.9 文档创作（新）

**功能描述：** 基于知识库内容，以 SSE 流式方式生成结构化文档，覆盖 5 种常见写作场景。

#### 创作模式

| 模式 | 说明 | 输出特点 |
|------|------|---------|
| **研究报告** | 基于知识库内容生成系统性报告 | 摘要 + 正文 + 结论 |
| **文章摘要** | 对文档进行精炼压缩 | 关键信息提炼 |
| **内容大纲** | 生成多级标题大纲 | 层次分明的结构 |
| **博客文章** | 轻松易读的博客风格 | 标题 + 段落 + 小节 |
| **学术论文** | 严谨的学术写作风格 | 摘要/引言/方法/结论 |

#### 交互流程
```
选择创作模式 → 输入主题/要求 → 选择参考知识库
  → SSE 流式输出（实时打字机效果）
  → 支持复制/导出生成内容
```

```python
# RagBackend/doc_creation/doc_creation.py
POST /api/creation/generate   -- 文档创作（SSE 流式）
参数：{"mode": "report", "topic": "...", "kb_ids": [...]}
```

**前端入口：** SideBar「文档创作」→ `/creation`，`Creation.vue` 页面。

---

### 4.10 RAG 评测（新）

**功能描述：** 对 RAG 系统进行多维度定量评测，以可视化图表展示评测结果，并支持跨路由状态持久化。

#### 评测指标

| 指标 | 说明 |
|------|------|
| **准确率** | 回答与标准答案的语义相似度 |
| **召回率** | 检索到的相关段落覆盖率 |
| **F1 分数** | 准确率与召回率的调和平均 |
| **忠实度** | 回答与文档原文的一致性 |
| **延迟** | 端到端响应时间分布 |

#### 可视化图表

- 📡 **雷达图**：5 维指标全貌对比
- 📊 **柱状图**：多组测试集横向对比
- 📈 **直方图**：响应延迟分布分析

#### 状态持久化
- Pinia Store（`useEvalStore.ts`）管理评测状态
- **跨路由不丢进度**：离开评测页面再回来，进度、结果完整保留
- **全局进度浮层**：`App.vue` 底部 toast，任意页面均可感知评测进度

```typescript
// RagFrontend/src/store/modules/useEvalStore.ts
// Pinia store，持久化评测状态
const evalStore = useEvalStore()
evalStore.startEval(config)   // 启动评测
evalStore.updateProgress(n)   // 更新进度
evalStore.setResults(data)    // 保存结果
```

---

### 5.1 个人主页与设置

路径：`/user/userInfo`

| 设置项 | 说明 |
|--------|------|
| 基本信息 | 头像、昵称、邮箱展示与修改 |
| 语言切换 | 中文 / English，实时生效 |
| 账号安全 | 修改密码 |

---

### 5.2 外观与主题

路径：`/user/coming-soon/1`

完整的个性化外观系统，所有设置 **localStorage 持久化**：

| 功能 | 选项 |
|------|------|
| **深色模式** | 亮色 / 暗色 切换，CSS variables 全局应用 |
| **主题色** | 8 种预设色（蓝/紫/绿/红/橙/青/粉/灰） |
| **界面布局** | 默认布局 / 紧凑布局 / 宽松布局 |
| **字体大小** | 小 / 中 / 大，`font-size` 实时调整 |

主题色通过 CSS 变量 `--color-primary` 全局注入，所有组件自动响应。

---

### 5.3 第三方账号绑定

路径：`/user/coming-soon/2`

支持绑定 4 个平台账号，绑定状态本地持久化：

| 平台 | 图标 | 说明 |
|------|------|------|
| GitHub | 🐙 | 输入 GitHub 用户名绑定 |
| 微信 | 💬 | 输入微信 ID 绑定 |
| QQ | 🐧 | 输入 QQ 号绑定 |
| 飞书 | 🪶 | 输入飞书 ID 绑定 |

操作：点击「绑定」→ 弹窗输入账号 → 确认 → 显示已绑定状态 + 解绑按钮

---

### 5.4 反馈与建议

路径：`/user/coming-soon/4`

多字段反馈表单，支持邮件通知：

| 字段 | 类型 |
|------|------|
| 反馈类型 | 功能建议 / Bug 报告 / 使用问题 / 其他 |
| 标题 | 文本输入 |
| 详细描述 | 多行文本域 |
| 联系邮箱 | 邮箱输入（可选） |

**发送逻辑：**
1. 主路径：POST `/api/feedback/submit` → 后端 smtplib 发送邮件至 `13425121993@163.com`
2. 降级：后端不可用时自动 `mailto:` 跳转本地邮件客户端

```python
# RagBackend/feedback/feedback_router.py
POST /api/feedback/submit
# SMTP 配置：SMTP_USER / SMTP_PASS 环境变量
```

---

### 5.5 历史记录

路径：`/history`

聚合展示所有历史活动，按日期分组：

| 类型 | 说明 |
|------|------|
| 💬 对话历史 | 与 AI 的所有对话记录 |
| 🤖 任务历史 | Agent 任务执行记录 |
| 📝 笔记历史 | 在知识库中创建的笔记 |
| 🔍 搜索历史 | 全局搜索记录 |

功能：
- 按类型筛选
- 关键词搜索
- 点击跳转原始内容
- 批量删除

---

### 5.6 全局搜索

快捷键：`Ctrl + K`

- 浮窗覆盖式搜索界面
- 搜索范围：知识库名称 + 对话内容 + 文档标题
- 键盘导航（↑↓ 选择，Enter 跳转，Esc 关闭）
- 实时结果，无需回车
- 搜索历史记录

---

### 5.7 置顶功能

全平台统一的置顶机制，**localStorage 持久化**，重启后保持状态。

| 模块 | 置顶对象 | 入口 |
|------|---------|------|
| 知识库列表 | 知识库卡片 | 卡片菜单 / 卡片右上角按钮 |
| 文件管理 | 单个文件 | 表格操作列 📌 按钮 |
| 模型管理 | Ollama 模型 | 操作列 📌 按钮 |
| 历史记录 | 对话/任务条目 | 条目操作按钮 |

置顶后在对应页面**顶部固定区域**展示，用 📌 徽章标识。

---

### 5.8 全局交互动效

文件：`src/styles/animations.css`（全局引入）

| 动效类型 | 说明 | CSS 类 |
|---------|------|--------|
| **页面过渡** | 路由切换淡入淡出 + 轻微位移 | `.page-enter-active` |
| **按钮光晕** | hover 时发光扩散效果 | `.btn-glow` |
| **按钮缩放** | active 时轻微压缩反馈 | `.btn-press` |
| **卡片悬浮** | hover 上移 + 阴影加深 | `.card-hover` |
| **骨架屏** | 灰色条流光扫过动画 | `.skeleton` |
| **列表浮入** | 列表项逐一延迟出现 | `.delay-1` ~ `.delay-5` |
| **毛玻璃** | backdrop-filter 磨砂效果 | `.glass` |
| **脉冲** | 圆形无限脉冲扩散 | `.pulse-ring` |

所有动效支持 `prefers-reduced-motion` 媒体查询，用户开启"减少动态效果"时自动关闭。

---

### 5.9 系统设置（Win11 风格）

路径：`/settings`

全面改版为仿 Windows 11 设置页面风格：

**布局：** 左侧分组导航栏 + 右侧内容区

**6 大分组 / 12 个 Tab：**

| 分组 | Tab |
|------|-----|
| 🔧 通用 | 通用设置、外观主题 |
| 🤖 模型 | 多模型管理、检索策略 |
| 📚 知识库 | 知识库配置、OCR 解析 |
| 🔗 集成 | 办公联动（6平台）、多数据源 |
| 🔐 安全 | RBAC 权限、API Key、合规中心 |
| 📊 管理 | 审计日志、使用统计 |

**办公联动 6 平台网格：**

| 平台 | 功能 |
|------|------|
| 📓 Obsidian | Vault 路径配置，增量同步到知识库 |
| 🪶 飞书 | Webhook URL，消息推送模板 |
| 🔔 钉钉 | Webhook + 加签密钥，群机器人推送 |
| 💼 企业微信 | Webhook URL，推送触发条件 |
| 📒 Notion | Integration Token + Database ID |
| 🐙 GitHub | Personal Access Token，仓库文档同步 |

点击平台卡片展开配置面板，支持连接测试，`slide-down` 过渡动效。

---

### 5.10 系统架构图（新）

路径：`/architecture`

独立可视化页面，帮助开发者和用户直观理解系统设计。

**4 个 Tab：**

| Tab | 内容 |
|-----|------|
| 🏗️ **技术栈** | 各层技术选型及版本，交互式卡片展示 |
| 🔄 **数据流** | RAG 问答完整数据流程图 |
| 🚀 **部署拓扑** | Docker 服务拓扑图（前端/后端/MySQL/Ollama） |
| 🧩 **模块依赖** | 后端模块间依赖关系图 |

**入口：** SideBar 工具栏「系统架构」图标 → 路由 `/architecture`。

---

## 6. 集成与联动

### 6.1 Obsidian 笔记同步

将 Obsidian Vault 中的笔记自动同步到知识库。

```python
# RagBackend/integrations/obsidian_sync.py
POST /api/integrations/obsidian/sync   -- 手动触发同步
GET  /api/integrations/obsidian/status -- 同步状态
```

配置（Settings 页「办公联动」Tab）：
- Vault 路径（本地目录）
- 同步频率：手动 / 每小时 / 每天
- 目标知识库选择
- 增量同步（只处理变更文件，SHA256 去重）

---

### 6.2 飞书机器人

将 AI 回答或知识库内容推送到飞书群。

```python
# RagBackend/integrations/feishu_bot.py
POST /api/integrations/feishu/send    -- 发送消息
POST /api/integrations/feishu/test    -- 测试连接
```

配置：
- Webhook URL（飞书机器人 Webhook）
- 消息模板（Markdown 富文本）
- 触发条件（对话结束后自动推送 / 手动推送）

环境变量：`FEISHU_WEBHOOK_URL`、`FEISHU_SECRET`

---

### 6.3 钉钉 / 企微 / Notion / GitHub

**钉钉机器人：**
```python
# RagBackend/integrations/dingtalk_bot.py
POST /api/integrations/dingtalk/send   -- 发送消息
POST /api/integrations/dingtalk/test   -- 测试连接
```
配置：Webhook URL + 加签密钥（`DINGTALK_WEBHOOK_URL`、`DINGTALK_SECRET`）

**企业微信机器人：**
```python
# RagBackend/integrations/wecom_bot.py
POST /api/integrations/wecom/send
```
配置：`WECOM_WEBHOOK_URL`

**Notion 同步：**
- Integration Token + Database ID
- 将 Notion 数据库内容同步为知识库文档
- 配置：`NOTION_TOKEN`、`NOTION_DATABASE_ID`

**GitHub 文档同步：**
- Personal Access Token 授权
- 同步指定仓库的 Markdown 文档到知识库
- 配置：`GITHUB_TOKEN`

---

### 6.4 多数据源接入

除本地上传外，支持从多种外部数据源同步文档：

| 数据源 | 说明 |
|--------|------|
| **阿里云 OSS** | 指定 Bucket + 前缀，自动拉取文件 |
| **AWS S3** | 兼容 S3 协议的对象存储 |
| **MySQL** | 查询指定表，将结果文本化后向量化 |
| **PostgreSQL** | 同 MySQL |
| **SQLite** | 本地 SQLite 数据库文件 |
| **HTTP URL** | 批量爬取网页内容 |

```python
# RagBackend/data_sources/datasource_manager.py
POST /api/datasource/add     -- 添加数据源
POST /api/datasource/sync    -- 触发同步
GET  /api/datasource/list    -- 数据源列表
```

---

## 7. 系统管理

### 7.1 开放 API

为开发者提供编程访问接口，通过 API Key 鉴权。

```python
# RagBackend/open_api/api_key_manager.py
POST /api/openapi/keys/create   -- 创建 API Key
GET  /api/openapi/keys/list     -- 查看所有 Key
DELETE /api/openapi/keys/{id}   -- 撤销 Key
```

- API Key 格式：`ragf_` 前缀 + SHA256 随机串
- 权限范围：读取 / 问答 / 管理
- 调用示例：

```bash
curl -H "X-API-Key: ragf_xxxx" \
     -X POST http://localhost:8000/api/chat/send \
     -d '{"question": "你好", "kb_id": "xxx"}'
```

设置页「API Key」Tab 可视化管理。

---

### 7.2 审计日志

记录所有敏感操作，便于排查问题和合规审计。

```python
# RagBackend/audit/audit_log.py
# ASGI 中间件，自动拦截所有请求
GET /api/audit/logs   -- 查询审计日志（分页+过滤）
```

记录内容：
- 时间戳
- 操作用户
- 请求路径 + 方法
- 客户端 IP
- 响应状态码
- 耗时（ms）

存储：SQLite 文件（`audit.db`），设置页「审计日志」Tab 可视化查看。

---

### 7.3 增量向量化

优化文档处理性能，避免重复向量化未变更的文档。

```python
# RagBackend/document_processing/incremental_vectorizer.py
POST /api/vectorize/file    -- 单文件向量化（增量）
POST /api/vectorize/batch   -- 批量向量化（增量）
GET  /api/vectorize/status  -- 向量化任务状态
```

原理：
1. 计算文档内容 SHA256 哈希
2. 与向量库中记录的哈希对比
3. 哈希未变更 → 跳过，节省计算资源
4. 哈希变更 → 重新分块、向量化、更新索引

---

### 7.4 RBAC 权限管理

基于角色的访问控制，支持细粒度权限配置。

```python
# RagBackend/rbac/rbac_manager.py
GET  /api/rbac/roles        -- 角色列表
POST /api/rbac/roles        -- 创建角色
POST /api/rbac/assign       -- 为用户分配角色
GET  /api/rbac/permissions  -- 权限列表
```

| 内置角色 | 权限范围 |
|---------|---------|
| Admin | 全部操作 |
| Editor | 上传/编辑/问答 |
| Viewer | 只读/问答 |

设置页「安全」→「RBAC 权限」Tab 可视化管理用户角色。

---

### 7.5 OCR 文档解析

支持从图片和扫描版 PDF 中提取文字，扩展文档处理能力。

```python
# RagBackend/ocr/ocr_processor.py
POST /api/ocr/extract    -- 图片/PDF OCR 提取
GET  /api/ocr/status     -- OCR 服务状态
```

| 支持格式 | 说明 |
|---------|------|
| PNG / JPEG / WebP | 图片直接 OCR |
| 扫描版 PDF | 逐页提取文字 |
| 手写体 | 支持中英文手写识别 |

设置页「知识库」→「OCR 解析」Tab 可配置 OCR 引擎和语言包。

---

### 7.6 系统监控（新）

**功能描述：** 集成 Prometheus 指标采集中间件，配合前端 ECharts 提供实时系统性能可视化。

```python
# RagBackend/monitoring/prometheus_middleware.py
# ASGI 中间件，自动采集请求指标
GET /api/metrics              -- Prometheus 格式指标（供 Grafana 抓取）
GET /api/metrics/summary      -- ECharts 用 JSON 摘要数据
```

**采集指标：**

| 指标 | 说明 |
|------|------|
| 请求总量 | 按路径/方法统计 QPS |
| 响应延迟 | P50/P95/P99 分位数 |
| 错误率 | 4xx/5xx 比例 |
| 活跃连接数 | 当前 SSE 长连接数 |

**前端展示：** Settings「📈 系统监控」Tab，ECharts 折线图/仪表盘，30 秒自动刷新。

---

---

## 8. 移动端 App

**位置：** `KnowledgeRAG-GZHU/RagMobile/`  
**技术栈：** React Native + Expo SDK 53 + TypeScript + zustand

### 功能覆盖

| 屏幕 | 功能 |
|------|------|
| LoginScreen | 邮箱登录/注册，JWT 存储 |
| KnowledgeBaseScreen | 知识库列表、创建、删除 |
| KnowledgeDetailScreen | 文档管理、文件上传、URL 导入 |
| ChatScreen | RAG 对话，SSE 流式，引用溯源 |
| AgentScreen | Agent 任务模式，步骤可视化 |
| SettingsScreen | 多模型配置、Obsidian/飞书设置 |

### 特色组件

- **VoiceButton**：expo-av 录音 + Whisper 转录，长按触发
- **MessageBubble**：消息气泡，AI 回答含引用来源折叠展示

### 启动与打包

```bash
# 本地开发
cd RagMobile
npm install
npx expo start

# 打包 APK（EAS Cloud Build）
npm install -g eas-cli
eas login          # 账号: gzlns
eas build -p android --profile preview   # 输出 APK

# 打包 AAB（Google Play）
eas build -p android --profile production
```

**注意：** 打包前将 `EXPO_PUBLIC_API_URL` 改为服务器真实 IP/域名。

---

## 9. 部署方案

### Docker Compose（完整栈）

```yaml
# docker-compose.yml 包含以下服务：
services:
  frontend:    # Vue3 + Nginx，端口 8089
  backend:     # FastAPI，端口 8000
  db:          # MySQL 9.6，端口 3306
  ollama:      # Ollama，端口 11435（宿主机）→ 11434（容器）
```

```bash
docker compose up -d          # 启动
docker compose logs -f        # 查看日志
docker compose down           # 停止
docker compose pull && docker compose up -d  # 更新
```

### Docker Compose 轻量版（云端 API）

```yaml
# docker-compose.lite.yml — 无 MySQL / Ollama
# 适合使用 DeepSeek / OpenAI 等云端 API 的场景
services:
  frontend:    # Vue3 + Nginx，端口 8089
  backend:     # FastAPI，端口 8000（SQLite 替代 MySQL）
```

```bash
docker compose -f docker-compose.lite.yml up -d
```

### 前端独立构建

```bash
cd RagFrontend
npm run build    # 输出 dist/
# 可部署到 Nginx、Vercel、CDN 等
```

```nginx
# nginx.conf 已配置：
# - /api/* 反代到后端 8000
# - gzip 压缩
# - Vue Router history 模式支持
```

---

## 10. 目录结构

```
KnowledgeRAG-GZHU/
├── RagFrontend/                    # Vue3 前端
│   ├── src/
│   │   ├── views/
│   │   │   ├── KnowledgePages/    # 知识库相关页面
│   │   │   │   ├── KnowledgeBase.vue       # 知识库列表（置顶+拖拽）
│   │   │   │   ├── KnowledgeDetail.vue     # 知识库详情（笔记+URL导入）
│   │   │   │   ├── knowledge-setting-card.vue  # 三级权限设置
│   │   │   │   ├── SharedSquare.vue        # 知识广场（B站模式）
│   │   │   │   └── SharedDetail.vue        # 公开知识库详情
│   │   │   ├── Chat.vue           # RAG智能问答（引用溯源+语音）
│   │   │   ├── Agent.vue          # Agent任务模式（ReAct可视化+Ollama状态徽章）
│   │   │   ├── History.vue        # 历史记录聚合（置顶+搜索）
│   │   │   ├── Settings.vue       # 系统设置（Win11风格，12 Tab）
│   │   │   ├── Creation.vue       # 文档创作（5种模式SSE流式生成）
│   │   │   ├── Architecture.vue   # 系统架构图（4 Tab 可视化）
│   │   │   └── LogonOrRegister/   # 登录注册（粒子动效背景）
│   │   ├── components/
│   │   │   ├── SideBar.vue        # 左侧折叠导航（含架构图/文档创作入口）
│   │   │   ├── GlobalSearch.vue   # Ctrl+K全局搜索
│   │   │   ├── ModelSelector.vue  # 多模型切换
│   │   │   ├── RetrievalConfig.vue # 检索策略配置
│   │   │   ├── VoiceInput.vue     # 语音输入（波形动画）
│   │   │   ├── SmartAssistant.vue # 右侧智能助手（可折叠）
│   │   │   ├── ShareModal.vue     # 分享链接+二维码
│   │   │   └── SettingsTabs/      # 12个设置子Tab组件
│   │   │       ├── RagEvalTab.vue       # RAG评测（ECharts雷达/柱/直方图）
│   │   │       ├── MultiModelTab.vue    # 多云模型UI
│   │   │       ├── SystemMonitorTab.vue # Prometheus监控
│   │   │       ├── OcrTab.vue
│   │   │       ├── RbacTab.vue
│   │   │       ├── ComplianceTab.vue
│   │   │       └── ...
│   │   ├── store/
│   │   │   ├── index.ts           # Pinia store 统一导出
│   │   │   └── modules/
│   │   │       └── useEvalStore.ts  # RAG评测状态跨路由持久化
│   │   ├── composables/
│   │   │   └── useTheme.ts        # 主题/字体/深色模式统一管理
│   │   ├── styles/
│   │   │   └── animations.css     # 全局交互动效（含深色模式§21/字体§22）
│   │   ├── i18n/index.ts          # 中英双语
│   │   ├── utils/request.ts       # Axios封装（分块上传+重试）
│   │   └── router/index.ts        # 路由配置（含/creation /architecture）
│   ├── Dockerfile
│   └── nginx.conf
│
├── RagBackend/                     # FastAPI 后端
│   ├── main.py                    # 入口文件
│   ├── RAGF_User_Management/      # 用户认证模块
│   ├── RAG_M/src/
│   │   ├── rag/rag_pipeline.py   # RAG流水线 v3
│   │   └── agent/react_agent.py  # ReAct Agent
│   ├── document_processing/
│   │   ├── incremental_vectorizer.py  # 增量向量化
│   │   ├── retrieval_strategy.py      # 五策略检索
│   │   └── reranker.py                # Cross-Encoder 重排
│   ├── models/
│   │   └── user_model_config.py   # 用户自定义模型配置（GET/POST/测试）
│   ├── doc_creation/
│   │   └── doc_creation.py        # 文档创作5种模式SSE
│   ├── monitoring/
│   │   └── prometheus_middleware.py # Prometheus ASGI 中间件
│   ├── multi_model/model_router.py    # 多模型SSE路由
│   ├── multimodal/whisper_asr.py      # 语音识别
│   ├── agent_tools/web_search_tool.py # DuckDuckGo联网搜索
│   ├── integrations/
│   │   ├── obsidian_sync.py       # Obsidian同步
│   │   ├── feishu_bot.py          # 飞书机器人
│   │   ├── dingtalk_wecom.py      # 钉钉/企微（含/configure /test端点）
│   │   └── ...
│   ├── data_sources/datasource_manager.py  # 多数据源
│   ├── open_api/api_key_manager.py    # 开放API Key
│   ├── audit/audit_log.py             # ASGI审计中间件
│   ├── rbac/rbac_manager.py           # RBAC权限管理
│   ├── ocr/ocr_processor.py           # OCR文档解析
│   ├── feedback/feedback_router.py    # 反馈邮件
│   └── .env                          # 环境变量
│
├── RagMobile/                      # React Native 移动端
│   ├── App.tsx
│   ├── src/
│   │   ├── api/api.ts             # API层（AsyncStorage缓存层）
│   │   ├── navigation/
│   │   ├── screens/
│   │   ├── components/
│   │   └── store/
│   │       └── useKbStore.ts      # 知识库Store（5分钟列表缓存）
│   └── eas.json
│
├── dev.ps1                         # 一键开发启动脚本
├── docker-compose.yml              # 容器编排（前端+后端+MySQL+Ollama）
└── docker-compose.lite.yml         # 轻量版（无MySQL/Ollama，适合云端API）
```

---

## 11. 环境变量说明

创建 `RagBackend/.env` 文件：

```env
# 数据库
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=rag_user_db

# 认证
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRE_HOURS=24

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
MODEL=qwen2:0.5b

# 云端模型（可选）
OPENAI_API_KEY=sk-xxx
DEEPSEEK_API_KEY=sk-xxx
HUNYUAN_SECRET_ID=xxx
HUNYUAN_SECRET_KEY=xxx

# 语音识别
WHISPER_MODEL=base

# 飞书集成（可选）
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
FEISHU_SECRET=xxx

# 钉钉集成（可选）
DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=xxx
DINGTALK_SECRET=xxx

# 企业微信集成（可选）
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx

# Notion 集成（可选）
NOTION_TOKEN=secret_xxx
NOTION_DATABASE_ID=xxx

# GitHub 集成（可选）
GITHUB_TOKEN=ghp_xxx

# 邮件反馈（可选）
SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_USER=your_email@163.com
SMTP_PASS=your_smtp_password

# 对象存储（可选）
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_ACCESS_KEY=xxx
OSS_SECRET_KEY=xxx
OSS_BUCKET=your-bucket
```

---

## 常见问题 FAQ

**Q: 启动后端报 SyntaxError？**  
A: 检查 Python 文件中是否有中文弯引号（`""`）混入代码字符串，替换为英文引号。

**Q: 访问 localhost:8000 显示 502？**  
A: 可能是 VPN/代理拦截了 localhost。执行：
```powershell
Set-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" ProxyOverride "localhost;127.0.0.1;<-loopback>"
```

**Q: Ollama 模型加载失败 / 内存不足？**  
A: 切换到小模型：`ollama pull qwen2:0.5b`，并在 `.env` 中设置 `MODEL=qwen2:0.5b`。

**Q: 前端端口 5173 无法访问？**  
A: 使用一键脚本启动：`powershell -ExecutionPolicy Bypass -File .\dev.ps1`

**Q: dev.ps1 脚本报错 / 乱码？**  
A: 脚本必须用纯 ASCII 编码保存，不能含有中文注释。

**Q: 如何打包移动端 APK？**  
A: 参考 [第8节](#8-移动端-app)，需要 EAS 账号（免费注册 expo.dev），首次打包约 10-15 分钟。

---

*文档最后更新：2026-03-27 | commit `59ffcfe`*
