---
title: Agentic RAG 落地改造清单
description: 基于 LangGraph 构建 RAG-F 的 Agent 层：依赖取舍、两层图设计、分期改造项、D25 事件桥接与验收红线
---

# Agentic RAG 落地改造清单（Spec）

## 0. 文档信息

| 项 | 内容 |
| --- | --- |
| 状态 | 待评审 |
| 日期 | 2026-09-12（v2：撤销 v1 的「不引入 LangGraph」结论） |
| 性质 | 落地改造清单（增量演进），非重写 |
| 参照实现 | Yuxi `backend/package/yuxi/agents/`（MIT，LangGraph + LangChain `create_agent`） |
| 上游文档 | `docs/specs/2026-08-21-agentic-rag-系统设计.md`（已评审待实现）、`docs/specs/2026-09-05-agent-layer-and-mcp-design.md`（D18/D24/D25/D30/D33） |
| 一句话结论 | **引入 LangGraph + LangChain**，用「外层 StateGraph 编排 + 内层 ReAct 子图」两层图；**暂不引入 DeepAgents**（依赖污染，收益被 LangChain 自带能力覆盖） |

### 0.1 为什么要做

现状是**固定单轮漏斗**：`route → recall → rerank → generate`，一次检索不回头。三条 Agentic 特性全缺：

| 特性 | 现状 | 目标 |
| --- | --- | --- |
| 自主决策（是否检索、检索几次） | 无，恒定检索 | 模型自主调用检索工具，可零检索直接回答 |
| 查询规划（任务拆解） | 无 | 复杂问句先规划，再并行多路检索 |
| 自我修正（重检索闭环） | 无 | 低分/无命中 → 改写 → 重检索，带硬预算 |

### 0.2 非目标（本期明确不做）

- **不做**多智能体（subagent）、沙盒文件系统、Skills 安装 —— 那是 Yuxi 的通用办公 Agent 形态，RAG-F 只需要「检索 Agent」。
- **不做**服务端会话持久化（checkpointer）—— 沿用现有「history 由调用方传入」约定；运行审计落自己的表，不引 `langgraph-checkpoint-postgres`。
- **不做**写路径工具 —— 严格延续 D30「工具面只读」边界。
- **不动** `/chat` 与 `/chat/stream` 的现有语义（纯检索问答），Agent 走新端点，前端可灰度。

---

## 1. 依赖取舍：为什么是 LangGraph 而不是 DeepAgents

`deepagents` 0.7.13 的 `requires_dist`（PyPI 实测）**强制**包含两个 provider SDK：

```
langchain>=1.3.18, langchain-core>=1.6.1,
langchain-anthropic>=1.7.0,        # ← 强制，非 extra
langchain-google-genai>=4.3.7,     # ← 强制，非 extra
langsmith>=0.11.2, packaging, wcmatch
```

而 `langgraph` 1.2.11 / `langchain` 1.4.0 的强制依赖极干净：

| 包 | 强制依赖 |
| --- | --- |
| `langgraph` | `langchain-core`、`langgraph-checkpoint`、`langgraph-prebuilt`、`langgraph-sdk`、`pydantic`、`xxhash` |
| `langchain` | `langchain-core`、`langgraph`、`pydantic`（其余全是 optional extra） |
| `langgraph-prebuilt` | `langchain-core`、`langgraph-checkpoint` |

**关键事实**：Yuxi 的规划能力来自 **LangChain 自带**的 `TodoListMiddleware`（`langchain.agents.middleware`），**不是** DeepAgents。Yuxi 实际从 DeepAgents 只拿了四样：`PatchToolCallsMiddleware`、`summarization`、`skills`、`filesystem/sandbox` —— 对检索 Agent 都不是必需。

| 决策 | 内容 |
| --- | --- |
| ✅ 引入 | `langgraph` + `langchain` + `langchain-openai`（OpenAI 兼容协议，与现有 provider 复用同一 base_url/key） |
| ❌ 暂不引入 | `deepagents` —— 为 4 个非必需中间件付 anthropic + google-genai 两个 SDK 的镜像体积与升级维护成本，不划算 |

> 若后续确实需要 subagent 或上下文自动摘要，再单独评估引入 DeepAgents；届时它是一个独立 PR，不影响本清单的图结构。

**`langchain-openai` 的带入成本**（1.6.2 实测强制依赖）：`openai>=2.45.0`、`tiktoken>=0.7.0`、`certifi`。
经查 `backend/uv.lock`（当前 165 个包），**`openai` 与 `tiktoken` 均不存在** —— 即本次改动会新增这两个包。
`opentelemetry-instrumentation-openai` 虽已在 lock 中，但它对 openai 是**惰性 patch**（无强制依赖），不构成冲突。

---

## 2. 现状基线（2026-09-12 实测）

### 2.1 已具备、可直接复用

| 能力 | 落点 | 说明 |
| --- | --- | --- |
| 检索门面 | `retrieval/service/retrieval_service.py:129/149` | `search`（单库）/ `search_multi`（多库聚合，M11/D27） |
| 流式检索编排 | `retrieval/service/retrieval_service.py:193` `astream_search` | 逐 `step` 事件 + 最终 payload |
| chat 门面 | `chat/service/chat_service.py:194/281` | `astream` / `acomplete`，双形态同源产物（D25） |
| 引用契约 | `chat/service/chat_service.py:82` `build_citations` | D24 结构化引用 |
| 上下文/消息组装 | `chat/service/prompts.py` | `build_context_text` / `build_messages` / `truncate_citations` |
| 模型工厂 | `model_provider/service/provider_service.py` | `get_chat_model` 按 spec 取模型 |
| 只读工具语义 | `mcp/service.py:80` `_tool_specs()` | 5 工具 + 权限点声明，可直接映射为 LangChain `@tool` |
| 事件契约 | `retrieval/schema/rag_query.py:93` `QueryStepItem` | `{name, detail}`，可扩展 |
| ACL 下推 | `kb/deps.py` `CurrentScope` | 每轮重建 Scope |
| PG 驱动 | `pyproject.toml` 已含 `psycopg[binary]>=3.2` | 未来若要上 checkpointer 无需新增驱动 |

### 2.2 明确缺口（改造对象）

| # | 缺口 | 证据 | 影响 |
| --- | --- | --- | --- |
| G1 | 无 Agent 运行时依赖 | 全仓无 langgraph/langchain | 需新增依赖并锁 `uv.lock` |
| G2 | 无 agent 业务域 | `backend/src/app/` 仅 8 域 | 图与工具无处安放 |
| G3 | 无运行审计 | 无 `agent_runs` 表 | 步数/成本/工具轨迹不可观测 |
| G4 | 无查询改写 | 全仓无 rewrite 相关实现 | 自我修正无从触发 |
| G5 | Agent 相关配置项缺失 | `core/config.py:340-358` 仅 retrieval/chat 两组 | 预算不可调 |
| G6 | 无 LangGraph → D25 事件桥 | 无适配层 | 前端契约无法直出 |
| G7 | 前端无 step 明细渲染 | `frontend/src/features/chat/lib/d25-sse.ts` | 规划过程不可见 |

> **注意**：v1 清单里的「G1 单点阻塞：chat provider 不支持 tool calling」在引入 LangGraph 后**不再是阻塞项** —— tool-calling 由 `langchain-openai` 的 `ChatOpenAI` 实现，不需要改 `model_provider/providers/chat.py`。该项降级为「可选统一」事项（见 Phase 4）。

---

## 3. 目标架构

### 3.1 两层图（推荐结构）

```text
POST /api/v1/knowledge_bases/{kb_name}/agent[/stream]
        │
        ▼
┌─ agent 域（🆕）──────────────────────────────────────────────┐
│ AgentService.astream / acomplete（D25 事件直出，双形态同源）  │
│                                                              │
│  ┌─ 外层 StateGraph（服务端确定编排：T2 规划 + T3 自省）──┐   │
│  │                                                        │   │
│  │   START ──► plan ──┬──► act ──► grade ──┬──► generate ──┼─► END
│  │                    │         ▲          │              │   │
│  │                    │         │          ├──► rewrite ──┘   │
│  │                    └──► generate         └──► abort        │
│  │        (need_retrieval=false)                             │   │
│  │                                                        │   │
│  │   act = ReAct 子图（create_agent + 工具，T1 自主决策） │   │
│  └────────────────────────────────────────────────────────┘   │
└────────┬───────────────────────┬──────────────────────────────┘
         │ 复用（域间门面调用）   │ 复用
         ▼                       ▼
  retrieval_service         chat_service / chat prompts
  search_multi                    │
  astream_search                  ▼
                        model_provider（复用 provider 配置，
                        经 langchain-openai 的 ChatOpenAI 接入）
```

**为什么是两层**：内层 `create_agent` 提供 T1（模型自选工具，形态对齐 Yuxi）；外层 StateGraph 提供 T2/T3（服务端可控、可预算、可测的条件边）。若只用 `create_agent`，T3 的自省就退化成「靠模型自觉」（Yuxi 的现状）；若只用手写 StateGraph，T1 又要自己实现工具循环。两层各取所长。

### 3.2 三条特性的落点

| 特性 | 实现载体 | 关键机制 |
| --- | --- | --- |
| 自主决策 | 内层 ReAct 子图 | 检索工具在工具列表里，模型自选调/不调；`plan.need_retrieval=false` 时跳过 `act` 直接生成 |
| 查询规划 | `plan` 节点 | 一次低温结构化调用产出 `sub_queries`；并行检索后复用检索层既有 RRF/精排 |
| 自我修正 | `grade` 条件边 → `rewrite` → 回 `act` | 判据是数值（`hit_count` / 精排最高分），不是模型自由发挥；`rewrite_count` 状态计数封顶 |

### 3.3 图状态（`AgentState`）

```python
# agent/graph/state.py（草案）
class AgentState(TypedDict):
    query: str                                  # 原始问句
    sub_queries: list[str]                      # plan 产物
    need_retrieval: bool
    hits: list[dict]                            # 检索命中（chunk_id 去重后）
    citations: list[dict]                       # D24 引用
    visual_items: list[dict]
    rewrite_count: int                          # 自省预算计数
    grade_score: float                          # 精排最高分
    steps: Annotated[list[dict], operator.add]  # 过程轨迹（D25 step 事件来源）
    usage: dict                                 # token 累计
```

---

## 4. 关键技术决策（延续 D 编号，评审时确认）

| # | 决策 | 理由 |
| --- | --- | --- |
| **D34** | Agent 运行时采用 **LangGraph + LangChain**；编排形态为「外层 StateGraph + 内层 `create_agent` 子图」 | ① 条件边天然表达「评估→改写→重检索」闭环，把 T3 从「靠模型自觉」变成可测的状态机；② `TodoListMiddleware` / `ModelRetryMiddleware` 由 LangChain 自带，规划与重试无需自研；③ 依赖面干净（见 §1）；④ 与 Yuxi 形态一致，可迁移的工程经验最多 |
| **D35** | Agent 走**新端点** `/{kb_name}/agent` + `/agent/stream`，`/chat` 语义冻结 | ① 向后兼容，前端可灰度；② 语义清晰：`chat` = 单轮检索问答，`agent` = 自主编排；③ 沿用 D25「同步 + 流式同源产物」惯例 |
| **D36** | 自省闭环**有明确判据 + 硬预算**，不做开放式反思 | ① 成本可控：`max_steps`、`max_rewrites`、墙钟超时三重闸；② 可测：判据是数值，能写确定性单测 |
| **D37** | Agent 工具面**复用 MCP ToolSpec 的只读语义与权限点，不复用 MCP 传输** | ① 进程内直调 service 门面，省一次 JSON-RPC；② 延续 D30 只读边界 + D33「权限检查绝不放 LLM 侧」；③ 避免第二套授权模型 |
| **D38** | D25 事件契约**只做增量扩展**，不改既有语义 | 前端 `generated/` 与 MSW mock 已消费 D25，破坏性改动成本高 |
| **D39** | **暂不引入 DeepAgents** | PyPI 实测强制依赖 `langchain-anthropic` + `langchain-google-genai`；其独有能力（sandbox/skills/subagent/summarization）对本期非必需，LangChain 自带 `TodoListMiddleware` 已覆盖规划需求 |
| **D40** | 首版**不引入 checkpointer**，Agent 为单次运行（stateless） | ① 现有 chat 就是「history 由调用方传入」，保持一致；② 避免 `langgraph-checkpoint-postgres` 带入额外表结构与连接池；③ 运行审计落自建 `agent_runs` 表即可满足可观测 |
| **D41** | 多子查询的**召回融合下沉到 retrieval 层**，不在 agent 层做 N 次独立检索后合并 | 若 agent 层逐个子查询调 `search_multi`，会得到 N 份各自精排过的列表，事后合并等于精排失效且成本 ×N。正确做法是给检索策略的 `ctx` 增加 `query_texts: list[str]`：**多路召回在策略内并行，RRF 融合 + 精排仍只做一次**。retrieval 改动属本清单范围（见 Phase 2.2） |

---

## 5. 改造清单

### Phase 0 — 依赖引入 + 事件桥 spike

| 编号 | 落点 | 改动 | 验收 |
| --- | --- | --- | --- |
| 0.1 | `backend/pyproject.toml` | 加 `langgraph>=1.2,<2`、`langchain>=1.4,<2`、`langchain-openai>=1.6,<2`（连带新增 `openai` + `tiktoken`） | `uv sync` 通过 |
| 0.2 | `backend/uv.lock` | 重新锁定 | CI `uv sync --locked` 绿 |
| 0.3 | 冲突核查 | 确认 pydantic（现 2.13.4）、httpx（0.28.1）、SQLAlchemy 2.0.52 无版本回退 | `uv tree` 无降级 |
| 0.4 | `agent/graph/stream_bridge.py`（🆕） | **关键件**：把 `graph.astream(stream_mode=[...])` 的输出映射为 D25 事件 | 单测：桩图 → 事件序列符合 D25 |
| 0.5 | spike 验证 | 最小图（2 节点 + 1 条件边）跑通流式；确认 `get_stream_writer()` 可发自定义 `step` 事件 | demo 可跑 |
| 0.6 | 镜像体积 | 记录引入前后镜像 size 差 | 增量可接受（预期 < 50MB） |

**事件映射规则（0.4 的核心）**：

| LangGraph 来源 | D25 事件 |
| --- | --- |
| `stream_mode='custom'` + `get_stream_writer()`（节点内手工发） | `step` `{name, detail}` |
| `stream_mode='messages'` 的 `AIMessageChunk.content` | `delta` `{content}` |
| 节点产出的 `hits`/`citations`（`updates` 模式） | `citation` `{citations[]}` |
| 终态 `state` | `done`（自包含，附 `usage` / `steps` / `agent` 元数据） |
| 异常 | `error` `{code, msg}` |

---

### Phase 1 — agent 域骨架 + 工具面（特性①：自主决策）

| 编号 | 落点 | 改动 | 验收 |
| --- | --- | --- | --- |
| 1.1 | `backend/src/app/agent/`（🆕） | 分层：`api/` / `schema/` / `service/` / `graph/`（横向包，类比 ingest 的 `routing/engine/parser`） / `model/` / `tests/` | 目录就位 |
| 1.2 | `backend/pyproject.toml` `[tool.importlinter]` | independence `modules` 加 `backend.src.app.agent`；新增 agent 的 `layers` 契约（`api → service → model`，`graph` 为域内横向包不受约束）；`ignore_imports` 加 `agent → retrieval / model_provider / chat / kb`（注释引用 D34/D37） | `uv run lint-imports` 0 broken |
| 1.3 | `agent/graph/tools.py`（🆕） | 用 LangChain `@tool` 包装 5 个只读工具（对齐 `mcp/service.py:80`）：`list_knowledge_bases` / `search_knowledge` / `read_document_chunks` / `get_document` / `answer_with_citations`；**权限检查在 handler 内强制**（D33） | 单测：无权限 → 工具返回结构化拒绝 |
| 1.4 | `agent/graph/react.py`（🆕） | 内层 ReAct 子图：`create_agent(model=ChatOpenAI(...), tools=TOOLS)` | 单测：桩模型触发 1 次工具调用后收敛 |
| 1.5 | `agent/graph/builder.py`（🆕） | 外层 `StateGraph` 装配：`START → plan → act → grade → generate → END`（本阶段 `plan`/`grade` 可为直通桩） | 图可编译、可 `astream` |
| 1.6 | `agent/service/agent_service.py`（🆕） | 门面 `astream` / `acomplete`，经 `stream_bridge` 直出 D25 事件 | 与 `chat_service` 形态同构 |
| 1.7 | `agent/api/v1/agent.py` + `router.py`（🆕） | `POST /{kb_name}/agent`（JSON）+ `/agent/stream`（SSE）；挂到 `src/app/router.py` | OpenAPI 出现新路径；`/chat` 不变 |
| 1.8 | 权限点 | 新增 `rag:kb:agent`（`kb/utils/permissions.py`，与 `rag:kb:chat` 同风格）+ 菜单/权限 SQL 种子 | 无权限 403 |
| 1.9 | `agent/schema/agent.py`（🆕） | `AgentParam`（= `ChatParam` + `max_steps` / `enabled_tools` / `allow_rewrite`）、`AgentResponse` | 字段带 `Field(description=...)` |
| 1.10 | `core/config.py` | `RAGF_AGENT_*`：`MAX_STEPS=6`、`MAX_STEPS_HARD=12`、`TIMEOUT_SECONDS=180`、`MAX_REWRITES=1`、`MIN_SCORE=0.3`、`MAX_SUB_QUERIES=3` | `.env.example` 同步 |
| 1.11 | `agent/model/agent_run.py`（🆕，可后置） | 表 `agent_runs`：`run_id / kb_names / query / status / steps(jsonb) / tool_call_count / rewrite_count / usage / created_at` | 模型类在 `model/__init__.py` 聚合导出；**无需迁移脚本**（项目未上线，建表走启动时 `create_all`，见 `src/alembic/versions/README.md`） |

**模型接入**：`ChatOpenAI(base_url=..., api_key=..., model=...)`，base_url/key 从 **现有 `provider_service` 的 provider 配置**解析，不新建一套模型配置。这样 `/chat` 与 `/agent` 用同一个模型源，运维只看一处。

---

### Phase 2 — 规划节点（特性②）

| 编号 | 落点 | 改动 | 验收 |
| --- | --- | --- | --- |
| 2.1 | `agent/graph/nodes/plan.py`（🆕） | 一次低温结构化调用（`with_structured_output`），产出 `{need_retrieval, sub_queries, rationale}`；解析失败降级为「不规划，用原问句」 | 单测：简单问句 → `sub_queries=[原问句]`；复杂问句 → 多子查询 |
| 2.2a | `retrieval/service/retrieval_service.py` + `strategies/*` | 按 **D41** 下沉多查询融合：`ctx` 增加 `query_texts: list[str]`，策略内多路召回并行，RRF + 精排仍单次 | 单测：`query_texts=[q]` 与既有 `query_text=q` 结果一致（向后兼容） |
| 2.2b | `agent/graph/nodes/act.py` | 把 `sub_queries` 透传给检索层（`query_texts=sub_queries`），agent 层**不做**任何合并/去重/精排 | 多子查询命中数 ≥ 单查询，精排次数 = 1 |
| 2.3 | 事件 | `get_stream_writer()` 发 `step.name='plan'`（子查询数 + 理由） | SSE 可见 plan 步骤 |
| 2.4 | `agent/graph/prompts.py`（🆕） | planner / reflector / answer 三套提示词分离 | `test_prompts.py` 覆盖 |
| 2.5 | — | **已决策：采用 2.1 服务端 `plan` 节点，不采用 `TodoListMiddleware`**，理由见 §5.1 | — |

#### 5.1 为什么不用 `TodoListMiddleware`（源码实测对比）

读了 `langchain` 1.4.0 的 `langchain/agents/middleware/todo.py` 后确认，两者产出的**消费方不同**：

| 维度 | 服务端 `plan` 节点（2.1 采用） | `TodoListMiddleware`（不采用） |
| --- | --- | --- |
| 产出物 | `{need_retrieval: bool, sub_queries: list[str]}` —— **类型化对象** | `[{content: str, status: pending\|in_progress\|completed}]` —— **自由文本清单** |
| 消费方 | **服务端代码**（直接拿去并行检索） | **模型自己**（便签，服务端不解析） |
| 子查询可否执行 | 可以，`sub_queries` 是结构化字段 | 不可以，子查询只能塞进 `content` 自然语言里 |
| 产出时机 | 图入口一次，确定 | 模型自选时机，可反复修订 |
| 调用成本 | +1 次 LLM 调用（结构化输出），可预测 | 每个 `write_todos` 各占一轮工具调用 |
| 上下文开销 | 输出即用，不进上下文 | 每次更新经 `ToolMessage("Updated todo list to [...]")` **回显全量列表**，随清单长度 × 更新次数增长 |
| 自带提示词开销 | 仅 planner 提示词 | `WRITE_TODOS_TOOL_DESCRIPTION` + `WRITE_TODOS_SYSTEM_PROMPT` 约 1.5k token（Yuxi 用自定义短 prompt 覆盖了 system prompt，但工具描述默认很长） |
| D25 事件 | 节点内 `get_stream_writer()` **直发** `step{name:'plan'}` | 需拦截 `write_todos` 工具调用再翻译，且与中间件 `after_model` 钩子（拒绝并行调用）有交互 |
| 可测性 | 桩模型 → 断言 typed 输出，确定性 | 断言模型行为，不确定性 |
| 修订能力 | 静态（要修订需加 replan 边） | 模型自由修订，带进度状态 |
| 与 T3 自省的关系 | `grade` 条件边是服务端判据，与 plan 同层，天然协同 | 无法表达「低分→改写」，那是服务端的活 |

**结论**：`TodoListMiddleware` 是**长任务的任务管理装置**（为 DeepAgents 式「写一份报告」设计），不是**查询分解装置**。它解决的是「模型会不会忘记做到第几步」，不是「这一问该拆成哪几路检索」。RAG-F 的 T2 需要的是**服务端可执行的子查询**，`TodoListMiddleware` 给不了。

**唯一的延后触发条件**：若将来 inner ReAct 子图的单次运行 Steps 常态超过 ~10 步（多轮工具调用），再叠加 `TodoListMiddleware` 让模型自管进度 —— 那时它与 `plan` 节点是**不同层**，可以共存，不是二选一。

#### 5.2 顺带发现：预算中间件可直接复用

翻 `langchain/agents/middleware/__init__.py` 发现 LangChain 1.4 自带两个预算中间件，Phase 3.4 无需自研计数：

| 中间件 | 作用 | 建议落点 |
| --- | --- | --- |
| `ToolCallLimitMiddleware` | 限制单次运行/单工具的调用次数 | 限制 `search_knowledge` 调用次数（防提示注入放大成本） |
| `ModelCallLimitMiddleware` | 限制模型调用轮数 | 作为 `RAGF_AGENT_MAX_STEPS` 的底层实现 |
| `ModelRetryMiddleware` | 模型调用失败重试 | 对齐 Yuxi `max_retries=2` |
| `SummarizationMiddleware` | 上下文超阈值自动摘要 | 后置（Phase 4 观察后再定） |

**另外，LangGraph 自带节点级策略对象**（`langgraph.types`），Phase 3.4 的墙钟与重试同样不必自研：

| 策略 | 作用 | 建议落点 |
| --- | --- | --- |
| `TimeoutPolicy(run_timeout=...)` | 单节点硬墙钟（基于 asyncio 取消） | `act` / `generate` 节点，替代手写 `asyncio.timeout` |
| `RetryPolicy(max_attempts=...)` | 单节点失败重试（指数退避 + jitter） | `plan` / `rewrite` 等模型节点 |
| `CachePolicy(key_func=..., ttl=...)` | 单节点结果缓存 | `plan` 节点：同一问题重复问零 LLM 成本 |

用法：`builder.add_node('act', act_node, timeout=TimeoutPolicy(run_timeout=60), retry_policy=RetryPolicy(max_attempts=2))`。

**红线**：`sub_queries` 上限 `RAGF_AGENT_MAX_SUB_QUERIES`（默认 3），防提示注入放大成本。

---

### Phase 3 — 自省条件边（特性③，LangGraph 的最大收益点）

| 编号 | 落点 | 改动 | 验收 |
| --- | --- | --- | --- |
| 3.1 | `agent/graph/edges/grade.py`（🆕） | **条件边判据**（满足任一即 `rewrite`）：`hit_count == 0` / `grade_score < RAGF_AGENT_MIN_SCORE` | 单测覆盖三类分支（go / rewrite / abort） |
| 3.2 | `agent/graph/nodes/rewrite.py`（🆕） | 一次查询改写（低温 `with_structured_output` → `{rewritten_query, reason}`），写回 state 后边回 `act` | 改写失败 → 保持原结果，不抛异常 |
| 3.3 | `agent/graph/nodes/act.py` | 合并：原命中与新命中按 `chunk_id` 去重，按 score 重排取 `final_top_k` | 去重单测 |
| 3.4 | `agent/graph/builder.py` | **预算**：`rewrite_count` 状态计数达 `RAGF_AGENT_MAX_REWRITES` → 边指向 `abort`（走 `EMPTY_RESULT_MESSAGE` 降级）；整体 `asyncio.timeout` 墙钟兜底；步数/工具次数用 §5.2 的 `ModelCallLimitMiddleware` / `ToolCallLimitMiddleware` 兜底，不自研计数器 | 单测：预算耗尽不死循环 |
| 3.5 | 事件 | `step.name='rewrite'`，`detail` 带触发原因与改写后查询 | SSE 可见 rewrite 步骤 |
| 3.6 | 埋点 | `ragf.agent.rewrites`（counter）、`ragf.agent.steps`（histogram）、`ragf.agent.tool_calls`（counter）、`ragf.agent.duration_seconds` | Grafana 可查 |

**与 CRAG 的差异（有意为之）**：不引入 LLM 逐文档打分（成本 = 文档数 × 调用数）。用**精排分数**这个已有信号做判据，零额外成本。

---

### Phase 4 — 统一与前端

| 编号 | 落点 | 改动 | 验收 |
| --- | --- | --- | --- |
| 4.1 | 可选：`model_provider/providers/chat.py` | 评估是否把 `/chat` 也切到 `ChatOpenAI`，统一两条链路；或反向把 agent 的 tool-calling 下沉到 `provider`（二选一，评审定） | `/chat` 回归全绿 |
| 4.2 | `frontend/src/features/chat/lib/chat-adapter.ts` | 新增 agent 适配（或参数化 endpoint） | 单测通过 |
| 4.3 | `frontend/src/features/chat/components/` | Chat 页加「Agent 模式」开关；steps 面板渲染 `plan` / `tool_call` / `rewrite` | 手动验证 |
| 4.4 | `frontend/src/testing/mocks/handlers/chat.ts` | MSW mock 补 Agent SSE（含 plan/rewrite 步骤） | 前端测试绿 |
| 4.5 | `frontend/src/generated/` | 后端起 8000 → `pnpm generate:api` | 类型对齐 |
| 4.6 | `deploy/backend/grafana/` | Agent 面板：改写率、平均步数、工具调用分布 | 面板可见 |

---

## 6. 契约变更汇总

| 契约 | 变更 | 兼容性 |
| --- | --- | --- |
| `/api/v1/knowledge_bases/{kb_name}/agent` | 🆕 新增 | 非破坏 |
| `/api/v1/knowledge_bases/{kb_name}/agent/stream` | 🆕 新增 | 非破坏 |
| `/chat`、`/chat/stream`、`ChatResponse` | **不变** | 冻结 |
| D25 事件 | `step.name` 新增取值 `plan` / `tool_call` / `tool_result` / `rewrite`；`QueryStepItem` 加可选字段 | 增量（D38） |
| `done` 事件 | 新增可选字段 `agent: {steps_used, rewrites, tool_calls}` | 增量 |
| `rag:kb:agent` | 🆕 权限点 | 需菜单/权限 SQL |
| `RAGF_AGENT_*` | 🆕 6 项配置 | `.env.example` 同步 |
| `pyproject.toml` / `uv.lock` | 🆕 3 个依赖 | 需 CI 重新锁定校验 |
| importlinter | independence + layers + ignore_imports 各加 agent 条目 | 需 CI 复跑 |

---

## 7. 风险与红线

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| 新依赖与现有栈版本冲突 | 🟠 中 | Phase 0.3 `uv tree` 核查；锁定 `>=1.2,<2` / `>=1.4,<2` 上限，避免大版本漂移 |
| LangGraph 事件形态与 D25 契约不匹配 | 🔴 高 | Phase 0.4 先把 `stream_bridge` 做出来并单测；桥接层是唯一允许知道 LangGraph 细节的地方 |
| 两层图调试复杂度上升（LangGraph 的固有代价） | 🟠 中 | 每节点用 `get_stream_writer()` 发 step，轨迹天然可见；配 LangSmith/Langfuse 可选 |
| 循环失控 / 成本爆炸 | 🔴 高 | 三重预算（步数 + 改写次数 + 墙钟）；工具调用数计入审计 |
| 提示注入诱导越权工具调用 | 🟠 中 | 延续 D33：权限检查在 handler 内强制，不放 LLM 侧；工具面只读；KB/文档参数级归属校验 |
| 与 retrieval 的 RRF 逻辑重复造轮子 | 🟡 低 | Phase 2.2 明确「复用检索层既有融合/精排」，agent 层只做去重与编排 |
| 模型不支持 Function Calling | 🟡 低 | `/agent` 明确 400 文案并引导用 `/chat`；`/chat` 完全不受影响 |
| import-linter 豁免滥用 | 🟡 低 | 每条豁免注明 D 编号；核对方向为「下游域 → 上游基础域」 |

**红线**：
1. `stream_bridge` 是**唯一**允许 import LangGraph 类型细节并翻译为 D25 的模块；service 层以上不得出现 LangGraph 概念泄漏。
2. Agent 工具面**只读**（D30），不含任何写路径。
3. 现有 `/chat`、`/chat/stream`、`ChatResponse` 契约冻结（D35）。
4. 权限检查必须在 handler 内强制执行（D33）。
5. D25 事件契约只做增量扩展（D38）。
6. 不引入 DeepAgents（D39）；如确需，单独 PR 评估。

---

## 8. 工作量与建议顺序

| 阶段 | 内容 | 预估 | 依赖 |
| --- | --- | --- | --- |
| Phase 0 | 依赖引入 + 冲突核查 + 事件桥 + spike | 2–3 天 | 无（**先做**） |
| Phase 1 | 域骨架 + 工具面 + 两层图 + 双形态端点 | 4–6 天 | Phase 0 |
| Phase 2 | 规划节点 | 2 天 | Phase 1 |
| Phase 3 | 自省条件边 | 2–3 天 | Phase 2 |
| Phase 4 | 统一 + 前端 + 可观测 | 2–3 天 | Phase 1 起可并行 |

对比 v1（自研循环）：Phase 0 从 1–2 天增至 2–3 天，Phase 1 从 3–5 天增至 4–6 天，多出的成本主要买两样东西——**Phase 3 的自省闭环从「自研状态机」变成「条件边声明」**，以及后续演进（checkpointer、subagent、human-in-loop）的零重构空间。

**建议落地节奏**：Phase 0 + Phase 1 合并为第一个 PR（最小闭环：模型自主决定检索一次并回答），Phase 2/3 各自独立 PR，Phase 4 跟随。

**里程碑验收**：
- M-A：Agent 端点可回答「不需要检索」的问题（自主决策生效，工具零调用）。
- M-B：复杂问句产生 ≥2 子查询并行检索，命中数相比单查询提升。
- M-C：无命中问句触发恰好一次改写重检索，预算耗尽时优雅降级。
- M-D：Agent 全链路 SSE 可观测（plan / tool_call / rewrite 步骤齐全），埋点可在 Grafana 查看。
- M-E：`/chat`、`/chat/stream` 全量回归通过，契约零变化。

---

## 9. 最终文件结构

### 9.1 新增：`backend/src/app/agent/`

```text
backend/src/app/agent/
├── __init__.py
├── api/
│   ├── __init__.py
│   ├── router.py                    # v1 聚合（prefix=FASTAPI_API_V1_PATH，include agent_router, prefix='/knowledge_bases'）
│   └── v1/
│       ├── __init__.py
│       └── agent.py                 # POST /{kb_name}/agent（JSON）+ /agent/stream（SSE）
├── schema/
│   ├── __init__.py
│   └── agent.py                     # AgentParam（ChatParam 超集）/ AgentResponse / AgentRunDetail
├── service/
│   ├── __init__.py
│   ├── agent_service.py             # 门面 astream / acomplete（对齐 chat_service 形态）
│   └── events.py                    # D25 事件构造（meta/citation/delta/usage/done/error）
├── graph/                           # 域内横向包（不受 importlinter layers 约束，类比 ingest/routing）
│   ├── __init__.py
│   ├── builder.py                   # StateGraph 装配 + 条件边 + 节点策略（Timeout/Retry/Cache）
│   ├── state.py                     # AgentState（TypedDict + operator.add reducer）
│   ├── stream_bridge.py             # ★ LangGraph 事件 → D25 事件（唯一可泄漏框架细节的模块）
│   ├── prompts.py                   # planner / reflector / answer 三套提示词
│   ├── tools.py                     # 5 个只读工具（LangChain @tool 包装 mcp toolkit 语义）
│   └── nodes/
│       ├── __init__.py
│       ├── plan.py                  # 规划节点（结构化输出 → sub_queries）
│       ├── act.py                   # 检索节点（透传 query_texts，不做合并）
│       ├── grade.py                 # 自省判据（条件边判断函数）
│       ├── rewrite.py               # 查询改写
│       └── generate.py              # 上下文组装 + 流式生成
├── model/
│   ├── __init__.py                  # 必须聚合导出全部模型类（backend AGENTS.md 铁律 4）
│   └── agent_run.py                 # agent_runs 表
└── tests/
    ├── __init__.py
    ├── test_agent_api.py
    ├── test_agent_service.py
    ├── test_tools.py
    ├── test_graph_plan.py
    ├── test_graph_grade.py
    └── test_stream_bridge.py        # ★ 契约测试：桩图 → 断言 D25 事件序列
```

### 9.2 修改（9 处）

| 文件 | 改动 |
| --- | --- |
| `backend/pyproject.toml` | 依赖 +3；independence `modules` +1；新增 agent `layers` 契约；`ignore_imports` +4 条（注明 D34/D37） |
| `backend/uv.lock` | 重新锁定 |
| `backend/src/app/router.py` | `+ from ...agent.api.router import v1 as agent_v1` / `router.include_router(agent_v1)`（1 行 import + 1 行挂载） |
| `backend/src/core/config.py` | `RAGF_AGENT_*` 6 项（插在 chat 配置块之后） |
| `backend/src/.env.example` | 同步 6 项 |
| `backend/src/app/kb/utils/permissions.py` | `+ RAG_KB_AGENT = 'rag:kb:agent'`，并加入 `__all__`；评估是否进 `RAG_KB_READ_SCOPES` |
| `backend/src/sql/postgresql/init_test_data.sql` | 菜单/权限 seed 增一行 |
| `backend/src/app/retrieval/service/retrieval_service.py` + `strategies/{hybrid,vector}.py` | D41：`ctx` 支持 `query_texts: list[str]`（向后兼容 `query_text`） |
| `frontend/src/features/chat/{lib/chat-adapter.ts,components/*}` + `testing/mocks/handlers/chat.ts` + `src/generated/` | Agent 模式开关、step 渲染、mock、代码生成 |

### 9.3 不动（明确边界）

`backend/src/app/chat/**`（契约冻结，D35）、`backend/src/app/mcp/**`（工具语义被复用但不改）、`backend/src/app/ingest/**`、`backend/src/app/model_provider/**`（首版不改，Phase 4.1 再评估统一）。

---

## 10. Yuxi 可搬运清单

Yuxi 为 MIT，可安全借鉴。按「搬运成本」排序：

### 10.1 直接搬（改 import 与常量即可用）

| Yuxi 文件 / 符号 | 内容 | 落到哪 |
| --- | --- | --- |
| `agents/toolkits/registry.py`（全文 90 行） | `@tool` 扩展装饰器 + 全局工具注册表（`_all_tool_instances` / `_extra_registry`），自动收集工具实例并挂 `handle_tool_error=True` | `agent/graph/tools.py`：删掉 `icon`/`tags` 等 UI 字段，**增加 `required_perms` 字段**承载 D33 权限点 |
| `agents/base.py::_json_safe`（~15 行） | 任意对象 → JSON 安全结构（`model_dump` / dict / list 递归，兜底 `str`） | `agent/graph/stream_bridge.py` |
| `agents/base.py::_recursion_limit_from_context`（5 行） | context 取 `max_execution_steps` → `recursion_limit` | `agent/graph/builder.py`，改读 `settings.RAGF_AGENT_MAX_STEPS` |
| `agents/buildin/chatbot/prompt.py::build_prompt_with_context` | system prompt 拼装结构（当前日期 + 主体 + 上下文段） | `agent/graph/prompts.py`，**删掉文件系统约束段**（RAG-F 无沙盒） |

### 10.2 改造搬（拿结构、去业务）

| Yuxi 文件 / 符号 | 可搬的部分 | 必须删掉的部分 |
| --- | --- | --- |
| `agents/base.py::_stream_input_with_state`（~110 行） | **`stream_bridge` 的最佳蓝本**：`graph.astream_events(version="v3", transformers=[...])` 的调用姿势 + 事件分类（`custom` / `messages` / `values` / `tasks` / `tools` / `lifecycle`）+ `finally` 里取消路由任务 | `namespace` / `subagent_route` / `thread_id` 路由（RAG-F 无子图无 checkpointer） |
| `agents/base.py::_normalize_tool_event_data`（~25 行） | 返回 `Command` 的工具，其 `tool-finished.output` 是 Command 对象，需从 `Command.update["messages"]` 取出真正的 `ToolMessage` 才能与工具调用关联 | 我们不用 `write_todos`，但 LangGraph 里 `Command` 返回模式通用，**建议保留**以防后续加工具 |
| `agents/toolkits/kbs/tools.py`（498 行） | 工具的**签名设计与描述措辞**（`query_kb` / `open_kb_document` / `find_kb_document` 的 docstring 写法、「何时用此工具」的说明方式） | 实现体（Yuxi 直连其 knowledge 门面；RAG-F 复用 `mcp/service.py` 的 5 个 ToolSpec 语义） |
| `agents/context.py::BaseContext` | 「context 携带工具白名单 + UI 元数据」的设计思路 | 整套 `metadata` 配置面板机制（RAG-F 工具固定 5 个，无需用户勾选） |
| `agents/toolkits/kbs/tools.py::_find_query_target` | **参数级授权**模式：校验 `kb_id` 在当前会话可见集合内，防工具版 IDOR（D33 同款要求） | 具体实现（RAG-F 用 `kb/deps.py` 的 Scope） |

### 10.3 只抄思路，不搬代码

| Yuxi | 思路 | RAG-F 的对应 |
| --- | --- | --- |
| `agents/buildin/chatbot/graph.py::_build_middlewares` | 中间件分层：steer → filesystem → skills → memory → subagent → summary → todo → patch → retry → token_usage | 保留 **retry / token_usage** 两类；todo 延后（§5.1）；其余不采 |
| `agents/middlewares/summary.py`（756 行） | 上下文超阈值自动摘要 | 需要时用 LangChain 自带 `SummarizationMiddleware`，**不搬这个 DeepAgents 适配层** |
| `agents/buildin/subagent/graph.py` | 子智能体：独立 thread + 独立工具白名单 | 后置演进项，本期不做 |

### 10.4 明确不搬

`agents/backends/sandbox/**`（沙盒文件系统）、`agents/skills/**`（Skills 安装/运行时，1784 行）、`agents/middlewares/subagent_task.py`（子智能体工具）、`agents/middlewares/steer.py`（人工打断）、`agents/tool_approval.py`（工具审批，RAG-F 工具只读无破坏性操作）、`agents/backends/composite.py`、`knowledge/chunking/ragflow_like/**`（RAG-F 已有 Knowhere 解析链）。

**搬运总量估计**：真正逐行搬的约 **120 行**（registry.py 90 + `_json_safe` 15 + `_recursion_limit` 5 + prompt 结构 10），改造搬约 **150 行**（`stream_bridge`）。其余是设计与措辞参考。这也印证了 §1 的结论：**深度绑定 Yuxi 的代码反而搬不动，能搬的是它踩过的坑**。

---

## 11. 相关文档

- `docs/specs/2026-08-21-agentic-rag-系统设计.md` —— Agent 层原始设计（已评审待实现）
- `docs/specs/2026-09-05-agent-layer-and-mcp-design.md` —— D18/D24/D25/D30/D33 出处
- `docs/RAG_core/02_检索与问答设计.md` —— 检索主干现状
- 参照实现：Yuxi `backend/package/yuxi/agents/`（MIT，`create_agent` + LangChain 中间件）

---
