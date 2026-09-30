# 项目简介

ARS（语析）是一个知识库、知识图谱与 Agent 开发平台，基于 LangGraph、Vue 3、FastAPI、Milvus 和 Neo4j 构建。平台提供智能体编排、知识检索、图谱检索、工具调用和文件系统能力。

## 设计理念

项目遵循以下设计原则：

- **技术栈简洁**：选择主流且成熟的技术，降低学习和维护成本
- **MIT 开源协议**：完全开源，允许自由使用和二次开发
- **容器化部署**：通过 Docker Compose 管理，简化部署流程

## 技术架构

| 层级 | 技术 | 用途 |
|------|------|------|
| 前端 | Vue.js 3, Vite, Ant Design Vue | 前端应用构建、路由与组件库 |
| 状态管理 | Pinia | 前端集中式状态管理 |
| 后端 API | FastAPI, Uvicorn | 异步 HTTP API 与 ASGI 服务 |
| Agent 框架 | LangGraph | Agent 编排、状态管理与 checkpoint |
| 知识库 | Milvus（可建库入库）、Dify / Notion（只读连接器） | 向量知识库 RAG 与外部只读数据源检索 |
| 图数据库 | Neo4j | Milvus 知识库内知识图谱存储与查询 |
| 文档处理 | MinerU, PaddleX, RapidOCR | 多格式文档解析与 OCR |
| 任务队列 | Redis, PostgreSQL Workers | 异步任务处理 |
| 对象存储 | MinIO | 文件与文档存储 |
| 关系型数据库 | PostgreSQL | 元数据与用户数据持久化 |
| 部署 | Docker, Docker Compose | 容器化部署与编排 |


## 核心能力

ARS 在同一运行时中组合智能体开发、知识库/RAG 和知识图谱能力。

### 1. 可配置的智能体开发

ARS 基于 LangGraph 运行 Agent。开发者可以为同一个 Agent 配置模型、提示词、工具、MCP、Skills、子智能体与中间件，并将模型调用编排为业务流程。

Agent 配置决定模型调用工具、访问知识、接入文件系统和调用子智能体的方式。

### 2. 知识库与 RAG 一体化能力

ARS 提供覆盖上传、解析、分块、向量化、检索配置和评估的知识入库链路。处理完成的文档成为 Agent 可直接调用的知识来源。

知识库支持 PDF、Office、Markdown 和图片等文档。检索结果包含命中文本及来源标识，Agent 可以按 `file_id` 继续打开或定位原文。


### 3. 知识图谱检索与展示

知识图谱与 Milvus 知识库入库链路联动。系统从已入库 chunks 中抽取实体和关系，将图数据写入 Neo4j 与 PostgreSQL，并为唯一实体和三元组建立 Milvus 语义索引。检索阶段召回图谱实体与三元组，通过 RRF 与 chunk 命中结果融合；知识库详情页同时提供子图展示与检索。

### 4. 文档处理与平台管理

ARS 集成 MinerU、PP-Structure-V3、RapidOCR、DeepSeek OCR 等解析能力，处理 PDF、Office、Markdown 和图片等常见格式。

平台同时提供以下管理能力：

- 部门与权限管理
- 内容审查与守卫能力
- 文件管理与任务管理
- Docker Compose 部署与热重载开发


## 适用场景

ARS 适用于以下场景：

- **企业知识库**：构建私有知识问答系统
- **智能客服**：基于文档的自动问答
- **知识管理**：文档自动解析、分类、构建图谱
- **AI 应用开发**：组合模型、工具和知识库，验证大模型应用流程

## 下一步

- 快速开始：阅读 [快速开始指南](./quick-start.md)
- 模型配置：阅读 [模型配置](./model-config.md)
- 知识库使用：阅读 [知识库与知识图谱](./knowledge-base.md)
- 智能体开发：阅读 [智能体开发](../agents/agents-config.md)
