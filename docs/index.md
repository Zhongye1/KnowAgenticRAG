---
layout: home

title: KnowledgeRAG
titleTemplate: 知识管理系统

hero:
    name: KnowledgeRAG
    text: 知识管理系统
    tagline: 一个基于RAG的知识库平台
    actions:
        - theme: brand
          text: 快速上手
          link: /guide
        - theme: alt
          text: 查看源码
          link: https://github.com/Zhongye1/KnowledgeRAG-GZHU
---

## 功能特性

**基于检索增强生成（RAG）的私有知识库问答系统**

<div class="badges-container" style="display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0;">
  <img src="https://img.shields.io/badge/Vue-3.x-42b883?logo=vue.js&logoColor=white" alt="Vue 3" style="height: 24px;">
  <img src="https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi&logoColor=white" alt="FastAPI" style="height: 24px;">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white" alt="TypeScript" style="height: 24px;">
  <img src="https://img.shields.io/badge/Python-3.11-3776ab?logo=python&logoColor=white" alt="Python" style="height: 24px;">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ed?logo=docker&logoColor=white" alt="Docker Compose" style="height: 24px;">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License MIT" style="height: 24px;">
  <img src="https://img.shields.io/badge/Commit-59ffcfe-brightgreen" alt="Latest Commit" style="height: 24px;">
</div>

---

### 系统简介

**KnowledgeRAG-GZHU** 是一个面向智能知识管理的检索增强生成（RAG）系统，集成文档解析、知识库管理、知识图谱生成、向量检索、Ollama模型服务及智能问答核心功能。前端基于 **Vue3 + TypeScript** 构建交互框架，实现知识组织与问答可视化；后端采用 **FastAPI** 架构提供高性能服务支持。该系统通过本地知识库与大语言模型协同推理，显著缓解大模型幻觉问题，提升领域知识问答的精确性与可靠性。

### 核心优势

- 🧠 **防幻觉问答** — 答案严格基于你的文档，来源可追溯
- 📚 **统一知识管理** — 多格式文档、URL 批量导入、权限分级
- 🤖 **Agent 任务模式** — ReAct 框架，自然语言驱动多步骤任务
- ✍️ **文档创作** — 5 种模式 SSE 流式生成（报告/摘要/大纲/博客/论文）
- 🔗 **办公联动** — Obsidian / 飞书 / 钉钉 / 企微 / Notion / GitHub
- 📱 **双端支持** — Web + React Native 移动端 App
- 🗺️ **系统架构图** — 可视化 4-Tab 架构展示（技术栈/数据流/部署/模块）
- 🚀 **本地部署** — 数据不离本地，一键 Docker 启动

### 快速开始

1. **克隆项目**

    ```bash
    git clone https://github.com/Zhongye1/KnowledgeRAG-GZHU.git
    ```

2. **安装依赖并启动**

    ```bash
    # 进入项目目录
    cd KnowledgeRAG-GZHU

    # 使用 Docker Compose 启动
    docker-compose up -d
    ```

3. **开始使用**
   访问 `http://localhost:8080` 即可开始使用 KnowledgeRAG 系统。

### 核心功能模块

| 模块       | 功能       | 描述                                                               |
| ---------- | ---------- | ------------------------------------------------------------------ |
| 文档处理   | 解析与上传 | 支持多种文档格式（PDF, Word, Excel, Markdown等）批量上传与自动解析 |
| 知识库管理 | 存储与检索 | 基于向量数据库的高效相似度检索，支持知识库分类与权限管理           |
| RAG引擎    | 智能问答   | 结合文档内容与大语言模型，提供准确的回答和信息提取                 |
| Agent系统  | 自动任务   | 基于ReAct框架的智能体，执行复杂查询和分析任务                      |
| 文档创作   | 内容生成   | 提供报告、摘要、大纲、博客等多种创作模式                           |
| API接口    | 第三方集成 | 开放的API接口，便于与其他系统集成                                  |

### 技术架构

KnowledgeRAG-GZHU 采用前后端分离架构：

- **前端**: Vue3 + TypeScript + Vite，提供响应式用户界面
- **后端**: FastAPI + Python，高性能API服务
- **数据库**: MySQL（元数据）+ 向量数据库（嵌入表示）
- **文档处理**: 支持多种格式的解析器
- **AI模型**: 兼容Ollama，支持多种开源大语言模型

### 社区支持

- 🐛 **问题反馈**: [Issues](https://github.com/Zhongye1/KnowledgeRAG-GZHU/issues)
- 💬 **讨论交流**: [Discussions](https://github.com/Zhongye1/KnowledgeRAG-GZHU/discussions)
- 📖 **文档中心**: 完整的使用文档和开发指南
- 🤝 **贡献代码**: 欢迎提交 PR，共同完善项目
