<div align="center">

# RAG-F · 智能知识管理平台

**基于检索增强生成（RAG）的私有知识库问答系统**

[![Vue3](https://img.shields.io/badge/Vue-3.x-42b883?logo=vue.js)](https://vuejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?logo=docker)](https://docs.docker.com/compose/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)
[![Version](https://img.shields.io/badge/commit-59ffcfe-brightgreen)](https://github.com/March030303/KnowledgeRAG-GZHU/commits/main)

[快速启动](#-快速启动) · [功能模块](#4-核心功能模块) · [API 文档](http://localhost:8000/docs) · [移动端 App](#8-移动端-app) · [部署方案](#9-部署方案)

</div>

---

## 📖 项目简介

**RAG-F** 是一套面向个人与团队的智能知识管理平台，通过将私有文档与本地/云端大语言模型深度结合，实现**检索增强生成（RAG）**问答，显著降低 AI 幻觉、提升领域知识回答的准确性。

**核心价值：**

- 🧠 **防幻觉问答** — 答案严格基于你的文档，来源可追溯
- 📚 **统一知识管理** — 多格式文档、URL 批量导入、权限分级
- 🤖 **Agent 任务模式** — ReAct 框架，自然语言驱动多步骤任务
- ✍️ **文档创作** — 5 种模式 SSE 流式生成（报告/摘要/大纲/博客/论文）
- 🔗 **办公联动** — Obsidian / 飞书 / 钉钉 / 企微 / Notion / GitHub
- 📱 **双端支持** — Web + React Native 移动端 App
- 🗺️ **系统架构图** — 可视化 4-Tab 架构展示（技术栈/数据流/部署/模块）
- 🚀 **本地部署** — 数据不离本地，一键 Docker 启动

---

## 目录

1. [项目简介](#-项目简介)
2. [技术架构](#-技术架构)
3. [快速启动](#-快速启动)
4. [核心功能模块](#4-核心功能模块)
    - 4.1 [用户认证系统](#41-用户认证系统)
    - 4.2 [知识库管理](#42-知识库管理)
    - 4.3 [RAG 智能问答](#43-rag-智能问答)
    - 4.4 [Agent 任务模式](#44-agent-任务模式)
    - 4.5 [多模型适配](#45-多模型适配)
    - 4.6 [检索策略配置](#46-检索策略配置)
    - 4.7 [语音交互](#47-语音交互)
    - 4.8 [联网搜索](#48-联网搜索)
    - 4.9 [文档创作](#49-文档创作)
    - 4.10 [RAG 评测](#410-rag-评测)
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
    - 5.10 [系统架构图](#510-系统架构图)
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
    - 7.6 [系统监控](#76-系统监控)
8. [移动端 App](#8-移动端-app)
9. [部署方案](#9-部署方案)
10. [目录结构](#10-目录结构)
11. [环境变量说明](#11-环境变量说明)
12. [常见问题 FAQ](#12-常见问题-faq)
13. [Contributors](#13-contributors)
14. [后续规划](#14-后续规划)

---

## 🏗️ 技术架构

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

| 层级       | 技术选型                               |
| ---------- | -------------------------------------- |
| 前端框架   | Vue 3 + TypeScript + Vite 5            |
| UI 组件库  | TDesign Vue Next                       |
| 状态管理   | Pinia（跨路由持久化）                  |
| 后端框架   | FastAPI + uvicorn                      |
| LLM 框架   | LangChain                              |
| 本地模型   | Ollama（推荐 `qwen2:0.5b`，低配友好）  |
| 关系数据库 | MySQL 9.6（Docker 托管）               |
| 重排模型   | Cross-Encoder（sentence-transformers） |
| 移动端     | React Native + Expo SDK 53 + zustand   |
| 容器化     | Docker + Docker Compose                |
| 语音识别   | OpenAI Whisper（本地）                 |
| 监控       | Prometheus 中间件 + ECharts            |

---

## 🚀 快速启动

### 环境前置要求

1. **安装 Ollama**：[https://ollama.com](https://ollama.com)
2. **拉取推荐模型**（低配机器）：
    ```bash
    ollama pull qwen2:0.5b    # ~400MB，仅需 600MB 内存
    ```
3. **硬件最低要求**（运行 qwen2:0.5b）：

    | 组件        | 最低要求                   |
    | ----------- | -------------------------- |
    | 内存（RAM） | 4GB                        |
    | 存储空间    | 5GB                        |
    | GPU         | 可选（CPU 也可运行小模型） |

---

### 方式一：Docker Compose（推荐生产/演示）

```bash
# 克隆仓库
git clone https://github.com/March030303/KnowledgeRAG-GZHU.git
cd KnowledgeRAG-GZHU

# 配置环境变量
cp RagBackend/.env.example RagBackend/.env
# 编辑 .env，填写 DB_PASSWORD / JWT_SECRET 等

# 一键启动（前端 + 后端 + MySQL + Ollama）
docker compose up -d

# 访问
# 前端：    http://localhost:8089
# API 文档：http://localhost:8000/docs
# Ollama：  http://localhost:11435
```

---

### 方式二：一键开发脚本（推荐本地开发）

```powershell

# 启动所有服务（MySQL 用 Docker 托管，后端 + 前端本地运行）

powershell -ExecutionPolicy Bypass -File .\dev.ps1

# 查看状态

powershell -ExecutionPolicy Bypass -File .\dev.ps1 -Status

# 停止所有

powershell -ExecutionPolicy Bypass -File .\dev.ps1 -Stop

# 访问

# 前端（Vite）：http://localhost:5173
# 后端 API： http://localhost:8000
# API 文档： http://localhost:8000/docs

```

> **智能跳过**：脚本自动检测已运行的服务，二次调用几乎瞬间完成。

---

### 方式三：手动启动

# 1. 启动 MySQL（Docker）

```
docker run -d --name ragf-mysql -e MYSQL_ROOT_PASSWORD=yourpw -p 3306:3306 mysql:9.6
```

# 2. 后端

```
cd RagBackend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

# 3. 前端

```
cd RagFrontend
npm install
npm run dev # → http://localhost:5173

```

---

## 4. 核心功能模块

### 4.1 用户认证系统

**功能描述：** 完整的账号生命周期管理，支持邮箱注册/登录。

| 功能     | 说明                                   |
| -------- | -------------------------------------- |
| 邮箱注册 | 输入邮箱+密码创建账户，bcrypt 加密存储 |
| 邮箱登录 | JWT Token 鉴权，自动续期               |
| 忘记密码 | 验证码找回流程                         |
| 个人资料 | 头像、昵称、邮箱修改                   |
| 语言设置 | 中文/English 切换，localStorage 持久化 |

**数据库表：**

```

user (id, email, password, created_at, qq_openid)
user_profile (user_id, nickname, avatar, ...)

```

**API 端点：**

```

POST /api/user/register -- 注册
POST /api/user/login -- 登录
GET /api/user/profile -- 获取资料
PUT /api/user/profile -- 更新资料

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
- 📦 **知识库备份**：一键导出 ZIP 打包下载

#### 知识库详情页

- 📄 **文档管理**：列表展示所有文档，支持删除、重命名
- 📤 **文件上传**：支持 PDF、Word、TXT、Markdown、Excel、图片等格式
- 🔗 **URL 批量导入**：弹窗输入多个 URL，自动抓取并向量化
- 📝 **笔记模块**：在详情页直接记录笔记，关联到知识库
- ⚙️ **知识库设置**：名称、描述、权限配置

#### 权限体系（三级）

```

个人（Private） → 仅创建者可见
共享（Shared） → 指定成员可访问，支持分享链接
广场（Public） → 所有用户可见，支持搜索发现

```

**API 端点：**

```

GET /api/knowledge/list -- 知识库列表
POST /api/knowledge/create -- 创建知识库
DELETE /api/knowledge/{id} -- 删除知识库
POST /api/knowledge/{id}/upload -- 上传文档
POST /api/knowledge/{id}/url -- URL导入
GET /api/knowledge/{id}/docs -- 文档列表

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

POST /api/chat/send -- 发送消息（SSE流式）
GET /api/chat/history -- 对话历史
DELETE /api/chat/{id} -- 删除对话

```

---

### 4.4 Agent 任务模式

**功能描述：** 基于 ReAct（Reasoning + Acting）框架的智能 Agent，能够分解复杂任务、调用工具链自主完成目标。

#### 执行可视化

```

任务输入
→ 🤔 Thought（推理步骤）
→ 🔧 Action（工具调用）
→ 👁️ Observation（执行结果）
→ 循环直到任务完成
→ ✅ Final Answer

```

#### 工具链

| 工具       | 说明                              |
| ---------- | --------------------------------- |
| 知识库检索 | 在指定知识库中语义搜索            |
| 联网搜索   | DuckDuckGo 实时搜索（零 API Key） |
| 文档读取   | 读取并分析指定文档内容            |
| 代码执行   | 运行 Python 代码片段              |

- 任务历史 localStorage 持久化，按日期分组
- 离线降级模板，Ollama 不可用时仍可演示

**API 端点：**

```

POST /api/agent/run -- 启动Agent任务（SSE流式）
GET /api/agent/history -- 任务历史
POST /api/agent/web-search -- 联网搜索工具

```

---

### 4.5 多模型适配

**功能描述：** 统一的多模型路由层，支持本地和云端多种 LLM，按需切换。

| 类型 | 模型                  | 说明                              |
| ---- | --------------------- | --------------------------------- |
| 本地 | Ollama (qwen2:0.5b)   | ~400MB，仅需 600MB 内存，推荐低配 |
| 本地 | Ollama (qwen:7b-chat) | 4.2GB，需 17GB+ 内存              |
| 云端 | OpenAI GPT-4/3.5      | 需配置 API Key                    |
| 云端 | DeepSeek              | 需配置 API Key                    |
| 云端 | 腾讯混元              | 需配置 API Key                    |

#### 用户自定义模型配置

- 设置页「⚡ 模型配置」Tab，可自定义 Ollama 地址、模型名称、请求超时时长
- **离线也可保存**：优先存 localStorage，后端不可用时仍提示成功
- Chat 侧边栏绿色徽章显示当前使用模型，点击跳转设置页

```

GET /api/model-config/user -- 获取用户模型配置
POST /api/model-config/user -- 保存用户模型配置
GET /api/model-config/local -- 查询本地已安装 Ollama 模型
POST /api/model-config/test -- 测试模型连接
POST /api/model/chat -- 统一对话接口（SSE）
GET /api/model/list -- 可用模型列表

```

---

### 4.6 检索策略配置

| 策略       | 说明                                   | 适用场景         |
| ---------- | -------------------------------------- | ---------------- |
| **Vector** | 纯向量语义相似度检索                   | 语义理解要求高   |
| **BM25**   | 关键词稀疏检索                         | 精确词匹配场景   |
| **Hybrid** | 向量 + BM25 线性加权融合               | 通用场景推荐     |
| **RRF**    | 倒数排名融合（Reciprocal Rank Fusion） | 多路召回重排     |
| **MMR**    | 最大边际相关性（减少冗余）             | 需要多样性的场景 |

前端 `RetrievalConfig.vue` 组件提供滑块、选择器等直观配置界面，参数透传至 RAG Pipeline。

---

### 4.7 语音交互

```

点击麦克风按钮
→ MediaRecorder 开始录音（WebM 格式）
→ 波形动画实时显示（8条动态柱）
→ 再次点击停止录音
→ POST /api/voice/transcribe（Whisper 后端）
→ 转录文字填入输入框
→ 一键发送问答

```

当后端 Whisper 服务不可用时，自动降级为浏览器原生 **Web Speech API**（需 Chrome/Edge）。

```

POST /api/voice/transcribe -- 音频转文字
GET /api/voice/status -- ASR 服务状态

```

---

### 4.8 联网搜索

集成 DuckDuckGo 联网搜索，无需 API Key，Agent 可调用实时获取最新信息。

```

POST /api/agent/web-search -- 联网搜索
参数：{"query": "搜索关键词", "max_results": 5}

```

---

### 4.9 文档创作

**功能描述：** 基于知识库内容，以 SSE 流式方式生成结构化文档，覆盖 5 种常见写作场景。

| 模式         | 说明                         | 输出特点            |
| ------------ | ---------------------------- | ------------------- |
| **研究报告** | 基于知识库内容生成系统性报告 | 摘要 + 正文 + 结论  |
| **文章摘要** | 对文档进行精炼压缩           | 关键信息提炼        |
| **内容大纲** | 生成多级标题大纲             | 层次分明的结构      |
| **博客文章** | 轻松易读的博客风格           | 标题 + 段落 + 小节  |
| **学术论文** | 严谨的学术写作风格           | 摘要/引言/方法/结论 |

```

POST /api/creation/generate -- 文档创作（SSE 流式）
参数：{"mode": "report", "topic": "...", "kb_ids": [...]}

```

**前端入口：** SideBar「文档创作」→ `/creation`，`Creation.vue` 页面。

---

### 4.10 RAG 评测

**功能描述：** 对 RAG 系统进行多维度定量评测，以可视化图表展示评测结果，并支持跨路由状态持久化。

| 指标        | 说明                       |
| ----------- | -------------------------- |
| **准确率**  | 回答与标准答案的语义相似度 |
| **召回率**  | 检索到的相关段落覆盖率     |
| **F1 分数** | 准确率与召回率的调和平均   |
| **忠实度**  | 回答与文档原文的一致性     |
| **延迟**    | 端到端响应时间分布         |

- 📡 **雷达图**：5 维指标全貌对比
- 📊 **柱状图**：多组测试集横向对比
- 📈 **直方图**：响应延迟分布分析
- **Pinia Store** 跨路由持久化，切换页面不丢评测进度
- **全局进度浮层**：`App.vue` 底部 toast，任意页面均可感知评测进度

---

## 5. 扩展功能模块

### 5.1 个人主页与设置

| 设置项   | 说明                       |
| -------- | -------------------------- |
| 基本信息 | 头像、昵称、邮箱展示与修改 |
| 语言切换 | 中文 / English，实时生效   |
| 账号安全 | 修改密码                   |

---

### 5.2 外观与主题

完整的个性化外观系统，所有设置 **localStorage 持久化**：

| 功能         | 选项                                                            |
| ------------ | --------------------------------------------------------------- |
| **深色模式** | 亮色 / 暗色 切换，CSS variables 全局应用（`darkMode: 'class'`） |
| **主题色**   | 8 种预设色（蓝/紫/绿/红/橙/青/粉/灰）                           |
| **界面布局** | 默认布局 / 紧凑布局 / 宽松布局                                  |
| **字体大小** | 小 / 中 / 大，`font-size` 实时调整                              |

---

### 5.3 第三方账号绑定

| 平台   | 说明                   |
| ------ | ---------------------- |
| GitHub | 输入 GitHub 用户名绑定 |
| 微信   | 输入微信 ID 绑定       |
| QQ     | 输入 QQ 号绑定         |
| 飞书   | 输入飞书 ID 绑定       |

---

### 5.4 反馈与建议

多字段反馈表单，支持邮件通知。主路径：POST `/api/feedback/submit` → 后端 smtplib 发送邮件；降级时自动 `mailto:` 跳转本地邮件客户端。

---

### 5.5 历史记录

聚合展示所有历史活动，按日期分组：

| 类型        | 说明                 |
| ----------- | -------------------- |
| 💬 对话历史 | 与 AI 的所有对话记录 |
| 🤖 任务历史 | Agent 任务执行记录   |
| 📝 笔记历史 | 在知识库中创建的笔记 |
| 🔍 搜索历史 | 全局搜索记录         |

---

### 5.6 全局搜索

快捷键：`Ctrl + K`

- 浮窗覆盖式搜索界面
- 搜索范围：知识库名称 + 对话内容 + 文档标题
- 键盘导航（↑↓ 选择，Enter 跳转，Esc 关闭）
- 实时结果，搜索历史记录

---

### 5.7 置顶功能

全平台统一的置顶机制，**localStorage 持久化**，重启后保持状态。

| 模块       | 置顶对象      |
| ---------- | ------------- |
| 知识库列表 | 知识库卡片    |
| 文件管理   | 单个文件      |
| 模型管理   | Ollama 模型   |
| 历史记录   | 对话/任务条目 |

---

### 5.8 全局交互动效

文件：`src/styles/animations.css`

| 动效类型     | 说明                        |
| ------------ | --------------------------- |
| **页面过渡** | 路由切换淡入淡出 + 轻微位移 |
| **按钮光晕** | hover 时发光扩散效果        |
| **卡片悬浮** | hover 上移 + 阴影加深       |
| **骨架屏**   | 灰色条流光扫过动画          |
| **列表浮入** | 列表项逐一延迟出现          |
| **毛玻璃**   | backdrop-filter 磨砂效果    |

所有动效支持 `prefers-reduced-motion` 媒体查询，用户开启"减少动态效果"时自动关闭。

---

### 5.9 系统设置（Win11 风格）

路径：`/settings`，左侧分组导航栏 + 右侧内容区。

**6 大分组 / 12 个 Tab：**

| 分组      | Tab                                   |
| --------- | ------------------------------------- |
| 🔧 通用   | 通用设置、外观主题                    |
| 🤖 模型   | 多模型管理（⚡ 自定义配置）、检索策略 |
| 📚 知识库 | 知识库配置、OCR 解析                  |
| 🔗 集成   | 办公联动（6平台）、多数据源           |
| 🔐 安全   | RBAC 权限、API Key、合规中心          |
| 📊 管理   | 审计日志、📈 系统监控                 |

**办公联动 6 平台：** Obsidian / 飞书 / 钉钉 / 企微 / Notion / GitHub，点击展开配置面板，支持连接测试。

---

### 5.10 系统架构图

路径：`/architecture`，独立可视化页面。

| Tab             | 内容                                        |
| --------------- | ------------------------------------------- |
| 🏗️ **技术栈**   | 各层技术选型及版本，交互式卡片展示          |
| 🔄 **数据流**   | RAG 问答完整数据流程图                      |
| 🚀 **部署拓扑** | Docker 服务拓扑图（前端/后端/MySQL/Ollama） |
| 🧩 **模块依赖** | 后端模块间依赖关系图                        |

**入口：** SideBar 工具栏「系统架构」图标 → 路由 `/architecture`。

---

## 6. 集成与联动

### 6.1 Obsidian 笔记同步

将 Obsidian Vault 中的笔记自动同步到知识库。

```

POST /api/integrations/obsidian/sync -- 手动触发同步
GET /api/integrations/obsidian/status -- 同步状态

```

配置（Settings 页「办公联动」Tab）：Vault 路径、同步频率（手动/每小时/每天）、目标知识库、增量同步（SHA256 去重）

---

### 6.2 飞书机器人

```

POST /api/integrations/feishu/send -- 发送消息
POST /api/integrations/feishu/test -- 测试连接

```

环境变量：`FEISHU_WEBHOOK_URL`、`FEISHU_SECRET`

---

### 6.3 钉钉 / 企微 / Notion / GitHub

```

POST /api/integrations/dingtalk/send -- 钉钉发送
POST /api/integrations/dingtalk/test -- 钉钉测试
POST /api/integrations/wecom/send -- 企微发送

```

- **Notion**：Integration Token + Database ID，同步数据库内容到知识库
- **GitHub**：Personal Access Token，同步指定仓库 Markdown 文档到知识库

---

### 6.4 多数据源接入

| 数据源         | 说明                             |
| -------------- | -------------------------------- |
| **阿里云 OSS** | 指定 Bucket + 前缀，自动拉取文件 |
| **AWS S3**     | 兼容 S3 协议的对象存储           |
| **MySQL**      | 查询指定表，将结果文本化后向量化 |
| **PostgreSQL** | 同 MySQL                         |
| **SQLite**     | 本地 SQLite 数据库文件           |
| **HTTP URL**   | 批量爬取网页内容                 |

```

POST /api/datasource/add -- 添加数据源
POST /api/datasource/sync -- 触发同步
GET /api/datasource/list -- 数据源列表

```

---

## 7. 系统管理

### 7.1 开放 API

```

POST /api/openapi/keys/create -- 创建 API Key
GET /api/openapi/keys/list -- 查看所有 Key
DELETE /api/openapi/keys/{id} -- 撤销 Key

```

```bash
curl -H "X-API-Key: ragf_xxxx" \
     -X POST http://localhost:8000/api/chat/send \
     -d '{"question": "你好", "kb_id": "xxx"}'
```

---

### 7.2 审计日志

ASGI 中间件自动拦截所有请求，记录时间戳/用户/路径/IP/状态码/耗时，存储于 SQLite（`audit.db`）。

```
GET /api/audit/logs   -- 查询审计日志（分页+过滤）
```

---

### 7.3 增量向量化

```
POST /api/vectorize/file    -- 单文件向量化（增量）
POST /api/vectorize/batch   -- 批量向量化（增量）
GET  /api/vectorize/status  -- 向量化任务状态
```

原理：计算 SHA256 哈希与向量库记录对比，哈希未变更则跳过，节省计算资源。

---

### 7.4 RBAC 权限管理

| 内置角色 | 权限范围       |
| -------- | -------------- |
| Admin    | 全部操作       |
| Editor   | 上传/编辑/问答 |
| Viewer   | 只读/问答      |

```
GET  /api/rbac/roles        -- 角色列表
POST /api/rbac/roles        -- 创建角色
POST /api/rbac/assign       -- 为用户分配角色
```

---

### 7.5 OCR 文档解析

支持 PNG/JPEG/WebP 图片及扫描版 PDF 文字提取，支持中英文手写识别。

```
POST /api/ocr/extract    -- 图片/PDF OCR 提取
GET  /api/ocr/status     -- OCR 服务状态
```

---

### 7.6 系统监控

集成 Prometheus 指标采集中间件，配合前端 ECharts 提供实时系统性能可视化。

| 指标       | 说明                |
| ---------- | ------------------- |
| 请求总量   | 按路径/方法统计 QPS |
| 响应延迟   | P50/P95/P99 分位数  |
| 错误率     | 4xx/5xx 比例        |
| 活跃连接数 | 当前 SSE 长连接数   |

```
GET /api/metrics              -- Prometheus 格式指标（供 Grafana 抓取）
GET /api/metrics/summary      -- ECharts 用 JSON 摘要数据
```

**前端展示：** Settings「📈 系统监控」Tab，ECharts 折线图/仪表盘，30 秒自动刷新。

---

## 8. 移动端 App

**位置：** `KnowledgeRAG-GZHU/RagMobile/`
**技术栈：** React Native + Expo SDK 53 + TypeScript + zustand

| 屏幕                  | 功能                          |
| --------------------- | ----------------------------- |
| LoginScreen           | 邮箱登录/注册，JWT 存储       |
| KnowledgeBaseScreen   | 知识库列表、创建、删除        |
| KnowledgeDetailScreen | 文档管理、文件上传、URL 导入  |
| ChatScreen            | RAG 对话，SSE 流式，引用溯源  |
| AgentScreen           | Agent 任务模式，步骤可视化    |
| SettingsScreen        | 多模型配置、Obsidian/飞书设置 |

```bash
# 本地开发
cd RagMobile
npm install
npx expo start

# 打包 APK（EAS Cloud Build）
npm install -g eas-cli
eas login              # 账号: gzlns
eas build -p android --profile preview   # 输出 APK

# 打包 AAB（Google Play）
eas build -p android --profile production
```

> **注意：** 打包前将 `EXPO_PUBLIC_API_URL` 改为服务器真实 IP/域名。

---

## 9. 部署方案

### Docker Compose（完整栈）

```
# docker-compose.yml 包含以下服务：
services:
    frontend: # Vue3 + Nginx，端口 8089
    backend: # FastAPI，端口 8000
    db: # MySQL 9.6，端口 3306
    ollama: # Ollama，端口 11435（宿主机）→ 11434（容器）
```

```bash
docker compose up -d          # 启动
docker compose logs -f        # 查看日志
docker compose down           # 停止
docker compose pull && docker compose up -d  # 更新
```

### Docker Compose 轻量版（云端 API）

```
# docker-compose.lite.yml — 无 MySQL / Ollama
# 适合使用 DeepSeek / OpenAI 等云端 API 的场景
services:
    frontend: # Vue3 + Nginx，端口 8089
    backend: # FastAPI，端口 8000（SQLite 替代 MySQL）
```

```bash
docker compose -f docker-compose.lite.yml up -d
```

### 前端独立构建

```
cd RagFrontend
npm run build    # 输出 dist/，可部署到 Nginx、Vercel、CDN 等
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
│   │   └── user_model_config.py   # 用户自定义模型配置
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
│   │   ├── dingtalk_wecom.py      # 钉钉/企微
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

创建 `RagBackend/.env`：

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

# Ollama（推荐小模型）
OLLAMA_BASE_URL=http://localhost:11434
MODEL=qwen2:0.5b

# 云端模型（可选）
OPENAI_API_KEY=sk-xxx
DEEPSEEK_API_KEY=sk-xxx
HUNYUAN_SECRET_ID=xxx
HUNYUAN_SECRET_KEY=xxx

# 语音识别（可选）
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

## 12. 常见问题 FAQ

**Q: Ollama 内存不足 / 500 错误？**
A: 切换小模型：`ollama pull qwen2:0.5b`，并在 `.env` 中设置 `MODEL=qwen2:0.5b`。

**Q: 后端启动报 SyntaxError？**
A: 检查 Python 文件中是否有中文弯引号（`""`）混入代码字符串，替换为英文引号。

**Q: 访问 localhost:8000 显示 502？**
A: 可能是 VPN/代理拦截 localhost，在代理设置中排除 `localhost;127.0.0.1`。

**Q: 端口 8000 被占用？**
A: `taskkill /F /IM python.exe` 或 `Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process`

**Q: dev.ps1 乱码 / 报错？**
A: 脚本必须用纯 ASCII 编码保存（不含中文注释）。

**Q: 如何打包移动端 APK？**
A: 参考 [第8节](#8-移动端-app)，需要 EAS 账号（免费注册 expo.dev），首次打包约 10-15 分钟。

---

## 13. 后续规划

- [x] 用户认证与权限管理
- [x] 多模型支持与参数配置
- [x] 用户自定义模型配置（Ollama 地址/模型名/超时）
- [x] 多格式文档处理（PDF/Word/Excel/图片）
- [x] 知识库 CRUD + 多维检索
- [x] Cross-Encoder 重排（二次精排）
- [x] Docker 一键部署（完整栈 + 轻量版）
- [x] Agent 任务模式（ReAct）
- [x] 移动端 App（React Native）
- [x] 语音输入（Whisper ASR）
- [x] 置顶 / 拖拽排序 / 全局动效
- [x] Win11 风格系统设置
- [x] 办公联动（Obsidian/飞书/钉钉/企微/Notion/GitHub）
- [x] 文档创作（5 种模式 SSE 流式生成）
- [x] RAG 评测面板（ECharts 可视化 + Pinia 持久化）
- [x] 系统架构图页面（4 Tab 可视化）
- [x] Prometheus 监控 + ECharts 系统监控 Tab
- [x] 知识库 ZIP 备份导出
- [ ] 文档协作（多人实时编辑）
- [ ] 知识图谱可视化增强
- [ ] 企业 SSO 登录（LDAP/SAML）

---

## 14. 未实现更新

> 本节记录经过评估后**暂不实现**的优化方案，保留原始设计思路供参考。

### 14.1 ~~Redis Stream 消息队列~~ ✅ 已于 `be97fe5` 后续版本实现

**解释：** 用 Redis Stream 替代内存队列，实现任务持久化、重试机制和死信队列，服务重启后任务不丢失。

**实现状态：** 已在 commit `ca18a43` 之后版本中实现——`task_queue.py` 已升级为 Redis Stream 持久化队列（含内存队列降级），`docker-compose.yml` 新增 Redis Alpine 服务。

---

### 14.2 独立子进程文件隔离处理

**解释：** 每个文件的解析和向量化在独立子进程中执行，完成后销毁进程释放内存，实现内存完全隔离。

**原本应用方向：** 防止单个大文件的解析/向量化内存泄漏积累导致 OOM，特别是多文件批量处理时。

**跳过原因：** docker-compose 已新增独立 `worker` 服务（与 `backend` 完全资源隔离），架构层面已解决内存隔离问题，无需进程级 multiprocessing。子进程 IPC 开销反而会拖慢整体吞吐，ROI 不高。

---

### 14.3 断点续传（分块 MD5 校验）

**解释：** 大文件上传时记录已上传分块的 MD5，断线重连后只上传未完成的分块，不从头开始。

**原本应用方向：** 防止大文件（>50MB）上传中途断网时需要重头传，提升用户体验。

**跳过原因：** 项目当前限制单文件最大 50MB（`doc_upload.py` `MAX_FILE_SIZE`），且文档类文件通常远小于此限制。现有分块上传机制（0.1MB/块）本身已经拆分了请求，实际发生断网重传的概率极低。断点续传需要后端持久化分块状态、前端增加重传逻辑，复杂度增加明显，ROI 不高。

---

### 14.4 ~~全链路超时统一（Nginx 600s 配置）~~ ✅ 已实现

**实现状态：** 已在本轮更新中实现——`nginx.conf` 为上传专用 location 配置 600s 超时，并开启 `proxy_request_buffering off` 避免 nginx 内存缓冲大文件。

---

### 14.5 所有异常返回 HTTP 200

**解释：** 业务异常和系统异常统一返回 HTTP 200，用业务 code 字段区分成功/失败。

**原本应用方向：** 防止前端因 4xx/5xx 状态码触发网络错误捕获，统一错误处理逻辑。

**跳过原因：** 这是反模式。HTTP 状态码是 REST 协议的核心语义，错误返回 200 会导致：监控告警失效（Prometheus 无法区分成功/失败）、日志排查困难、调试工具无法快速定位问题。正确做法是前端统一捕获 axios 的 error 响应，而不是让后端伪装成功。

---

### 14.6 向量化全局跨请求并发 Semaphore

**解释：** 在 FastAPI 进程级别维护一个全局 `asyncio.Semaphore`，限制同时运行的向量化请求总数（例如最多 2 个 `/ingest` 同时跑），超出的请求在 semaphore 处等待而不是直接执行。

**原本应用方向：** 防止多用户同时点击"向量化"时，多个 `/ingest` 并发占用 Embedding 模型导致内存溢出。

**跳过原因：** `/ingest` 和 `/native_ingest` 已改为 `asyncio.to_thread`，向量化在线程池中执行，本身不占用 event loop。项目是单用户/小团队场景，并发触发多个向量化的概率极低，且向量化耗时较长（几秒到几分钟），加全局 semaphore 反而可能导致前端长时间等待响应（semaphore 阻塞 `generate()` 入口）。当前方案已足够稳定，不引入额外的等待逻辑。

---

### 14.7 MySQL 水平分表

**解释：** 用 SQLAlchemy 实现文件元数据表、任务状态表按用户ID水平分表，支撑千万级元数据存储，无单表容量瓶颈。

**原本应用方向：** 海量文档元数据的高性能查询，长期运行无查询性能衰减。

**跳过原因：** 项目为校园/小团队场景，用户量和文档量均处于千级以内。MySQL 单表在百万行级别查询依然毫秒响应。分表会大幅增加 SQLAlchemy ORM 复杂度和维护成本，与项目规模严重不匹配，典型过度工程。

---

### 14.8 Redis 分布式读写锁（FAISS 并发写）

**解释：** 用 Redis 实现 FAISS 索引的分布式读写锁，保证同一时间只有一个写入操作，同时不阻塞读请求。

**原本应用方向：** 多进程/多容器场景下 FAISS 索引文件的并发写入保护。

**跳过原因：** 项目为单机 Docker 部署，向量化已在独立 `worker` 容器中单实例运行。`worker` 内部已有 `asyncio.Semaphore(_MAX_CONCURRENCY=2)` 限制并发写入数，单进程内无需分布式锁。引入 Redis 分布式锁会增加 lock/unlock 的网络开销和死锁风险，对单机场景是负优化。

---

### 14.9 Prometheus + Grafana 监控大盘（新增）

**解释：** 用 Alpine 版 Prometheus+Grafana 搭建上传全链路监控大盘，包含 QPS、响应时间、队列长度、系统资源等指标。

**原本应用方向：** 7×24 无人值守运维，问题秒级告警。

**跳过原因：** 项目 README 已有 Prometheus 监控能力（`monitoring.py` 中间件 + `/metrics` 端点），已能满足基础监控需求。Grafana 容器虽然只有 ~40MB，但需要额外配置 dashboard JSON + Alertmanager 告警规则，运维成本较高。在校园部署场景下，直接看 `/metrics` 原始指标 + 日志定位问题，效率已足够。

---

<div align="center">

_最后更新：2026-03-27 | commit `ca18a43` → 上传全链路根治版_

**仓库：[https://github.com/March030303/KnowledgeRAG-GZHU](https://github.com/March030303/KnowledgeRAG-GZHU)**

</div>

---

## 15. Contributors

thanks to all contributors!

<table>
  <tr>
    <td align="center" valign="top">
      <a href="https://github.com/Zhongye1">
        <img src="https://avatars.githubusercontent.com/u/145737758?v=4" width="80" /><br/>
        <strong>Franka</strong><br/>
        <em>@Zhongye1</em><br/>
        💻 code · 📖 docs
      </a>
    </td>
    <td align="center" valign="top">
      <a href="https://github.com/ourcx">
        <img src="https://avatars.githubusercontent.com/u/173872687?v=4" width="80" /><br/>
        <strong>褚喧</strong><br/>
        <em>@ourcx</em><br/>
        💻 code
      </a>
    </td>
    <td align="center" valign="top">
      <a href="https://github.com/GZLns">
        <img src="https://avatars.githubusercontent.com/u/237949703?v=4" width="80" /><br/>
        <strong>GZLns</strong><br/>
        <em>@GZLns</em><br/>
        💻 code · 📖 docs
      </a>
    </td>
    <td align="center" valign="top">
      <a href="https://github.com/xingjiu">
        <img src="https://avatars.githubusercontent.com/u/223476185?v=4" width="80" /><br/>
        <strong>xingjiu</strong><br/>
        <em>@xingjiu</em><br/>
        💻 code
      </a>
    </td>
  </tr>
</table>
