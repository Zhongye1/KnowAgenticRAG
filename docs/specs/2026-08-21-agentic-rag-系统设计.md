---
title: Agentic RAG 系统设计
description: Agent 层 + RAG 层（检索/生成）系统设计 spec：知识库、文档入库、混合检索、流式生成与 ReAct 编排
---

# Agentic RAG 系统设计（Spec）

## 0. 文档信息

| 项 | 内容 |
| --- | --- |
| 状态 | 已评审，待实现 |
| 日期 | 2026-08-21 |
| 范围 | 设计文档（spec），不含实现代码 |
| 技术基线 | fba（FastAPI Best Architecture）+ PostgreSQL 16 + Redis + Celery |

## 1. 背景与目标

### 1.1 背景

项目当前为 fba 架构后端（`backend/src/app/{admin,task}` + 插件体系），具备完整的认证授权、数据库、异步任务与可观测性能力，但**没有任何 RAG / 向量 / LLM 相关能力**。本 spec 定义一套 Agentic RAG 子系统：

- **Agent 层**：自主编排者（ReAct 风格：规划 → 多步检索/工具调用 → 归纳生成）
- **RAG 层**：细分为**检索层**（知识向量化、语义召回、混合检索、重排）与**生成层**（上下文整合、Prompt 引导、LLM 生成）

### 1.2 目标

1. 知识库 CRUD 与文档上传解析（异步）的完整入库链路
2. 检索层：Embedding 向量化 + Milvus 相似度检索（混合检索 + 重排）
3. 生成层：上下文整合 + DeepSeek（OpenAI 兼容协议）可控生成 + 引用溯源 + 流式输出
4. Agent 层：ReAct 编排，自主规划多步检索与工具调用
5. 前端页面：知识库管理、文档管理、对话问答（流式 + 引用）
6. 全部按 fba 惯例落地（model/schema/crud/service/api 五层 + 异步任务 + 认证权限）

### 1.3 非目标

- 不做模型训练 / 微调 / 评测
- 不做多租户级数据隔离（单租户内 RBAC，租户化后置）
- 不做移动端
- 不做知识图谱（可作为后续增强，不在本 spec 范围）

## 2. 术语

| 术语 | 说明 |
| --- | --- |
| Chunk | 文档切片，检索与生成的最小单元，存原文与偏移 |
| Embedding | 文本向量化（云端 Embedding API） |
| Collection | Milvus 中的向量集合（相当于 PG 的表） |
| ReAct | Reasoning + Acting：Agent 推理-行动-观察循环 |
| RRF | Reciprocal Rank Fusion，多路召回结果融合 |
| Rerank | 重排模型，对召回结果二次精排 |
| SSE | Server-Sent Events，流式返回协议 |
| Function Calling | OpenAI 兼容的工具调用协议（Agent 行动载体） |

## 3. 总体架构

### 3.1 两层架构

```text
┌─ Agent 层（自主编排）────────────────────────────────┐
│  Agent Core（ReAct 循环：规划 → 行动 → 观察 → 归纳）    │
│  工具集：知识库检索 / 元数据过滤 / 库清单 / 文档定位      │
└──────────────────┬───────────────────────────────────┘
┌─ RAG 层 ─────────┴───────────────────────────────────┐
│  检索层：查询改写 → Embedding → Milvus 混合检索 → 重排  │
│  生成层：上下文压缩/组装 → Prompt 编排 → LLM 流式生成    │
│          （含引用溯源）                                 │
└──────────────────┬───────────────────────────────────┘
┌─ 基础设施 ────────┴───────────────────────────────────┐
│  Milvus（向量） + PostgreSQL 16（业务/元数据/原文）      │
│  Redis（缓存/会话/队列） + Celery（异步任务链）          │
│  模型：DeepSeek API（OpenAI 兼容）+ 云端 Embedding API  │
└──────────────────────────────────────────────────────┘
```

### 3.2 分层职责

| 层 | 职责 | 依赖 |
| --- | --- | --- |
| Agent 层 | 会话管理、ReAct 编排、工具调用、成本控制 | RAG 层（检索/生成）、模型客户端 |
| RAG 检索层 | 查询改写、Embedding、混合检索、重排、引用 | Milvus、Embedding API、PG 元数据 |
| RAG 生成层 | Prompt 组装、上下文压缩、LLM 调用（流式） | 模型客户端、检索结果 |
| 基础层 | 存储、异步任务、缓存、可观测性 | 现有 fba 基础设施 |

### 3.3 技术选型

| 组件 | 选型 | 理由 |
| --- | --- | --- |
| LLM | DeepSeek API（OpenAI 兼容协议） | 用户指定；协议统一，可平替其他兼容服务 |
| Embedding | 云端 Embedding API（OpenAI 兼容端点） | 用户指定；维度/批量参数化 |
| 向量库 | Milvus（standalone） | 用户指定；支持稠密+稀疏混合检索 |
| 业务库 | PostgreSQL 16（现有） | 元数据、原文、会话、任务状态 |
| 异步 | Celery（现有 worker/beat） | 解析/切片/向量化任务链 |
| 流式 | SSE（`text/event-stream`） | 轻量、单向、易对接前端 |

## 4. 模块划分与目录结构

按 fba 惯例拆分为 `backend/src/app/` 下的业务模块组，每个模块五层（model/schema/crud/service/api）：

```text
backend/src/app/
├── knowledge/    # 知识库 CRUD（业务元数据）
├── document/     # 文档上传/解析/切片/向量化（异步状态机）
├── retrieval/    # 检索层：Embedding、Milvus 检索、重排
├── generation/   # 生成层：Prompt 组装、上下文压缩、SSE 流式
└── agent/        # Agent 层：ReAct 编排、工具注册、会话管理
```

| 模块 | 职责 | 关键依赖 | 路由前缀 | 权限码域 |
| --- | --- | --- | --- | --- |
| `knowledge` | 知识库 CRUD、集合元数据 | PG | `/api/v1/knowledge-bases` | `knowledge:*` |
| `document` | 上传、状态机、任务链触发 | PG、Celery、Milvus | `/api/v1/documents` | `document:*` |
| `retrieval` | 检索服务（供 agent/chat 内部调用 + `/search` API） | Milvus、Embedding | `/api/v1/search` | `rag:search` |
| `generation` | Prompt 编排、LLM 调用、SSE | 模型客户端 | `/api/v1/chat` | `rag:chat` |
| `agent` | ReAct 循环、工具、会话 | retrieval/generation | `/api/v1/agents` | `agent:*` |

模块间调用约定：`agent` → `retrieval/generation` 的 **service 层直接调用**（内部接口），不经过 HTTP；对外统一由各自 `api` 暴露。

## 5. 数据模型（PostgreSQL）

统一继承 fba `Base`（`id_key` 雪花主键、审计列、逻辑删除）。

### 5.1 `knowledge_base` — 知识库

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | BigInteger PK | 雪花 ID |
| `name` | String(64) | 名称，唯一（含 deleted） |
| `description` | Text | 描述 |
| `embedding_model` | String(64) | 该库使用的 Embedding 模型标识 |
| `status` | Int | 0 停用 / 1 正常 |
| `(审计列)` | — | `created_by/created_time/updated_time/deleted/deleted_time` |

### 5.2 `document` — 文档

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | BigInteger PK | 雪花 ID |
| `knowledge_base_id` | BigInteger | 逻辑外键 → 知识库 |
| `filename` | String(256) | 原始文件名 |
| `storage_path` | String(512) | 对象/本地存储路径 |
| `file_type` | String(32) | pdf / docx / md / txt |
| `file_size` | BigInteger | 字节 |
| `status` | Int | 状态机：0 待处理 / 1 解析中 / 2 切片中 / 3 索引中 / 4 就绪 / 5 失败 |
| `error_msg` | Text | 失败原因 |
| `chunk_count` | Int | 切片数 |
| `(审计列)` | — | — |

状态机：`待处理 → 解析中 → 切片中 → 索引中 → 就绪`；任一步失败 → `失败`（可重试回待处理）。

### 5.3 `document_chunk` — 切片（原文，供引用溯源）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | BigInteger PK | 雪花 ID |
| `document_id` | BigInteger | 逻辑外键 |
| `knowledge_base_id` | BigInteger | 冗余，检索过滤 |
| `chunk_index` | Int | 文档内序号 |
| `content` | UniversalText | 切片原文 |
| `token_count` | Int | token 估算 |
| `page_no` / `start_offset` / `end_offset` | Int | 定位信息（展示引用时高亮） |
| `(审计列)` | — | — |

> PG 不存向量；向量存 Milvus（第 6 节）。`document_chunk.id` 即 Milvus 的 `chunk_id`，双写关联。

### 5.4 `conversation` / `message` — 会话与消息

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| `conversation` | `id/name/user_id/status` | 会话（按用户隔离） |
| `message` | `id/conversation_id/role/content/references/agent_trace/token_usage/elapsed_ms` | 消息；`references` 存 JSON（chunk_id 列表 + 摘要），`agent_trace` 存 ReAct 步骤摘要（可选，JSON） |

### 5.5 `agent_run` / `agent_tool_call`（可选，审计与调试）

| 表 | 说明 |
| --- | --- |
| `agent_run` | 一次 Agent 会话运行：开始/结束时间、步数、token 消耗、结果状态 |
| `agent_tool_call` | 每次工具调用：工具名、参数、结果摘要、耗时 |

> 可选实现：先记录到日志 + `message.agent_trace`，表结构预留。

## 6. Milvus 设计

### 6.1 Collection：`rag_chunk`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | Int64 主键 | = `document_chunk.id`（与 PG 一致） |
| `knowledge_id` | Int64 标量 | 检索必过滤 |
| `document_id` | Int64 标量 | 检索/引用 |
| `chunk_index` | Int64 标量 | 排序/展示 |
| `dense_vector` | FloatVector(dim) | Embedding 向量，dim 按模型参数化 |
| `sparse_vector` | SparseFloatVector（可选） | BM25 语义稀疏向量；若云端 API 不支持则关闭（可配置） |

- **索引**：稠密 `HNSW`（M=16, efConstruction=200）；稀疏 `SPARSE_INVERTED_INDEX`（开启时）
- **分区**：按 `knowledge_id` 哈希分区（可选，量大时开启）
- **一致性**：写入走「先 PG 后 Milvus」+ Celery 任务补偿（失败重试）；删除同理（PG 逻辑删除 + Milvus 按 `document_id` 级联 delete）
- **别名**：`rag_chunk` 为生产别名，重建索引时切别名避免停机

### 6.2 双写一致性策略

| 场景 | 策略 |
| --- | --- |
| 入库 | Celery 任务：PG 落 `document_chunk` → 批量 Embedding → Milvus upsert → 更新文档状态 |
| 失败 | 任务重试（现有 `TaskBase` SQLAlchemyError 自动重试）；达到上限标记文档失败，清理已写向量 |
| 删除文档 | PG 逻辑删除 + Celery 删除 Milvus 对应 `document_id` 数据 |
| 补偿 | 定时任务（beat）扫描「状态=索引中 且 超时」的文档，对账 Milvus 与 PG |

## 7. 异步任务链（Celery）

文档处理状态机与任务链（`app/document` + `app/task` 协同）：

```text
上传（API）→ 任务: parse（解析文本）→ task: chunk（切片）
         → task: embed_batch（批量 Embedding）→ task: milvus_upsert → 状态=就绪
```

| 任务 | 说明 | 幂等/重试 |
| --- | --- | --- |
| `rag_document_parse` | 按 `file_type` 解析（pdf/docx/md/txt），提取纯文本 | 按 document_id 幂等；失败可重试 |
| `rag_document_chunk` | 段落优先 + 固定窗口重叠切片，写 `document_chunk` | 重复执行前清旧切片 |
| `rag_chunk_embed_batch` | 分批调 Embedding API（batch=32，控制成本/限流） | 按 chunk 集合去重 |
| `rag_milvus_upsert` | 批量 upsert + 更新文档状态 | 幂等 upsert |

切片策略（配置化）：

- 策略：**段落优先**，超长段落按固定窗口切分（默认 `CHUNK_SIZE=500` token、`CHUNK_OVERLAP=50`）
- 元数据：每片记录 `page_no/offset`，支撑引用高亮

## 8. 检索层设计（`app/retrieval`）

### 8.1 检索流程

```text
query
  → 查询改写（可选，Agent 触发：扩展/消歧）
  → Embedding（同一模型）
  → Milvus 混合检索：dense(top_k) + sparse(top_k)
  → RRF 融合 → 候选集
  → Rerank 精排（可选，默认开启，top_n 输出）
  → 返回：chunk_id / 原文 / 得分 / 知识库与文档定位（references）
```

### 8.2 服务接口（service 层，供 agent/chat 内部调用）

```python
async def search(*, query, knowledge_base_ids, top_k, enable_rerank=True, filters=None) -> SearchResult
```

- 强制过滤 `knowledge_id`（防跨库泄漏）
- 结果统一为 `SearchResult`（chunk 列表 + 元数据），供生成层组装与前端引用

### 8.3 配置

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `RAG_SEARCH_TOP_K` | 10 | 召回数 |
| `RAG_RERANK_TOP_N` | 4 | 重排后送入生成的数量 |
| `RAG_ENABLE_RERANK` | true | 重排开关 |
| `RAG_EMBEDDING_BATCH_SIZE` | 32 | Embedding 批量 |

## 9. 生成层设计（`app/generation`）

### 9.1 流程

```text
检索结果 + 用户问题 + 会话历史
  → 上下文压缩（token 预算裁剪，保留引用）
  → Prompt 组装（system 指令 + 上下文块 + 问题 + 历史）
  → LLM 调用（OpenAI 兼容 /chat/completions，stream=true）
  → SSE 流式输出（delta / done / error / references 事件）
  → 消息落库（references + token 用量）
```

### 9.2 Prompt 编排

- system 模板（可配置，含「仅依据给定上下文回答、无法回答时明确说明、引用格式」等指令）
- 上下文块格式：`【片段N】（来源：知识库/文档）内容...`，要求 LLM 回答时引用片段编号
- 历史：近 N 轮（`RAG_CHAT_HISTORY_ROUNDS`，默认 10）截断

### 9.3 SSE 协议

`POST /api/v1/chat/stream`（`text/event-stream`）：

| 事件 | 数据 | 说明 |
| --- | --- | --- |
| `start` | `{message_id, conversation_id}` | 开始 |
| `delta` | `{content}` | 增量文本 |
| `references` | `{chunks: [...]}` | 引用（可在首个 delta 前或 done 前发送） |
| `agent_trace` | `{step, tool, summary}` | Agent 步骤（agent 模式） |
| `done` | `{token_usage}` | 结束 |
| `error` | `{code, msg}` | 异常（含 trace_id） |

> SSE 为独立协议，不套用 `ResponseModel` 统一格式（与现有路由层约定一致，见 [路由层设计](../工程治理/路由层设计.md)）。

### 9.4 引用溯源

- 生成层输出 `references`：`chunk_id → {document_id, knowledge_id, 原文摘要, page_no}`，由 `document_chunk` 反查
- 前端以引用卡片展示并支持点击定位

## 10. Agent 层设计（`app/agent`）

### 10.1 ReAct 循环

```text
用户问题
  → Agent Core 初始化（system 提示 + 会话历史 + 工具清单）
  → 循环（max_steps，默认 5）：
      ① 推理：LLM 决定「继续工具调用」还是「给出最终回答」（Function Calling）
      ② 行动：执行工具 → 观察结果回填
      ③ 若需更多信息 → 回到 ①；否则进入生成
  → 最终回答：调用生成层（或 LLM 直接基于已收集上下文回答）
  → 会话与 agent_run 落库
```

### 10.2 工具集（注册式，OpenAI Function 格式）

| 工具 | 说明 | 参数 |
| --- | --- | --- |
| `search_knowledge` | 知识库混合检索（默认工具） | `query, knowledge_base_ids, top_k` |
| `list_knowledge_bases` | 列出可用知识库 | `—` |
| `filter_by_metadata` | 按元数据过滤检索（文档/标签/时间） | `filters` |
| `get_document` | 定位并返回指定文档的切片原文 | `document_id, chunk_ids` |

- 工具注册表：`{name: ToolDefinition}`，新工具实现 `ToolDefinition.execute(query, context)`
- 工具调用通过 OpenAI 兼容 `tools` 参数下发，`tool_calls` 结果回填 `tool` role 消息

### 10.3 会话与上下文

- 会话：`conversation` / `message`（PG），短期记忆 Redis（`rag:session:{id}`，近 N 轮）
- Agent 与基础 RAG 双模式：`/chat/stream` 的请求体 `mode: agent | rag`（默认 `agent`）

### 10.4 成本与轮次控制

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `RAG_AGENT_MAX_STEPS` | 5 | ReAct 最大步数 |
| `RAG_AGENT_TIMEOUT_SECONDS` | 60 | 单次运行超时 |
| `RAG_AGENT_MAX_TOKENS` | 4096 | 单轮生成上限 |
| `RAG_CONTEXT_MAX_TOKENS` | 4096 | 上下文 token 预算 |

- 达到上限强制结束并给出「基于已检索内容」的最终回答
- 全部 token 用量记录到 `message` / `agent_run`，供成本核算

## 11. API 清单

统一前缀 `/api/v1`，认证依赖与权限码按 fba 约定（读 `DependsJwtAuth`，写 `RequestPermission + DependsRBAC`）。

### 11.1 `knowledge`（`/knowledge-bases`）

| 方法/路径 | 功能 | 权限 |
| --- | --- | --- |
| `GET /knowledge-bases` | 分页列表 | `DependsJwtAuth` |
| `GET /knowledge-bases/{pk}` | 详情 | `DependsJwtAuth` |
| `POST /knowledge-bases` | 创建 | `knowledge:add` |
| `PUT /knowledge-bases/{pk}` | 更新 | `knowledge:edit` |
| `DELETE /knowledge-bases/{pk}` | 删除（级联文档） | `knowledge:del` |

### 11.2 `document`（`/documents`）

| 方法/路径 | 功能 | 权限 |
| --- | --- | --- |
| `POST /documents/upload` | 上传文档（multipart，触发任务链） | `document:add` |
| `GET /documents` | 分页列表（按库/状态过滤） | `DependsJwtAuth` |
| `GET /documents/{pk}` | 详情（含状态/切片数） | `DependsJwtAuth` |
| `POST /documents/{pk}/retry` | 失败重试 | `document:edit` |
| `DELETE /documents/{pk}` | 删除（含 Milvus 向量） | `document:del` |

### 11.3 `retrieval`（`/search`）

| 方法/路径 | 功能 | 权限 |
| --- | --- | --- |
| `POST /search` | 检索（返回 chunks + references） | `rag:search` |

### 11.4 `generation` / `agent`（`/chat`、`/agents`）

| 方法/路径 | 功能 | 权限 |
| --- | --- | --- |
| `POST /chat/stream` | 流式问答（`mode: agent/rag`，SSE） | `rag:chat` |
| `GET /conversations`、`POST /conversations`、`DELETE /conversations/{pk}` | 会话管理 | `agent:chat` |
| `GET /conversations/{pk}/messages` | 会话历史 | `agent:chat` |
| `GET /agents/tools` | 工具清单（调试/展示） | `DependsJwtAuth` |
| `GET /agents/runs` | Agent 运行记录（可选） | `agent:audit` |

## 12. 前端页面规划

> 当前前端工程待迁移（`frontend/` 仅 Taskfile）。以下为页面与对接规划，落地于 Vue3 + TS 工程。

| 页面 | 路由 | 功能 | 对接 API |
| --- | --- | --- | --- |
| 知识库列表 | `/rag/knowledge` | 列表/创建/编辑/删除 | `/knowledge-bases` |
| 文档管理 | `/rag/knowledge/:id/documents` | 上传、状态轮询、失败重试、删除 | `/documents` |
| 对话问答 | `/rag/chat` | 会话侧栏、流式输出、引用卡片、Agent 步骤展示 | `/chat/stream`（SSE）、`/conversations` |
| 检索调试（可选） | `/rag/search` | 手动检索看召回结果 | `/search` |

- SSE 消费：`EventSource`/`fetch + ReadableStream` 解析 `delta/references/agent_trace/done/error`
- 引用卡片：点击展开原文（`document_chunk` 定位）
- 文档状态：上传后轮询或 Socket.IO 推送（现有 `task_notification` 通道可复用）

## 13. 配置项（env 新增）

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `LLM_BASE_URL` | 必填 | OpenAI 兼容端点（如 DeepSeek） |
| `LLM_API_KEY` | 必填 | API Key（部署环境变量注入） |
| `LLM_MODEL` | 必填 | 生成模型名（如 `deepseek-chat`） |
| `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` | 必填 | Embedding 云端 API |
| `EMBEDDING_DIM` | 按模型 | 向量维度 |
| `MILVUS_HOST` / `MILVUS_PORT` | 必填 | Milvus 地址 |
| `RAG_*` | 见各节 | 检索/切片/Agent 参数 |

- 密钥注入遵循 [环境变量](../工程治理/环境变量.md) 分层（`.env` 本地 / `.env.server` 部署）
- 配置字段登记到 [配置清单](../工程治理/配置清单.md)（实现时同步更新）

## 14. 安全与权限

- 全部接口走 fba 认证（`DependsJwtAuth`）+ 权限码 RBAC（见第 11 节）
- 检索强制按 `knowledge_base_ids` 过滤，服务层校验用户可访问范围
- Milvus 仅内网可达（docker network），API Key 走环境变量不落库
- Prompt 注入防护：上下文块仅展示片段内容，system 指令固化；SSE 输出做转义
- 上传文件类型/大小白名单（`DOCUMENT_ALLOWED_TYPES` / `DOCUMENT_MAX_SIZE`）

## 15. 可观测性

- 复用现有 OTEL：`openai` instrumentation 追踪 LLM/Embedding 调用；Milvus 客户端打 span（手动埋点）
- 指标：检索延迟/召回数、Embedding 批处理耗时、Agent 步数与 token 消耗、任务链成功率
- 日志：`request_id` 贯穿（SSE 流异常同样带 trace_id）
- Grafana 面板：RAG 调用量、成本估算（token × 单价，配置化单价）

## 16. 部署

### 16.1 新增基础设施（docker-compose）

| 服务 | 镜像 | 说明 |
| --- | --- | --- |
| `ragf_etcd` | `quay.io/coreos/etcd` | Milvus 元数据 |
| `ragf_minio` | `minio/minio` | Milvus 对象存储 |
| `ragf_milvus` | `milvusdb/milvus:v2.4+` | standalone，依赖 etcd/minio |

- 挂载数据卷（`ragf_etcd_data`、`ragf_minio_data`、`ragf_milvus_data`）
- 加入现有 `ragf_network`；仅内网暴露
- 落地位置：并入根 `docker-compose.yml`（或 `deploy/backend/docker-compose/` 独立编排），本地开发由 `task deps-up` 一并拉起

### 16.2 应用部署

- 新增任务队列（`rag_*` 任务）复用现有 Celery worker/beat
- 流式接口经 Nginx 需关闭代理缓冲（`proxy_buffering off`）
- Milvus 版本与客户端 `pymilvus` 锁定，纳入 `backend/pyproject.toml`

## 17. 风险与边界

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| LLM/Embedding 调用成本与限流 | 成本失控 | 批量 Embedding、Agent 步数上限、token 用量记账、单价配置化 |
| 切片质量 | 检索召回差 | 段落优先 + 窗口重叠；重排兜底；检索调试页 |
| Milvus 运维复杂度 | 部署/升级负担 | standalone + 数据卷 + 别名切换；对账补偿任务 |
| 双写一致性 | 数据漂移 | 先 PG 后 Milvus + 失败重试 + beat 对账 |
| SSE 与统一响应体系冲突 | 前端对接混乱 | SSE 独立协议约定（第 9.3 节） |
| 流式 + 长 Agent 循环 | 超时/断连 | 超时上限 + 前端重连/重试 |

## 18. 里程碑

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| M1 基础设施 | Milvus 部署、配置项、`knowledge/document` 模型与 API、上传解析入库任务链 | 上传文档后状态流转至「就绪」，PG 有切片、Milvus 有向量 |
| M2 基础 RAG | 检索层 + 生成层 + `/chat/stream`（非 Agent） | 流式问答返回带引用的回答 |
| M3 Agent 层 | ReAct 编排、工具注册、会话管理 | 多步检索/工具调用可运行，步数与成本受限 |
| M4 前端 | 知识库/文档/对话页面 | 全链路可用（上传→问答→引用） |

## 19. 相关

- [数据库层设计](../工程治理/数据库层设计.md) — 模型基座与会话注入
- [消息队列设计](../工程治理/消息队列设计.md) — 异步任务链与 Worker
- [认证授权设计](../工程治理/认证授权设计.md) — 接口认证与权限码
- [业务模块开发规范](../工程治理/业务模块开发规范.md) — 模块五层结构与权限规范
- [路由层设计](../工程治理/路由层设计.md) — SSE 与统一响应约定
