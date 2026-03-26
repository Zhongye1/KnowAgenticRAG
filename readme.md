<div align="center">

# RAG-F · 智能知识管理平台

**基于检索增强生成（RAG）的私有知识库问答系统**

[![Vue3](https://img.shields.io/badge/Vue-3.x-42b883?logo=vue.js)](https://vuejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?logo=docker)](https://docs.docker.com/compose/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

[功能全览](README-FEATURES.md) · [快速启动](#-快速启动) · [API 文档](http://localhost:8000/docs) · [移动端 App](#-移动端-app)

</div>

---

## 📖 项目简介

**RAG-F** 是一套面向个人与团队的智能知识管理平台，通过将私有文档与本地/云端大语言模型深度结合，实现**检索增强生成（RAG）**问答，显著降低 AI 幻觉、提升领域知识回答的准确性。

**核心价值：**
- 🧠 **防幻觉问答** — 答案严格基于你的文档，来源可追溯
- 📚 **统一知识管理** — 多格式文档、URL 批量导入、权限分级
- 🤖 **Agent 任务模式** — ReAct 框架，自然语言驱动多步骤任务
- 🔗 **办公联动** — Obsidian / 飞书 / 钉钉 / 企微 / Notion / GitHub
- 📱 **双端支持** — Web + React Native 移动端 App
- 🚀 **本地部署** — 数据不离本地，一键 Docker 启动

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────┐
│               客户端层                        │
│  Web 前端  Vue3 + Vite + TDesign             │
│  移动端    React Native + Expo SDK 53         │
└──────────────────┬──────────────────────────┘
                   │ HTTP / SSE
┌──────────────────▼──────────────────────────┐
│               服务层（FastAPI）               │
│  用户认证 · 知识库管理 · RAG Pipeline v3      │
│  ReAct Agent · 多模型路由 · Whisper ASR       │
│  增量向量化 · 联网搜索 · 开放 API · 审计日志  │
│  Obsidian同步 · 飞书/钉钉/企微机器人          │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│               存储层                          │
│  MySQL（用户数据）· 向量数据库 · SQLite（审计）│
│  本地文件系统 · OSS/S3（对象存储）             │
└─────────────────────────────────────────────┘
```

| 层级 | 技术选型 |
|------|---------|
| 前端框架 | Vue 3 + TypeScript + Vite 5 |
| UI 组件库 | TDesign Vue Next |
| 后端框架 | FastAPI + uvicorn |
| LLM 框架 | LangChain |
| 本地模型 | Ollama（推荐 `qwen2:0.5b`，低配友好） |
| 关系数据库 | MySQL 9.6（Docker 托管） |
| 移动端 | React Native + Expo SDK 53 + zustand |
| 容器化 | Docker + Docker Compose |
| 语音识别 | OpenAI Whisper（本地） |

---

## ✨ 功能亮点

### 🗂️ 知识库管理
- 多格式支持：PDF / Word / TXT / Markdown / Excel / 图片
- URL 批量导入，自动抓取并向量化
- 📌 **置顶功能**：知识库 / 文件 / 模型 / 历史记录一键置顶
- ⭐ 星标收藏 + 拖拽排序（localStorage 持久化）
- 三级权限体系：个人 → 共享（分享链接）→ 广场（公开发现）

### 💬 RAG 智能问答
- SSE 流式输出，实时打字机效果
- 🔍 **引用溯源气泡**：AI 回答标注来源，点击展开原文
- 5 种检索策略：Vector / BM25 / Hybrid / RRF / MMR
- RAG 模式开关 + 知识库选择器

### 🤖 Agent 任务模式
- 自然语言输入，ReAct 框架自主分解任务
- 步骤可视化（Thought → Action → Observation）
- 工具链：知识库检索 / DuckDuckGo 联网搜索 / 代码执行
- 任务历史持久化，按日期分组

### 🎙️ 语音交互
- 麦克风录音 → Whisper ASR 转录 → 直接发问
- 降级策略：后端不可用时自动切换 Web Speech API

### ⚙️ 系统设置（Win11 风格）
- 左侧分组导航 + 右侧内容区，仿 Win11 设置页
- 12 个功能 Tab：通用 / 外观 / 模型 / 知识库 / 办公联动 / 安全 / 审计 / ...
- 办公联动 6 平台网格（Obsidian / 飞书 / 钉钉 / 企微 / Notion / GitHub）

### ✨ 全局交互动效
- 页面切换过渡（`<Transition name="page">`）
- 按钮 hover 光晕 / active 缩放
- 卡片悬浮阴影 / 骨架屏 shimmer
- 支持 `prefers-reduced-motion` 无障碍

### 🌐 多模型适配
| 类型 | 模型 |
|------|------|
| 本地 | Ollama qwen2:0.5b（推荐低配，仅需 600MB 内存） |
| 本地 | Ollama qwen:7b-chat（需 17GB+ 内存） |
| 云端 | OpenAI GPT-4 / DeepSeek / 腾讯混元 |

---

## 🚀 快速启动

### 环境前置要求

1. **安装 Ollama**：[https://ollama.com](https://ollama.com)
2. **拉取推荐模型**（低配机器）：
   ```bash
   ollama pull qwen2:0.5b    # ~400MB，仅需 600MB 内存
   ```
3. **硬件最低要求**（运行 qwen2:0.5b）：

   | 组件 | 最低要求 |
   |------|---------|
   | 内存（RAM） | 4GB |
   | 存储空间 | 5GB |
   | GPU | 可选（CPU 也可运行小模型） |

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
# 后端 API：    http://localhost:8000
# API 文档：    http://localhost:8000/docs
```

> **智能跳过**：脚本自动检测已运行的服务，二次调用几乎瞬间完成。

---

### 方式三：手动启动

```bash
# 1. 启动 MySQL（Docker）
docker run -d --name ragf-mysql -e MYSQL_ROOT_PASSWORD=yourpw -p 3306:3306 mysql:9.6

# 2. 后端
cd RagBackend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 3. 前端
cd RagFrontend
npm install
npm run dev   # → http://localhost:5173
```

---

## 📱 移动端 App

**位置：** `KnowledgeRAG-GZHU/RagMobile/`

```bash
# 本地开发（需配置 EXPO_PUBLIC_API_URL）
cd RagMobile
npm install
npx expo start

# 打包 APK（EAS Cloud Build）
npm install -g eas-cli
eas login              # 账号: gzlns
eas build -p android --profile preview   # 输出 APK
```

覆盖功能：登录注册 / 知识库管理 / RAG 对话（SSE 流式）/ Agent 任务 / 语音输入 / 设置

---

## 📁 目录结构

```
KnowledgeRAG-GZHU/
├── RagFrontend/                  # Vue3 前端
│   ├── src/
│   │   ├── views/               # 页面组件
│   │   │   ├── KnowledgePages/  # 知识库列表/详情/设置
│   │   │   ├── Chat.vue         # RAG 智能问答
│   │   │   ├── Agent.vue        # Agent 任务模式
│   │   │   ├── History.vue      # 历史记录聚合
│   │   │   └── Settings.vue     # 系统设置（Win11 风格）
│   │   ├── components/
│   │   │   ├── SideBar.vue      # 左侧折叠导航
│   │   │   ├── GlobalSearch.vue # Ctrl+K 全局搜索
│   │   │   ├── VoiceInput.vue   # 语音输入
│   │   │   ├── ModelSelector.vue
│   │   │   ├── RetrievalConfig.vue
│   │   │   └── SettingsTabs/    # 12 个设置子 Tab 组件
│   │   ├── styles/
│   │   │   └── animations.css   # 全局交互动效
│   │   └── i18n/index.ts        # 中英双语
│   ├── Dockerfile
│   └── nginx.conf
│
├── RagBackend/                   # FastAPI 后端
│   ├── main.py                  # 入口
│   ├── RAGF_User_Management/    # 用户认证（JWT + MySQL）
│   ├── RAG_M/src/
│   │   ├── rag/rag_pipeline.py  # RAG Pipeline v3
│   │   └── agent/react_agent.py # ReAct Agent
│   ├── document_processing/     # 增量向量化 + 检索策略
│   ├── multi_model/             # 多模型 SSE 路由
│   ├── multimodal/              # Whisper 语音识别
│   ├── agent_tools/             # DuckDuckGo 联网搜索
│   ├── integrations/            # Obsidian / 飞书 / 钉钉 / 企微
│   ├── data_sources/            # OSS/S3/MySQL/PG/SQLite 数据源
│   ├── open_api/                # API Key 管理
│   ├── audit/                   # ASGI 审计日志中间件
│   ├── feedback/                # 反馈邮件
│   └── .env                     # 环境变量
│
├── RagMobile/                    # React Native 移动端
├── dev.ps1                       # 一键开发启动脚本
└── docker-compose.yml            # 容器编排
```

---

## 🔧 环境变量说明

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

# 飞书 / 钉钉 / 企微集成（可选）
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=xxx
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx

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

## ❓ 常见问题 FAQ

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

> 📖 更多功能详细说明请查看 [README-FEATURES.md](README-FEATURES.md)

---

## 👥 Contributors

<table>
  <tr>
    <td align="center" valign="top">
      <a href="https://github.com/Zhongye1">
        <img src="https://avatars.githubusercontent.com/u/145737758?v=4" width="80" /><br/>
        <strong>Rosmontis</strong><br/>
        <em>@Zhongye1</em><br/>
        💻 代码 · 📖 文档
      </a>
    </td>
    <td align="center" valign="top">
      <a href="https://github.com/ourcx">
        <img src="https://avatars.githubusercontent.com/u/173872687?v=4" width="80" /><br/>
        <strong>褚喧</strong><br/>
        <em>@ourcx</em><br/>
        💻 贡献中
      </a>
    </td>
    <td align="center" valign="top">
      <a href="https://github.com/haha-1205">
        <img src="https://avatars.githubusercontent.com/u/222571036?v=4" width="80" /><br/>
        <strong>ZXT</strong><br/>
        <em>@haha-1205</em><br/>
        💻 贡献
      </a>
    </td>
    <td align="center" valign="top">
      <a href="https://github.com/z1pperexplorer">
        <img src="https://avatars.githubusercontent.com/u/222624613?v=4" width="80" /><br/>
        <strong>A1r</strong><br/>
        <em>@z1pperexplorer</em><br/>
        💻 Contributing
      </a>
    </td>
  </tr>
</table>

---

## 🗺️ 后续规划

- [x] 用户认证与权限管理
- [x] 多模型支持与参数配置
- [x] 多格式文档处理（PDF/Word/Excel/图片）
- [x] 知识库 CRUD + 多维检索
- [x] Docker 一键部署
- [x] Agent 任务模式（ReAct）
- [x] 移动端 App（React Native）
- [x] 语音输入（Whisper ASR）
- [x] 置顶 / 拖拽排序 / 全局动效
- [x] Win11 风格系统设置
- [x] 办公联动（Obsidian/飞书/钉钉/企微/Notion/GitHub）
- [ ] 文档协作（多人实时编辑）
- [ ] 知识图谱可视化增强
- [ ] 企业 SSO 登录（LDAP/SAML）

---

<div align="center">

*最后更新：2026-03-26 | commit `b8cfb35`*

**仓库：[https://github.com/March030303/KnowledgeRAG-GZHU](https://github.com/March030303/KnowledgeRAG-GZHU)**

</div>
