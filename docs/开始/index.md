# 快速上手

欢迎使用 KnowledgeRAG 知识管理系统！本指南将帮助你快速了解和使用系统。

## 什么是 KnowledgeRAG？

KnowledgeRAG 是一个基于 RAG（Retrieval Augmented Generation，检索增强生成）技术的知识管理系统，旨在帮助用户更好地管理和利用知识资源。

### 核心特性

TODO:这里要改正

- 🔍 **混合检索**：BM25 关键词 + FAISS 语义向量双路检索
- 🤖 **双模式问答**：普通 RAG + ReAct Agent 可切换
- 📊 **知识图谱**：自动提取文档实体与关系，可视化展示
- 💬 **多轮对话**：基于 Ollama 的本地对话，支持 RAG 增强
- 🔗 **URL 导入**：一键导入网页链接至知识库
- 👤 **完整用户系统**：JWT 认证、QQ 登录、邮件密码重置
- 📚 **三级权限体系**：个人 / 共享 / 广场知识库模式

## 技术栈

TODO:这里要改正

### 前端

- Vue 3.4.21 + Vite 5.2.8
- TypeScript 5.4.4
- TDesign Vue Next 组件库
- Pinia
- Vue Router

### 后端

- FastAPI 0.116.1
- LangChain + LangChain-Community
- FAISS 向量数据库
- MySQL
- Ollama LLM 接入

### 环境要求

- Node.js 22
- Python >= 3.10
- MySQL >= 8.0
- Ollama（可选，用于本地 LLM 推理）

## 启动项目

TODO:这里要补充

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

---

### 方式三：手动启动

1. 启动 MySQL（Docker）

```
docker run -d --name ragf-mysql -e MYSQL_ROOT_PASSWORD=yourpw -p 3306:3306 mysql:9.6
```

2. 后端

```
cd RagBackend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

3. 前端

```
cd RagFrontend
npm install
npm run dev # → http://localhost:5173
```

---

## 下一步

- 了解 [项目功能](/guide/项目功能说明)
- 查看 [系统架构](/guide/系统架构说明)
- 阅读 [API 文档](/API_reference/api/)
