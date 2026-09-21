---
title: 后端接口测试规范
description: KnowledgeRAG-OGAS 后端接口（API）自动化测试方案——权限控制三层矩阵与 RAG 全链路闭环
status: 已落地（首批：基建 + 权限矩阵 + RAG 链路 + 工具面）
date: 2026-09-21
supersedes: 2026-09-06-e2e-test-spec.md
---

# 后端接口测试规范（Spec）

## 0. 文档信息

| 项 | 内容 |
| --- | --- |
| 状态 | 已落地（P0/P1/P2 + chain 四批，代码即规格本体） |
| 批次 | 基建 → 权限矩阵（P0）→ 文档/检索（P1）→ RAG 链路/SSE（chain）→ MCP/供应商（P2）；每批一个 commit |
| 日期 | 2026-09-21 |
| 范围 | 后端 HTTP 接口的运行期行为：权限控制、RAG 全链路、契约信封、SSE/JSON-RPC 协议面 |
| 代码位置 | `backend/e2e/` |
| 技术栈 | pytest + anyio（asyncio）+ httpx ASGITransport |
| 取代 | `2026-09-06-e2e-test-spec.md`（该文档规划「打 localhost:8000 的套件」，未实现；本规范改为进程内 ASGI 栈） |

## 1. 定位与设计取舍

本规范只解决一件事：**在真实依赖栈上，用真实身份打真实 HTTP，验证接口行为契约。**

三条取舍（项目未上线，不做冗余兼容）：

1. **只测 canonical 端点。** 已被取代的旧端点（如 `/knowledge_bases/{kb_name}/search` 之于 `/rag/search`）不写兼容用例，反而显式断言其**不存在**。
2. **不重复 L1 契约测试。** 路由权限码声明、RBAC 顺序已由域内 `*_tests/test_route_permissions.py` 静态反射覆盖，本套件只补**运行期行为**。
3. **不覆盖 fba 模板自带能力。** admin 系统管理（部门/菜单/数据规则/日志/监控）、插件、Task 调度不在范围内；登录接口也不在（验证码 + 限流，且属 admin 域），token 一律由身份工厂直签。

## 2. 分层模型

| 层 | 测什么 | 已有覆盖 | 本规范 |
| --- | --- | --- | --- |
| L1 契约/结构 | 路由声明的权限码与顺序、schema 校验器 | ✅ `test_route_permissions.py`、`test_acl_schema.py` | ❌ 不重复 |
| L2 接口行为 | 真实 HTTP：鉴权、信封、错误码、过滤、SSE 事件行 | 仅 chat/agent 罐头冒烟（override 掉了鉴权与 scope） | ✅ 主体 |
| L3 业务链路 | 上传 → 摄取 → 检索 → 问答 → 引用回查 | ❌ 无 | ✅ 主体 |

L2 与 L3 的差别不是「快慢」，而是**断言对象**：L2 断言单个响应，L3 断言跨请求的状态迁移与引用可溯源。

## 3. 测试基建

### 3.1 运行目标与前置

- 数据库：`ragf_test`（`get_database_url(unittest=True)`），由 `backend/conftest.py` 的 `app.dependency_overrides[get_db]` 注入。
- 依赖：PostgreSQL + Redis + Milvus + MinIO（`task deps-up`）；`chain` 用例额外需要 Celery Worker（`task worker`）与可用模型供应商。
- **必须先起依赖栈**：`import backend.main` 会走插件发现，Redis 不可达时 `RedisCli.init` 直接 `sys.exit`（框架 fail-fast）。这不是可跳过项。
- `backend/e2e/conftest.py` 幂等 bootstrap（DB 不存在则建 → `create_all` → 种子数据），不依赖 `task init-db`。
- **不连 dev 库**：避免 e2e 污染 `ragf`，也避免与单测争抢同一份数据。

`backend/pyproject.toml` 的 `[tool.pytest.ini_options]` 把 `testpaths` 限定为 `src`：裸 `pytest`（`task backend:test`）不会误跑 e2e；e2e 需显式传路径。

### 3.2 HTTP 层：单事件循环

- 用 `httpx.AsyncClient(transport=ASGITransport(app))` 在进程内打真实 ASGI 栈（中间件/依赖/路由全走），不需要 uvicorn。
- lifespan 由 session 级 async fixture 进入一次。anyio 的 pytest 插件用带引用计数的模块级 runner（`anyio.pytest_plugin.get_runner`）：session 级 async fixture 持有租约 ⟹ **全场共用一个事件循环**，DB/Redis/Milvus 连接不会跨循环失效。
- 不用 `TestClient`：它是同步的，与 `asyncio.run()` 造数落在两个事件循环上，asyncpg/redis 连接跨循环会炸（`chat/tests/test_chat_api.py` 的注释已踩过这个坑）。

### 3.3 身份工厂（权限测试的命门）

权限链的读取点：`get_user_context` 读 `request.user`、`rbac_verify` 读 `request.user.roles[].menus[].perms`、`resolve_kb_perm` 读 `user_id/dept_id/roles`、`expand_principals` 走 `sys_dept` 祖先链。

因此：

- **override `jwt_authentication_verify` 不足以测权限。** chat/agent 的罐头冒烟之所以能跑，是因为它们连 `get_retrieval_scope` 也换掉了，等于把 ACL 整层跳过。本套件**不 override 任何鉴权依赖**。
- 身份构造 = seed 真实 `sys_dept` / `sys_user` / `sys_user_role` / `sys_role` / `sys_role_menu` 行 + 调真实 `create_access_token(user_id)`（写 `TOKEN_REDIS_PREFIX:{user_id}:{uuid}` 会话键）。
- 造完用户必须清 `JWT_USER_REDIS_PREFIX:{user_id}` 缓存，否则读到脏用户。
- 造数事务必须在 `yield` **之前提交**（fixture 用 try/finally）：请求侧走另一个连接，未提交的行对应用不可见。

主体集合（`backend/e2e/support/identity.py`）：

| 主体 | 部门 | 角色 | is_staff | is_superuser | 用途 |
| --- | --- | --- | --- | --- | --- |
| `owner` | alpha | 全量 RAG 角色 | ✅ | ❌ | 建库即 Owner，承担所有合法写操作 |
| `mate` | alpha | 全量 | ✅ | ❌ | 同部门但无 ACL 条目 → default deny |
| `outsider` | beta | 全量 | ✅ | ❌ | 跨部门无授权 → 不可见 |
| `reader` | beta | 全量 | ✅ | ❌ | KB ACL `read` → 读通过/写 404 |
| `contributor` | beta | 全量 | ✅ | ❌ | KB ACL `contribute` → 上传通过/管理 404 |
| `manager` | beta | 全量 | ✅ | ❌ | KB ACL `manage` → 管文档/改 ACL 404 |
| `readonly_role` | beta | 只读角色（仅读面菜单） | ✅ | ❌ | 资源权限给足仍缺功能码 → **403** |
| `dept_child` | beta_child | 全量 | ✅ | ❌ | 部门祖先链授权 |
| `superuser` | alpha | 全量 + `is_superuser` | ✅ | ✅ | 免 RBAC，但不免资源权限 |

`JWT scp claim` 只由外部 IdP/PAT 桥接产生，API 面不会签发 —— MCP 用例用 `identity.mint_token(..., scp=[...])` 用同一密钥补签（会话键与 fba 同源，否则 MCP 会话校验 fail-closed）。

### 3.4 唯一允许的替身：外部 LLM 网关

检索链路的 embedding / rerank / chat 都是**第三方服务**（dashscope 等），不可控且不确定。本套件只在一个地方打替身：

- `chat_service._chat_gateway`（外部 LLM 边界），替换为 `support/fake_llm.py` 的确定性实现，且**仅在需要断言回答/事件负载的用例里**用，并在请求里显式带 `model`（否则 `RAGF_CHAT_MODEL_SPEC` 空 → 走 `MODEL_NOT_CONFIGURED` 分支）。
- 替身同时把「模型实际收到的 messages」录下来：**引用闭环的真断言是「引用正文真的进了提示词」**，而不是「模型回了什么」（那是模型的行为，不是本项目的契约）。
- embedding / rerank **不打替身**：检索语义（召回、精排、ACL 下推）正是被测对象。

### 3.5 造数与隔离

- 每个用例用独立 KB：`e2e_{uuid4().hex[:8]}`（匹配 `kb_name` 的 `^[a-z0-9_]+$`）。
- 造数与清理全部走接口，只在 teardown 级联删除 KB（`DELETE /knowledge_bases/{kb}`）。
- 用户 / 部门 / 角色为 session 级共享，前缀 `e2e_`，session 结束时清理。

### 3.6 跳过规则

| 条件 | 行为 |
| --- | --- |
| PG 不可达 / `ragf_test` 建不出来 | 整包 `skip`，附原因 |
| lifespan 起不来（Milvus/MinIO/PG 异常） | 整包 `skip`，附原因 |
| Celery Worker 不可达（`inspect().ping()` 无响应） | 仅跳过 `chain` 用例 |

## 4. 权限控制测试矩阵（重点）

### 4.1 三层模型与失败形态

| 层 | 实现 | 失败形态 | 用例锚点 |
| --- | --- | --- | --- |
| 租户边界 | `resolve_namespace` / `instance_namespace` | 403 | `X-Plugin-Namespace` 与实例不一致 |
| 功能权限 | RBAC 权限码 `rag:kb:*` + `sys_menu.perms` | 403 | 只读角色做写操作 |
| 资源权限 | `Perm` 求值 read < contribute < manage < owner | **404** | 无 ACL 主体读写 |
| 数据权限 | 文档级 `visibility/owner_id/groups` → Milvus 表达式 | 结果集变空 | 同 KB 内文档不可见（本项目未覆盖，见 §8） |

**404 而非 403 是刻意的**（D50 不泄露存在性）：资源级不足与「KB/文档不存在」必须**同形态**，这条要显式断言两边响应体一致（`test_absent_and_denied_kb_are_indistinguishable`）。

**一处刻意的口径差异**：资源权限不足 → 404；但 `/rag/search` 的 `kb_names` 显式越权 → **403**（`build_retrieval_scope` 求交失败，保留批量检索的诊断语义）。`/chat`、`/agent` 则是 404。

### 4.2 求值不变量（`evaluate_kb_perm` 纯函数语义）

每条一个用例（`test_permissions_e2e.py` 直调求值函数），关键语义再经 HTTP 复验：

1. default deny：无任何条目 → 不可见（v1「ACL 表为空 = 全放开」的兜底已移除，D45）
2. `deny` 优先于一切 `allow`，**包括 user 直接 allow**
3. `allow` 取最高级
4. user 主体授权覆盖 role/dept/group 的结果
5. `kb.owner_id == user` → OWNER
6. `is_public` → 至少 READ，**但仍受 deny 约束**
7. `expires_at <= now` 的条目被忽略（过期即失效）
8. 部门**祖先链**：授权给父部门，子部门用户可见
9. 非参与主体（不在主体集内）的条目被忽略

### 4.3 接口 × 主体矩阵

`✅` = 成功；`404` / `403` = 失败形态。`reader`/`contributor`/`manager` 的 ACL 由 owner 通过 `PUT /{kb}/acl` 授予，**授权本身也是被测路径**。

| 动作 | owner | reader | contributor | manager | mate | outsider | readonly_role |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /knowledge_bases` 列表可见 | ✅ 含 | ✅ 含 | ✅ 含 | ✅ 含 | ❌ 不含 | ❌ 不含 | ✅ 含 |
| `GET /knowledge_bases/{kb}` | ✅ | ✅ | ✅ | ✅ | 404 | 404 | ✅ |
| `POST /knowledge_bases`（建库） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **403** |
| `POST /{kb}/documents`（上传） | ✅ | 404 | ✅ | ✅ | 404 | 404 | **403** |
| `PATCH /documents/{id}` | ✅ | 404 | 404 | ✅ | 404 | 404 | **403** |
| `DELETE /documents/{id}` | ✅ | 404 | 404 | ✅ | 404 | 404 | **403** |
| `GET /documents`（列表，功能码 `rag:kb:list`） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /documents/{id}/chunks`（功能码 `rag:kb:read`） | ✅ | ✅ | ✅ | ✅ | 404 | 404 | ✅ |
| `PATCH /knowledge_bases/{kb}`（含 `is_public`，资源级 **owner**） | ✅ | 404 | 404 | 404 | 404 | 404 | 404 |
| `PUT /knowledge_bases/{kb}/acl`（功能码 `rag:kb:acl` + **owner**） | ✅ | 404 | 404 | 404 | 404 | 404 | **403** |
| `DELETE /knowledge_bases/{kb}` | ✅ | 404 | 404 | 404 | 404 | 404 | 404 |
| `POST /{kb}/transfer`（功能码 `rag:kb:transfer`） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **403** |

最后一行是**刻意的设计口径**：转移所有权不做资源级 `== owner` 校验（目标场景是旧 Owner 已不可用），权限边界就是功能码本身。矩阵里所有持码主体都能转移别人的库——这条被用例显式钉住（`test_transfer_is_gated_only_by_functional_code`），将来若收紧资源校验，用例会红，属有意信号。

### 4.4 越权路径清单

刻意构造的「坏事」，每条一个用例：

- `/rag/search` 的 `kb_names` 混入无权 KB → 403（且不返回任何结果）。
- 客户端传 `filters` / 任何过滤语义都**不得提权**——scope 由服务端构建。
- 无功能权限码的只读角色执行写操作 → 403（而非 404），与资源权限的 404 形成对照。
- `superuser` 免 RBAC，但不免资源权限（仍拿 404）。
- `X-Plugin-Namespace` 显式传非实例域 → 403；传实例域本身 → 放行。
- 非 owner 改 ACL 想给自己发 `owner` → 404（不能通过改 ACL 提权）；ACL 全量替换语义：清空即回收。
- 文档级 ACL 写入约束：只接受 `user|dept` + `allow` + `perm=read` + 无 `expires_at`，其余组合被写入侧 schema 拒绝（422）。
- MCP：`tools/list` 只返回 `scp` 允许的工具；`tools/call` 越权返回稳定错误码 `PERMISSION_DENIED`（JSON-RPC error，不是 HTTP 4xx）。
- 模型供应商：读路由仅需登录态，写路由要求 `sys:model-provider:*` 功能码（只读角色 → 403）。

### 4.5 MCP 工具面（`scp` 是唯一鉴权依据，`test_mcp_e2e.py`）

`/mcp` 不套统一信封、不吃 RBAC 菜单，鉴权与授权全在端点层归一：工具可见性与可调用性
只由凭证里的 `scp` 决定（D30「不发明第二套权限模型」——`scp` 的值就是 `rag:kb:*` 权限码）。

| 面 | 口径 | 用例锚点 |
| --- | --- | --- |
| 传输 | JSON-RPC 2.0 子集；`id` 缺省 = notification（202 空体，且**先于鉴权**短路） | `test_notification_gets_202_without_body` |
| 传输负例 | 非 2.0 / 批量数组 → 400 `-32600`；坏 JSON → 400 `-32700`；未知方法 → `-32601`；GET 会话 → 405 | `test_batch_request_is_rejected` 等 |
| 鉴权 | 401 必带 `WWW-Authenticate: Bearer realm="ragf-mcp"`；JWT 需**会话键存活**（撤销即时生效）+ `tenant` claim 与实例域一致 | `test_jwt_without_live_session_is_401` |
| 授权 | `tools/list`/`GET /mcp/tools` 按 `scp` 过滤并回带 `required_permissions`；缺失 → `data.code=PERMISSION_DENIED` | `test_catalog_is_filtered_by_scope` |
| 工具错误码 | 工具失败**不占 HTTP 状态码**（恒 200），靠 `error.data.code` 表达：`UNKNOWN_TOOL`/`INVALID_REQUEST`/`KB_NOT_FOUND`/`DOCUMENT_NOT_FOUND` | `test_unknown_tool_is_unknown_tool_code` |
| 工具语义正例 | `get_document`/`read_document_chunks` 在**未摄取**（`pending`）时也可用：元数据可溯源、窗口为空但形状完整 | `test_get_document_returns_registered_document` |

`scp` 由外部 IdP / PAT 桥接产生，API 面不签发，故用 `identity.mint_token(sub, scp=[...])` 补签；
这与真实调用方的凭证形态一致（Codex/Claude Code 走的就是这条通道），不是「测试专用旁路」。

## 5. RAG 流程测试矩阵（重点）

### 5.1 主链路（L3，`chain`）

`上传 → 登记 → 触发摄取 → 轮询 ready → 检索 → 问答 → 引用回查`

| 阶段 | 接口 | 断言 |
| --- | --- | --- |
| 上传 | `POST /knowledge_bases/{kb}/documents` | `status=pending`、`document_id`、`sha256` 64 位、`source_uri` 非空 |
| 上传负例 | 同上 | 格式子集外 **415**；空文件 **400**；超限 **422**（结构化 detail，`code=file_too_large`） |
| 触发 | `POST /{kb}/documents/{id}/ingest` | `queued=true` |
| 状态 | `GET /{kb}/documents/{id}/status` | 轮询到 `ready`，状态不回退 |
| 检索 | `POST /rag/search` | `sources.text` 非空、`route.selected` 含 `text`、`chunk_id` 形如 `{doc}:{ver}:{idx}`、`steps` 含 recall/rerank/hydrate |
| 问答 | `POST /{kb}/chat` | `citations[].n == 1..N`、`reason=complete`、`answer` 与引用一致 |
| 引用闭环 | `GET /documents/{id}/chunks` | `citations[].chunk_id` 能取回同一段正文，且该正文**确实进了模型提示词** |

**引用闭环是 L3 的核心断言**——它是唯一能证明「带引用问答」真的成立的检查，也是最容易被省略的一步。

### 5.2 异步收敛

- 轮询 + 超时（120s，间隔 1s），禁止固定 `sleep`。
- 终态集合：`ready / parsing_failed / indexing_failed / failed`；非 `ready` 终态直接失败并带出 `error_message`（不静默跳过，否则链路用例假绿）。
- 状态迁移单调，不允许从 `ready` 回退。

### 5.3 流式协议（SSE）

- `content-type: text/event-stream`；事件名与**顺序**：`step* → meta → citation → delta* → usage → done`。
- 无命中 → `meta.hit_count == 0`、`citation.citations == []`、`done.reason == empty_result`；**delta 仍会出现一次**，内容为约定文案 `EMPTY_RESULT_MESSAGE`（短路不调用模型，但事件形状与有命中分支保持一致——客户端不必写两套渲染）。
- 语义/上游错误 → `error` 事件（含 `code`/`msg`/`trace_id`），**不是 HTTP 错误体**，状态码仍是 200。
- 未授权 KB → HTTP 404（在流开始前判定，不是 `error` 事件）。
- **同源断言**：`delta` 拼接文本 == `done.answer` == 非流式 `/chat` 的 `answer`。

### 5.4 幂等 / 版本

- 同文件（同 `sha256`）二次上传 → 409 去重。**注意指纹是摄取成功后登记的**（D9：失败摄取不残留指纹挡重传），所以去重用例必须先跑通一次摄取。
- `POST /{kb}/rebuild` → `dispatched + skipped == total`；重摄取后文档回到 `ready` 且分块内容仍在。
  **不测版本号递增**：`Document.active_version` 是 Phase 2 占位（默认 1，摄取链路不递增），
  重摄取复用同一 `version_id`，见 §8。
- **不测「摄取中重复触发 409」**：文档在 worker claim 前状态一直是 `pending`，此时重复触发是合法入队（幂等）。409 只在 `parsing/indexing` 窗口内出现，测试侧无法确定性地卡进那个窗口，写这种用例只能是 flaky。

### 5.5 降级可观测（未覆盖）

精排失败降级（`degraded=true`）、视觉召回失败（`visual_degraded=true`）需要**故意打断外部模型**才能触发，本套件不打这个替身（见 §3.4）。这些路径由域内单测覆盖，接口层暂不锁。

## 6. 运行方式与 markers

```bash
# 依赖栈（PG / Redis / RabbitMQ / Milvus / MinIO）
task deps-up

# 接口行为面（无需 worker、无需外部模型）
cd backend && .venv/bin/pytest e2e/ -m "not chain"

# 全量（含 RAG 链路；worker 未起时 chain 用例自行 skip）
task worker                      # 另开一个终端
cd backend && .venv/bin/pytest e2e/

# 等价入口（Taskfile）；追加参数走 `--`
task backend:e2e -- -m p0

# 按优先级
cd backend && .venv/bin/pytest e2e/ -m p0
```

markers（注册在 `backend/pyproject.toml`）：

| marker | 含义 | 涉及模块 |
| --- | --- | --- |
| `p0` | 冒烟：基建自检 + 权限矩阵 | `test_auth_e2e.py`、`test_permissions_e2e.py` |
| `p1` | 回归：文档/检索接口行为与 RAG 链路 | `test_documents_e2e.py`、`test_search_e2e.py`、`test_rag_pipeline_e2e.py`、`test_chat_stream_e2e.py` |
| `p2` | 扩展：MCP 工具面、模型供应商 | `test_mcp_e2e.py`、`test_model_provider_e2e.py` |
| `chain` | 需要 Celery Worker 与外部模型供应商 | `test_rag_pipeline_e2e.py`、`test_chat_stream_e2e.py` |

## 7. 非目标

- 不测旧端点 / 不做接口版本兼容（旧路径显式断言不存在）。
- 不重复 L1 静态契约（权限码声明、RBAC 顺序）。
- 不覆盖 admin 系统管理、插件、Task 调度、登录流程。
- 不打 embedding / rerank 替身；模型**连通性**与降级路径（`test-connection` 真实返回）不在接口层锁。
- 不做前端 UI 测试（前端 Playwright + MSW 打的是 mock，属另一条线）。
- 不追求覆盖率数字，只锁定行为契约。

## 8. 已知缺口

- **MCP 工具体不做 KB ACL 求值（最高优先级）**：`mcp/service.py` 的 `_ensure_kb` 只校验
  「KB 属于本租户」，`get_document` / `read_document_chunks` 直接取文档，完全不走
  `build_retrieval_scope`。后果：同租户任意用户凭**默认** `scp`（读面四点）即可读到无权
  KB 的文档元数据与片段——D33 要求的「`kb_id`/`document_id` 参数级归属校验」只做了一半。
  三条用例以 `xfail(strict=True)` 钉住（`test_get_document_ignores_kb_acl`、
  `test_read_document_chunks_ignores_kb_acl`、`test_list_knowledge_bases_is_not_acl_filtered`）。
- **MCP `list_knowledge_bases` 列整租户**：工具元数据写「列出当前身份可见 KB」（D21），实现是
  `knowledge_base_dao.list_all(tenant)`，与 `GET /knowledge_bases` 的 `resolve_visible_kbs`
  口径不一致（库名/展示名/文档数泄露）。
- **MCP `search_knowledge` 的混合 `kb_names` 静默收窄**：实现用集合求交
  （`requested ∩ scope.allowed_kbs`），请求里混入无权库时**丢弃**它继续检索；
  `/rag/search` 同场景是 403。调用方（LLM）因此会在「少搜了库」的情况下拿到看似成功的回答。
  用例 `test_mixed_kb_names_is_narrowed_not_denied`（`xfail(strict)`）。
- `xfail(strict=True)` 的用法约定：这些缺口修复后会 XPASS → 用例失败，逼迫同步更新本 §8
  与 §4.5，不允许静默变更行为。
- **MCP PAT 通道当前不可用**：`RAGF_MCP_PAT` 默认为空，PAT 分支从未生效（本体是常量时间比对 +
  免会话）。套件只覆盖 JWT 直通；PAT 通道要等桥接进程落地后再补用例（否则测的是配置默认值）。
- **MCP 限流是每进程共享的 Redis bucket**（`RAGF_MCP_RATE_LIMIT_PER_MINUTE=120`，按
  `tenant+sub` 计）。同一分钟内重复跑 `-m p2` 会累计到同一桶，极端情况下 429；
  用例已按主体分散调用，正常单次运行远低于阈值。
- **`import backend.main` 需要 Redis**：插件发现在导入期同步连 Redis，失败即 `sys.exit()`。因此 e2e 套件的「跳过」只覆盖 lifespan/DB 层，导入期不可达属硬前置（`task deps-up`）。同因，`backend/conftest.py` 在无 Redis 环境下会直接终止整个收集阶段——所有 `backend/src/**/tests` 都受影响，不只是本套件。
- `backend/conftest.py` 的 `token_headers` fixture 打的是 `/auth/login/swagger`，该路由在代码中已不存在（仅存在于 `TOKEN_REQUEST_PATH_EXCLUDE` 配置里），fixture 实际失效。本套件不复用它，自带身份工厂。
- **版本化未实现**：`Document.active_version` 是 Phase 2 占位（`model/document.py` 注释即写明「默认 1」），
  摄取链路从不递增它，重摄取覆盖同一 `version_id`。因此「多版本共存 / 旧版本回查」在接口层无法验证，
  本套件只锁 `chunk_id` 的 `{document_id}:{version_id}:{idx}` 形态与「引用可在 PG 事实源逐字回查」。
- 数据权限层（文档级 `visibility` 下推 Milvus 表达式）只有 L1 schema 与域内单测覆盖，接口层未锁（需要构造多文档 + 不同可见性 + 检索召回结果集的对比）。
- 降级路径（精排/视觉）未在接口层覆盖，见 §5.5。
- `backend/e2e/` 尚未接入 CI（`.github/workflows/` 现只有架构契约与文档站）；L3 需要 PG/Milvus/MinIO/Redis + worker + 模型密钥。
