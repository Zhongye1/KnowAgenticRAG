---
title: Agent 接入与问答闭环设计（chat 门面 + MCP 工具面 + 检索增强）
description: RAG-F 检索主干之后的最后一环：生成/问答门面（M9）、MCP 工具面（接入 Codex/Claude Code）、面向工程问答的检索增强与数据源演进，附现状基线
status: 草稿（待评审）
date: 2026-09-05
---

# Agent 接入与问答闭环设计

## 0. 文档信息

| 项         | 内容 |
| ---------- | ---- |
| 状态       | 草稿（待评审） |
| 日期       | 2026-09-05 |
| 范围       | 生成/问答门面（`app/chat`）、MCP 工具面（`app/mcp`）、检索过滤/多 KB 聚合增强；连接器与评估为演进目标 |
| 前置依赖   | ragf-design 的 M0–M8 已落地；D18/M9 chat 门面；D10 Celery 归属 |
| 联动文档   | [2026-09-02-document-versioning-spec.md](./2026-09-02-document-versioning-spec.md)、[2026-08-21-agentic-rag-系统设计.md](./2026-08-21-agentic-rag-系统设计.md)、[2026-08-25-rag-api设计与落地路线.md](./2026-08-25-rag-api设计与落地路线.md) |
| 参考实现   | Yuxi（MIT）`agents/toolkits/kbs/tools.py`、`services/chat_service.py`、`models/chat.py`、`agents/mcp/service.py`（仅借鉴契约，不移植执行栈） |
| 代码基线   | 分支 `refactor/ORCA`，fba 分层 + Celery + PostgreSQL + Redis + Milvus + MinIO |

## 1. 背景与目标

### 1.1 背景

RAG-F 面向研发场景，业务知识分散于 Wiki、文档仓库与内部系统；LLM 缺乏领域知识易幻觉，纯关键词检索无法理解语义，导致检索效率低、信息遗漏频发。设计目标是构建基于 Agent + RAG 分层的智能知识助手，并通过 MCP 协议接入 Codex / Claude Code 工程师工具链：

- Agent 端负责意图识别与 Tool Calling（宿主为 Codex / Claude Code）。
- RAG 端提供「BM25 + Dense Embedding 混合召回 + CrossEncoder 精排」两段式检索。
- 通过 MCP 暴露标准化工具接口，使 Agent 可自主跨系统检索版本差异、兼容性说明等知识，完成自动问答闭环。

### 1.2 目标

1. 补齐检索与 Agent 之间的最后一环：检索结果 + 引用上下文 → LLM 生成 → SSE/结构化返回（`app/chat`）。
2. 把检索与问答能力（只读）以 MCP 工具面暴露给 Codex / Claude Code，Agent 自主完成「列库 → 检索 → 读片段 → 带引用回答」闭环。
3. 检索侧支撑工程问答场景：元数据过滤、多 KB 聚合、版本感知，使「版本差异 / 兼容性说明」类问题可答。
4. 数据源从「文件上传」演进到「Wiki / 文档仓库 / 内部系统同步」，保证检索快照新鲜。
5. 建立最小评估集，证明检索准确率提升、信息遗漏下降。

### 1.3 非目标（本期明确不做）

- 不复制 Yuxi 的 LangGraph / ARQ / FIFO 执行栈、SubAgent / Summary middleware；宿主 Agent 承担 ReAct 循环与多轮状态。
- 不做知识图谱 / Neo4j / 多模态（Knowhere / PixelRAG）摄取。
- 不做自建 OCR 容器与本地 embedding/rerank 运行时（沿用公网 ModelScope / MinerU 通道）。
- 不做网页版聊天 UI 接入（REST/SSE 契约冻结后再另行评审前端）。
- 文档接入与管理不属于 MCP 面：文档上传/导入/同步/查看/下载/删除/版本切换由项目 Web 控制面承担（REST `/api/v1` + `frontend/src/features/knowledge/`，JWT/RBAC）；MCP 只暴露只读检索与问答工具，不含任何写、管理或全文下载类工具。

## 2. 现状（实测基线，2026-09-05）

### 2.1 已落地

| 域 | 状态与关键事实 |
| --- | --- |
| 架构底座 | fba 五层模块化单体；`backend/src/app/router.py` 已挂载 `kb / ingest / retrieval / model_provider / task / admin`；Celery + PG16 + Redis/RabbitMQ + Milvus + MinIO |
| KB 域 | 两轴多租户（`plugin_namespace` + `kb_name`）；`knowledge_bases / documents / chunks / document_keywords / document_dedup`；`version_id` / `active_version` / `chunk.meta` 预埋（版本化占位，`backend/src/app/kb/model/document.py:39`、`chunk.py:25`） |
| 摄取域 | 上传 → 解析（MinerU 公网 v4 默认 + RapidOCR 兜底 + office/md/txt/csv/图片直读，不支持 415）→ 分块 → ModelScope `bge-m3` embedding → 双写 Milvus `ragf_text_1024`（dense + BM25 sparse）+ PG `chunks`；端点 `POST ingest` / `GET status` / `POST rebuild`（`backend/src/app/ingest/api/v1/router.py`） |
| 检索域 | 同步 `POST /knowledge_bases/{kb_name}/search`；默认 hybrid = RRF(60) 召回 top20 → CrossEncoder 精排 top5（失败降级 + 指标）；PG 来源补全；参数合并 request > KB `query_params` > settings；过滤面仅 `file_name`（`backend/src/app/retrieval/schema/search_result.py`） |
| 模型域 | provider CRUD + 连通性测试 + Redis ModelCache；`select_embedding_model` / `get_reranker` 与 `providers/embed.py`、`rerank.py`；`type=chat` 与 `select_chat_model` 未实现（`backend/src/app/model_provider/`） |
| 治理 | import-linter 域契约、otel span/指标、摄取对账 beat、unit + 真实 PG/Milvus/MinIO integration、ruff/pyright |

### 2.2 明确缺口

- 生成/问答门面不存在：`backend/src/app/chat/` 仅有残留 `__pycache__`，源码未跟踪；全仓无 SSE 使用者、无 `providers/chat.py`。
- Agent 层不存在：无 `agents` / `mcp` 域、无工具注册表；`fastmcp` / `openai` SDK 未进入 `backend/pyproject.toml`。
- 工程场景支撑不足：无多 KB 聚合检索、无结构化过滤（tag/version/time/path）、版本语义未生效（`active_version` 恒 1）。
- 数据源单一：仅文件上传快照，无 Wiki / 文档仓库 / 内部系统连接器与刷新机制。
- 评估未建：无 golden set / 指标 / LLM Judge；二期 graph/eval 未启动。

## 3. 设计目标与总体架构

### 3.1 目标架构（一句话）

RAG-F 保持「同步、无状态、可重试」的知识服务层，对外暴露 REST（search 已有，chat 待补）与 MCP 工具两面；意图识别与 ReAct 循环由宿主 Agent（Codex / Claude Code）执行，RAG-F 不承担 Agent 运行态。

```text
┌─ 宿主 Agent（Codex / Claude Code）───────────────┐
│  意图识别 / ReAct 循环 / 多轮会话（Agent 自管）     │
└──────────────┬───────────────────────────────────┘
               │ MCP（stdio / Streamable HTTP）
┌──────────────┴───────────────────────────────────┐
│ RAG-F 工具面（app/mcp）                           │
│  list_knowledge_bases / search_knowledge          │
│  answer_with_citations / read_document_chunks     │
│  get_document                                     │
└──────────────┬───────────────────────────────────┘
               │ service 内直接调用（不经 HTTP）
┌──────────────┴───────────────────────────────────┐
│ RAG 层                                           │
│  chat 门面（prepare + events，SSE/结构化引用）      │
│  retrieval（hybrid 召回 + 精排 + 过滤 + 多 KB 聚合） │
│  ingest / kb / model_provider（已落地，演进）       │
└──────────────────────────────────────────────────┘
```

### 3.2 决策记录（延续 ragf-design D 编号）

| 编号 | 决策 | 理由 / 影响 |
| --- | --- | --- |
| D19 | RAG-F 只做服务面，不复制 LangGraph / ARQ / FIFO；宿主承担 ReAct 与多轮状态 | 接入目标是 Codex / Claude Code；避免重复实现运行态与 lease/SSE 复杂度 |
| D20 | MCP 传输支持 stdio（本机）与 Streamable HTTP（远程）；HTTP 默认路径可配置（`RAGF_MCP_HTTP_PATH`，默认 `/mcp`），走 JSON-RPC 不经统一 `ResponseSchemaModel`；鉴权实现见 D22/D31–D33 与 §5.5 | 与 2026-08-25 设计 §1.12 一致；Codex / Claude Code 均支持两种传输 |
| D21 | 首版工具集 5 个：`list_knowledge_bases`、`search_knowledge`、`answer_with_citations`、`read_document_chunks`、`get_document`；保留扩展位，图谱/下载工具等信号再开 | 对齐 Yuxi 7 个 KB 工具中的高价值子集，避免首版维护面过大 |
| D22 | 鉴权收敛于一个多凭证中间件（`app/mcp/auth.py`）：自家 host 走用户 JWT 直通；Codex 走 PAT + env 注入（旧版 mcp-remote 桥）；Claude Code 走原生 OAuth 2.1（Keycloak DCR 就绪后）或 PAT header；stdio 回落 = 本地桥接进程而非本地 server。三类凭证归一为同一 `UserContext(sub/tenant/scp)`，tool 层强制检查零改动 | 外部 client 凭证能力各不相同，但授权模型只有一套（既有 RBAC 权限点）；凭证差异只收敛在中间件一层 |
| D23 | chat 模型走 model_provider OpenAI 兼容通道：新增 `providers/chat.py` + `select_chat_model`，模型行 `type=chat`；默认 spec 经 `RAGF_CHAT_MODEL_SPEC`，单次请求可显式 `model` 覆盖 | 与 D16 rerank 同通道，复用 modelscope provider 行 |
| D24 | 引用契约结构化：文本以 `[n]` 标注，citation 携带 `kb_name / document_id / version_id / chunk_id / score / content`；跨版本问题需命中多版本 chunk 并保留 `version_id` 供对比 | 引用稳定到版本，支撑「版本差异 / 兼容性」类回答与前端/Agent 溯源 |
| D25 | SSE 事件行协议 `step / meta / citation / delta / usage / done / error`（`done` 自包含），复用 `sse-starlette`，不套统一响应包装；同步 `POST .../chat` 返回同源 `ChatResponse` | 与 ragf-design D18 事件契约一致；错误与降级有约定路径；两形态共用 prepare 产物 |
| D26 | 检索过滤从 `file_name` 扩展为结构化 `filters`：keyword/tag、`version_id`、`updated` 时间、文件类型/路径前缀 | `document_keywords` 与 `chunk.meta` 已预埋，属低风险演进 |
| D27 | 新增多 KB 聚合检索：工具/接口支持 `kb_names: [..]`，结果保留 KB 归属 | 工程问答常跨 Wiki / 仓库 / 内部系统（多 KB） |
| D28 | 数据源连接器（Git / Wiki / URL）与版本化语义为演进目标，按 §8 信号启动，不提前建设 | 避免在摄取契约未稳前引入连接器复杂度 |
| D29 | 最小评估集先行：工程问句 golden set + 检索指标 + LLM Judge；全量 `app/eval` 二期 | 用证据验收「准确率提升、遗漏下降」 |
| D30 | MCP 面只读边界 + 鉴权与 Web 控制面同源：工具集不含任何文档管理/变更类操作；MCP 令牌复用统一用户身份体系（JWT/API Key 派生，含 `plugin_namespace` 与 RBAC 投影），不为 MCP 开第二套授权模型 | Web 控制面已管理文档与权限；MCP 只是同一数据的只读检索通道，避免双通道授权分裂与越权 |
| D31 | audience：JWT 直通仅限自家 host——A「同信任域直通」（iss/签名/exp，aud 同域放宽）+ `scp` claim 承载权限点；演进 C「Token Exchange（RFC 8693）」换 `aud=mcp-rag` 下游 token（可缓存）；B（resource indicator，RFC 8707）需 IdP 配合，不采用。PAT / OAuth 凭证无 aud 问题 | 直通模式务实可用，代价是“拿到后端 token 即可打 MCP”——仅自家 host 场景可接受；外部 client 走 PAT/OAuth（D22） |
| D32 | RBAC 授权数据源：tenant + 角色（或 `scp` 权限点）进 token；细粒度权限点允许查服务端缓存（30–60s）；权限点命名直接映射既有 RBAC，MCP 不发明第二套权限模型 | 权限变更秒级生效不是 RAG 检索场景硬需求，不为它牺牲可用性（RBAC 服务抖动不拖垮检索链路） |
| D33 | 鉴权强制在 MCP server 执行：tool handler 内声明式权限检查（每工具声明所需权限点，进入 tools/list 元数据并动态过滤）；参数级授权——`kb_id`/`document_id` 校验归属（防工具版 IDOR）；401 按 Bearer 规范带 `WWW-Authenticate`；审计 `sub × kb_id × action × query` | 工具是否被调用由 LLM 决定，LLM 可被 prompt injection 诱导；权限检查绝不能只放 Agent 端；缩小 LLM 可见工具面本身是注入防线 |

## 4. 模块落点与文件结构

```text
backend/src/
├── app/
│   ├── chat/                        # 🆕 M9（D18）：检索 + 生成门面，SSE 流式
│   │   ├── api/v1/chat.py           # POST /knowledge_bases/{kb_name}/chat[/stream]（JSON / 事件行协议）
│   │   ├── service/chat_service.py  # 门面：prepare（检索装配）+ events（SSE 序列）
│   │   ├── service/prompts.py       # system/上下文/引用编号模板
│   │   └── schema/chat.py           # ChatParam / ChatMessage / Citation
│   ├── mcp/                         # 🆕 M10：MCP 服务端（工具面）
│   │   ├── server.py                # FastMCP app + stdio / Streamable HTTP 适配
│   │   ├── tools/knowledge.py       # 5 个工具定义（JSON Schema + 执行）
│   │   ├── auth.py                  # 多凭证中间件：JWT 直通 / PAT（env、header）/ OAuth → UserContext 归一
│   │   ├── logging.py               # MCP 调用审计（kb/工具/耗时/token/结果）
│   │   └── schema/                  # 工具入参/出参 DTO（供 /mcp/tools 目录复用）
│   ├── retrieval/                   # 演进 M11：filters、多 KB 聚合（扩 service/strategies）
│   ├── kb/                          # 演进：keywords 检索入口、版本化读写（联动 document-versioning spec）
│   └── model_provider/              # 演进 M9：+ providers/chat.py、model_factory.select_chat_model
├── core/
│   ├── config.py                    # + RAGF_CHAT_MODEL_SPEC / RAGF_MCP_* / 检索 filter 默认
│   └── register.py                  # + chat 不占 lifespan；mcp 仅挂路由与客户端生命周期
└── app/router.py                    # + chat_v1；mcp 在应用工厂单独挂载（JSON-RPC 白名单路径）
```

域依赖方向延续 ragf-design §4：`chat → retrieval / model_provider / kb`；`mcp → chat / retrieval / kb / model_provider`（工具只编排公开 service，不直连存储）；import-linter 新增 `mcp` 域契约与豁免理由。

## 5. 关键机制与契约

### 5.1 chat 门面（M9）

```text
请求（检索覆盖层同 search + model + history）
  → prepare：检索 → token 预算裁剪 → 上下文块【片段N】（来源：kb/doc/version）
  → 流式 events：SSE 事件行 step / meta / citation / delta / usage / done / error
  → 非流式：同一 prepare 产物一次性生成，返回 ChatResponse（字段 = 各事件负载并集）
  → 无命中短路：meta.hit=0 + 明确文案，不调用模型
  → 模型未配置/超时/流错误：流式走 error 事件携带 code（含 trace_id）；非流式走 HTTP 异常
```

两种形态共用 `chat_service` 的装配与产物（EagleRAG `query`/`query_stream` 同构：仅生成调用分阻塞/流式）：`POST .../chat` 非流式、`POST .../chat/stream` SSE。

- `model` 解析：`model_spec`（`provider_id:model_id`）→ provider 行 → 流式 Chat Completions；默认 `RAGF_CHAT_MODEL_SPEC`，支持单次覆盖。
- 多轮：首版无服务端会话状态，`history` 由调用方显式传入（近 N 轮，默认 10）。
- 引用：`citation` 事件在首个 `delta` 前或 `done` 前发送一次，结构与 D24 一致；`chunk_id` 形如 `{document_id}:{version_id}:{idx}`。
- 过程可解释：`step` 事件随检索编排即时产出（recall/rerank/hydrate），`done` 自包含 `{reason, answer, route, steps, usage}`，客户端可只消费 `done` 渲染。

### 5.2 MCP 工具面（M10）

| 工具 | 说明 | 入参（要点） | 出参（要点） |
| --- | --- | --- | --- |
| `list_knowledge_bases` | 列出当前身份可见 KB | `—` | `[{kb_name, display_name, doc_count?}]` |
| `search_knowledge` | 混合检索 + 精排（可关） | `query`, `kb_names: [str]`（缺省 = 可见库子集或报错）, `top_k`, `filters`, `use_reranker` | `hits: [{chunk_id, document_id, kb_name, version_id, content, score, metadata}]` |
| `answer_with_citations` | 检索 + LLM 汇总（等价 Yuxi `query_kb`） | 同 search + `model` + `history` | 结构化：`answer` + `citations[]`（D24） |
| `read_document_chunks` | 追问所需的已命中 chunk 窗口续读（非「获取文档」入口） | `kb_name`, `document_id`, `chunk_ids/offset` | `chunks[]`（检索命中片段原文与偏移） |
| `get_document` | 检索溯源所需的定位元数据（含版本）；全文查看/下载在 Web 控制面 | `kb_name`, `document_id` | `{name, source_uri?, versions[], active_version}` |

- 工具错误：JSON-RPC error，code 稳定可重试（`KB_NOT_FOUND` / `EMPTY_RESULT` / `MODEL_NOT_CONFIGURED` / `RATE_LIMITED` / `INTERNAL`），并写 MCP 调用日志。
- 幂等与重试：检索/读文档为纯读，天然幂等；`answer_with_citations` 允许重复调用（不产生副作用），成本计入审计。
- 静态目录 `GET /mcp/tools`：返回工具 JSON Schema 列表，供管理页/CLI 展示。
- 能力边界（D30）：文档管理类操作（上传/删除/版本切换/同步源配置）只存在于 Web 控制面 REST；MCP 面为只读检索面，任何工具不得触发写路径。
- 授权（D33）：每工具声明所需权限点；`tools/list` 按调用方权限动态过滤；`kb_id`/`document_id` 执行前做归属校验；详细机制见 §5.5。

### 5.3 检索增强（M11）

- `filters`：`keyword`（文档关键词，走 `document_keywords`）、`tag`、`version_id`（精确版本）、`updated_after/before`、`file_type`、`path_prefix`；与现有 `file_name` 兼容合并。
- 多 KB 聚合：单请求跨 `kb_names`，各库按 recall_top_k 召回 → 合并 → 精排 → 统一 `final_top_k`；排序策略见开放问题 O1。
- 版本感知：检索只命中 `active_version` chunk（`is_active` 标记或 join，实现时定）；同文档多版本对比由调用方对 `version_id` 显式过滤完成。

### 5.4 可观测与治理

- otel span：`ragf.chat.*`、`ragf.mcp.*`（工具名/身份/kb/耗时/是否降级）；指标：chat 请求数、首 token 延迟、无命中率、citation 覆盖率、MCP 调用数/失败率。
- MCP 调用日志落库（表归属 kb/admin 或 `mcp` 域，评审定）：调用人、工具、参数摘要（脱敏）、kb、耗时、token、结果码。
- import-linter 新增 `mcp` 契约；`chat` 不依赖 `mcp`（单向：mcp 编排 chat）。

### 5.5 MCP 鉴权与授权（多凭证归一中间件，D22/D31–D33）

已收敛（O2/O7）：鉴权收敛在一个多凭证中间件；签发体系沿用 fba，不因 MCP 引入新 IdP 或改签发方式（示例代码中的 RS256/JWKS 仅供参考，不是实现要求）。

| 调用方 | 凭证 | 注入方式 | 校验 |
| --- | --- | --- | --- |
| 自家 host（Web/Agent 后端） | 用户 JWT 直通 | MCP client 注入 `Authorization: Bearer <用户JWT>` | fba 现有签发密钥本地校验；401 → refresh 重试一次 |
| Codex | PAT | stdio 侧本地桥接进程（mcp-remote 风格）env 注入 header | PAT 服务端校验（复用 APIKey hash/撤销/tombstone 语义） |
| Claude Code | OAuth 2.1（Keycloak DCR 就绪后）或 PAT header | 原生 OAuth / 配置 PAT header | Keycloak JWKS（演进）或 PAT 服务端校验 |
| stdio 回落 | 本地桥接进程（非本地 server） | 桥接进程转发远程 HTTP（env 携带 PAT/用户凭证） | 与 HTTP 同一中间件 |

```text
浏览器 / Codex / Claude Code ── 三类凭证 ──> 多凭证中间件（auth.py）
                                              │ 解析 JWT / PAT / OAuth → UserContext(sub/tenant/scp)
                                              ▼
                                         MCP Server  ← 唯一对外鉴权执行点
                                              │ tool handler 强制检查（零改动，只看 UserContext）
                                              ▼
                                      RAG / Milvus / model_provider（无用户级鉴权）
```

- **中间件归一**：解析三类凭证 → `UserContext(sub/tenant/scp)`；无/坏凭证 → 401 + `WWW-Authenticate`（Bearer）；凭证形态差异不外泄到 tool 层。
- **自家 host（JWT 直通）**：token 生命周期收敛在 Agent 后端一处（复用自家刷新逻辑，401 refresh 重试一次）；LLM 全程不感知 token（host 注入 header，不进 prompt、不进工具参数）。
- **Codex（PAT + env）**：Codex 无原生远程认证时用 mcp-remote 风格本地桥接进程（stdio 侧注入 env PAT）；PAT 不进客户端配置文件，只在本机桥接进程可见。
- **Claude Code（OAuth 2.1 / PAT header）**：Keycloak DCR 未就绪前用 PAT header；就绪后走原生 OAuth 2.1，MCP server 按 resource server 接受 IdP 签发的 bearer。
- **stdio 回落**：薄本地桥接进程转发远程 HTTP，不是“本地部署 RAGF server”；不扩大数据面与密钥暴露。
- **audience（D31）**：JWT 直通仅限自家 host——A 同信任域直通（iss/签名/exp，aud 同域放宽）+ `scp` claim 承载权限点；演进 C：Token Exchange（RFC 8693）换 `aud=mcp-rag` 下游 token。PAT / OAuth 无 aud 问题。
- **RBAC 数据源（D32）**：tenant + 角色进 token，细粒度权限点查服务端缓存（30–60s）；权限点命名直接映射既有 RBAC（`rag:kb:search` 等），一个用户一套体系两个消费方。
- **强制检查点（D33）**：tool handler 内 `require_perms`（每工具声明所需权限点）；`tools/list` 按权限动态过滤（缩小 LLM 可见工具面 = 注入防线）；参数级校验 `kb_id` 归属（防工具版 IDOR）。
- **校验实现（签发）**：密钥签发沿用 fba 现有方案（HS256 共享密钥，MCP server 与签发方同域可本地验证；PAT 走服务端查库/缓存）；RS256/JWKS（kid 匹配 + 定期后台拉取）仅在 Keycloak DCR 落地后作为 IdP 通道引入；算法白名单防 alg 混淆。
- **内部与运维**：MCP server → Milvus/TEI 不做用户级鉴权，靠网络隔离（K8s NetworkPolicy 或 service token）兜底；`sub` 以 `X-User-Id` 向内传播仅作审计，不再是鉴权依据；撤销：TTL ≤15min 纯本地校验足够，若 JWT 小时级长寿命则挂共享黑名单/introspection 且只对敏感写路径强制查（读路径容忍 TTL 窗口）；审计日志不打全量 claims（PII 最小化）。

## 6. API 契约草案

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/v1/knowledge_bases/{kb_name}/chat` | 检索 + chat 模型非流式回答，返回统一 JSON `ChatResponse`（D18/D25），挂 JWT |
| `POST` | `/api/v1/knowledge_bases/{kb_name}/chat/stream` | 同一流水线 SSE 流式回答（D18/D25），挂 JWT |
| `GET` | `/mcp/tools` | MCP 工具静态目录（JSON Schema 列表） |
| `POST` | `/mcp` | MCP Streamable HTTP 端点（JSON-RPC；多凭证鉴权见 §5.5，路径可配置） |

SSE 事件行（对齐 D25，`text/event-stream`）：

事件顺序：`step*` → `meta` → `citation` → `delta*` → `usage` → `done`（或 `error`）。

| 事件 | 数据（要点） |
| --- | --- |
| `step` | `{name: recall/rerank/hydrate, detail}` —— 检索编排即时产出 |
| `meta` | `{kb_name, mode, model_spec, hit_count, visual_count}` |
| `citation` | `{citations: [{n, kb_name, document_id, version_id, chunk_id, score, content}], images: [...]}` |
| `delta` | `{content}` |
| `usage` | `{prompt_tokens, completion_tokens, total_tokens}` |
| `done` | `{reason: 'complete'/'empty_result'/'max_tokens', answer, kb_name, kb_names, mode, model_spec, hit_count, visual_count, route, steps, usage}`（自包含） |
| `error` | `{code, msg, trace_id}` |

## 7. 里程碑与验收

| 里程碑 | 内容 | 完成标准 |
| --- | --- | --- |
| M9（延续 ragf-design） | chat 门面：`providers/chat.py` + `select_chat_model` + `type=chat` 模型行；`prepare` + `events` + `prompts`；`POST .../chat` + `POST .../chat/stream` | 同 provider 行 `type=chat` 模型可流式返回（SSE 逐帧 delta）；非流式与流式 `done` 同源；事件行契约稳定；无命中短路与模型未配置走约定路径；prompts/客户端协议单测 + API 冒烟绿 |
| M10 | MCP 服务端：Streamable HTTP + stdio 回落桥；5 工具；多凭证中间件（§5.5）；调用日志；`/mcp/tools` | 三种凭证归一验证：自家 host JWT 直通闭环；Codex 经桥接进程 + env PAT 可调用；Claude Code 以 PAT header（Keycloak 就绪后 OAuth）可调用；401 带 `WWW-Authenticate`；`tools/list` 按权限动态过滤；`kb_id` 越权负向用例绿；调用日志落库 |
| M11 | 检索增强：`filters` + 多 KB 聚合 | unit + 真实 PG/Milvus integration：tag/version 过滤正确、跨 KB 聚合保留归属、跨 KB 越权不可见 |
| M12 | 数据源演进（信号驱动）：Git/Wiki/URL loader 复用 ingest；版本化语义生效 | 同文档 v2 摄取后查询可命中两版本 chunk 且 `version_id` 可区分；`active_version` 切换原子；源刷新可触发重摄取（§8 信号到才启动） |
| M13 | 最小评估：golden set + 指标 + LLM Judge | 工程问句集（版本差异/兼容性/跨系统对照）可回归；报告 recall/citation 覆盖率/答案分；CI 纳入 |

## 8. 边界、信号与红线

- 红线（未到信号不做）：图谱/Neo4j、多模态摄取、网页聊天 UI 接入、自建 OCR/embedding/rerank 运行时、LangGraph/ARQ 执行栈、MCP 面出现文档管理/写操作。
- M12 启动信号：出现真实「Git 仓库 / Wiki / 内部系统」接入方，或用户提出「同文档多版本对比」不可接受的检索遗漏。
- M13 启动信号：M9/M10 冒烟通过且出现可标注的 golden set 数据源（人工抽样的版本差异/兼容性问句 ≥ 20 条）。

## 9. 开放问题（评审时收敛）

已收敛：O2/O7（多凭证归一中间件：JWT 直通 / PAT+env 桥 / OAuth 或 PAT header，见 §5.5/D22）、O6（保留 `list_knowledge_bases` / `get_document` 发现类工具；MCP 面只读，文档上传/管理只在 Web 控制面）。

| 编号 | 问题 | 候选 |
| --- | --- | --- |
| O1 | 多 KB 聚合排序：各库独立 RRF 后合并按精排分排序，还是跨库统一 RRF | 默认前者（实现简单、库间不可比）；如效果差再评估后者 |
| O3 | MCP 调用日志表归属与保留期（`mcp` 域 vs admin；是否含 token 用量成本聚合） | 评审定 |
| O4 | chat 是否需要服务端会话与消息落库（供前端 UI / 审计） | 首版无状态；如前端要接入再按 agentic-rag spec §5.4 补 conversation/message |
| O5 | `answer_with_citations` 的上下文 token 预算与长文档窗口读取策略（父子 chunk / 窗口续读） | 先固定 `RAGF_CONTEXT_MAX_TOKENS`，续读走 `read_document_chunks` 由 Agent 决定 |

### 9.1 鉴权坑清单（多凭证归一模式的红线检查）

| 坑 | 说明 / 对策 |
| --- | --- |
| 只验签名不验 iss/aud | 内部任意签发的 token 都能打；必须校验 iss/签名/exp，算法白名单写死（防 alg 混淆/none 攻击） |
| aud 处理不当 | 首发直通模式明确“同域放宽”，不是漏配；演进 C 才收紧到 `aud=mcp-rag` |
| `kb_id` 只当参数不校验归属 | 工具版 IDOR；tool handler 内做参数级租户归属校验（D33） |
| 鉴权只在 Agent 端 / tools/list 不过滤 | LLM 可被 prompt injection 诱导调未授权工具；权限检查必须在 MCP server 强制，`tools/list` 按权限动态过滤 |
| 内部服务裸奔当隔离 | MCP server → Milvus 等必须网络策略/service token 兜底；`X-User-Id` 只作审计不作鉴权依据 |
| MCP client 不实现 401→refresh | 用户 token 过期后工具静默全挂；自家 host 必须实现 401 refresh 重试一次 |
| 长寿命 JWT + 无黑名单 + 撤销开放 | 读路径容忍 TTL 窗口；敏感写路径强制查黑名单/introspection；审计日志不打全量 claims（PII） |
| LLM 感知 token | token 只由 host 注入 header，不进 prompt、不进工具参数 |
| PAT 落配置文件/CI | PAT 经桥接进程 env 注入，只在本机进程可见；配置文件进 .gitignore；可撤销 + 最短有效位 |
| stdio 回落误当本地 server | stdio 回落 = 薄桥接进程转发远程 HTTP，不部署本地 RAGF 数据面；桥接进程不带业务密钥/全量数据面 |
| 凭证形态泄漏到 tool 层 | 三类凭证差异必须收敛在中间件；tool 只见 `UserContext`，禁止每工具再写一套鉴权分支 |
| OAuth 未就绪就承诺原生流 | Claude Code OAuth 依赖 Keycloak DCR 就绪；未就绪一律 PAT header，不许静默降级为匿名 |

## 10. 风险

- MCP HTTP 与现有统一响应/鉴权中间件冲突：需在应用工厂对 `/mcp` 做白名单（JSON-RPC 不套 `ResponseSchemaModel`），避免中间件改写 MCP 帧。
- 凭证组合差异：自家 host = JWT 直通；Codex = 桥接进程 + env PAT（依赖本机运行桥接进程，PAT 生命周期需管理）；Claude Code = OAuth 依赖 Keycloak DCR 就绪，未就绪前用 PAT header；各路径都必须走同一多凭证中间件归一，避免每客户端一套鉴权分支。
- stdio 回落实为本地桥接进程：不是本地部署 server；桥接进程只做转发 + 注入凭证，不扩大数据面与密钥暴露。
- 签发依赖：密钥签发沿用 fba 现有方案（HS256 共享密钥同域本地校验）；示例中的 RS256/JWKS 仅供参考，仅在 Keycloak 通道落地时引入 IdP JWKS 校验。
- 引用跨版本不稳定：`chunk_id` 含 `version_id`（已预埋），M11 起检索过滤必须按 active_version 收敛，避免脏引用。
- 成本：`answer_with_citations` 重复调用产生 token 成本，调用日志 + 用量事件先上线，限流后置（M10 验收含基本限流）。
- 数据源新鲜度：未到 M12 前，MCP 检索的是上传快照；spec 中明示能力边界，避免对「最新版本」的虚假承诺。

## 11. 验收标准汇总

- M9 绿：SSE 事件契约稳定、`type=chat` 模型流式返回、语义错误走约定路径（单测 + API 冒烟）。
- M10 绿：自家 host 注入用户 JWT 完成「列库 → 检索 → 带引用回答」闭环；401 带 `WWW-Authenticate` 且 client 刷新重试一次；`tools/list` 按权限过滤；`kb_id` 越权负向用例通过；调用日志落库。
- M11 绿：filters 与多 KB 聚合在真实 PG/Milvus 上通过，跨 KB 越权不可见。
- M13 绿：golden set 可回归，报告含 recall / citation 覆盖率 / LLM Judge 答案分。
- 全程：ruff/pyright/import-linter 绿；新域补 unit + integration（模式参考 `app/kb/tests/test_document_storage.py`）。

## 12. 相关文档

- [2026-08-21-agentic-rag-系统设计.md](./2026-08-21-agentic-rag-系统设计.md)：Agent 层 ReAct、工具集、SSE 与引用溯源的最初设计。
- [2026-08-25-rag-api设计与落地路线.md](./2026-08-25-rag-api设计与落地路线.md)：MCP 传输与 /mcp 端点、六阶段落地路线。
- [2026-09-01-eaglerag-kb-migration-design.md](./2026-09-01-eaglerag-kb-migration-design.md)：两轴多租户与 kb CRUD 契约（本设计权限下沉依据）。
- [2026-09-02-document-versioning-spec.md](./2026-09-02-document-versioning-spec.md)：版本化数据模型与切换语义（M11/M12 联动）。
- [ragf-design](../tmp/ragf-design.md)：D0–D18 决策、M0–M9 里程碑与本设计的直接上游。
