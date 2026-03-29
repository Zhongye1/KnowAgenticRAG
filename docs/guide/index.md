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
- Pinia 状态管理
- Vue Router 路由管理

### 后端

- FastAPI 0.116.1
- LangChain + LangChain-Community
- FAISS 向量数据库
- MySQL 数据存储
- Ollama LLM 接入

## 快速开始

### 环境要求

- Node.js >= 18.x
- Python >= 3.10
- MySQL >= 8.0
- Ollama（可选，用于本地 LLM 推理）

### 安装依赖

TODO:这里要补充

## 下一步

- 了解 [项目功能](/guide/项目功能说明)
- 查看 [系统架构](/guide/系统架构说明)
- 阅读 [API 文档](/API_reference/api/)
