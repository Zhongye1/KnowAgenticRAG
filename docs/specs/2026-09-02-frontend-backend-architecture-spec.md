---
title: 前后端基础架构 Spec
description: RAG-F（KnowledgeRAG-OGAS）当前前端与后端的基础架构说明、分层、关键链路与现状缺口
status: 初稿
date: 2026-09-02
---

# RAG-F 前后端基础架构

> 配套架构图：`docs/specs/2026-09-02-前后端基础架构.hierarchy.md`（Obsidian Excalidraw，需在 Obsidian 中切换 Excalidraw 视图查看）。

## 1. 背景与目标

本文档描述 RAG-F 目前真实落地的前后端基础架构，作为新成员上手、模块设计和评审的基准。范围包括：

- 前端（React 19 + Vite + TypeScript）的分层与数据流
- 后端（FastAPI + SQLAlchemy + Celery）的应用组装、模块划分与分层
- 数据与基础设施（PostgreSQL / Redis / RabbitMQ / Milvus / MinIO / 可观测栈）
- 关键链路（请求、文档上传、异步任务、可观测）
- 现状与已知缺口（与 README / 设计文档不一致、尚未落地模块）

## 2. 系统总览

RAG-F 是面向个人与团队的私有知识管理平台：前端单页应用通过 REST API 访问后端，后端负责
认证/权限、知识库与文档管理、任务调度，RAG 摄取/检索/生成管线尚未落地（见 §9）。

```text
浏览器
  │  HTTPS / HTTP
  ▼
Nginx（:8000，静态资源 + 反向代理）
  │  /api/v1
  ▼
FastAPI 后端（ragf_server，容器内 :8001 / 开发直跑 :8000）
  ├── admin（认证、RBAC、用户/角色/菜单、日志）
  ├── kb（知识库、文档、去重、标签、Milvus 隔离）
  ├── task（Celery 任务控制/结果/调度）
  └── plugin（config/dict/email/notice/oauth2 插件）
  │
  ├──→ PostgreSQL 16（业务元数据 + Celery 结果）
  ├──→ Redis 7（缓存/会话/在线/Pub-Sub）
  ├──→ RabbitMQ 3.13（Celery Broker）→ Celery Worker/Beat
  ├──→ Milvus 2.5 + etcd（向量集合 ragf_text / ragf_visual）
  ├──→ MinIO（文档对象存储，bucket ragf-kb）
  └──→ OTel → Alloy → Loki / Prometheus / Tempo → Grafana
```

开发约定：依赖跑 Docker 容器，代码跑宿主机；统一入口 `Taskfile.yml`（`task init` / `task dev` / `task worker`）。

## 3. 前端架构

### 3.1 技术栈

| 领域 | 选型 | 说明 |
| --- | --- | --- |
| 语言/构建 | TypeScript + Vite | `frontend/vite.config.ts`，dev 端口 5000 |
| UI | React 19 + Tailwind CSS 4 + Radix | 设计 Token 统一维护在 `frontend/src/styles/tokens.css`（Arco 语义色），`pnpm check:tokens` 强制 |
| 路由 | React Router 7 | `createBrowserRouter` + `lazy` + `clientLoader`，见 `frontend/src/app/router.tsx` |
| 服务端状态 | TanStack Query 5 | query 配置在 `frontend/src/lib/react-query.ts`，Provider 在 `frontend/src/app/provider.tsx` |
| API 客户端 | axios | `frontend/src/lib/api-client.ts`：`baseURL=env.API_URL`、JWT 存 localStorage、401 单飞自动刷新、失败跳登录 |
| 校验 | zod | 环境变量（`src/config/env.ts`）、表单/API 边界 DTO |
| 测试 | Vitest + Testing Library + MSW | 单元/组件；`frontend/e2e` Playwright；Storybook |
| API 契约 | OpenAPI 生成 | `frontend/src/generated/`（`pnpm generate:api`，源 `http://127.0.0.1:8000/openapi`） |

### 3.2 分层与依赖方向

```text
main/index.tsx（最薄入口）
  → AppProvider（组合根：QueryClient / ErrorBoundary / Helmet / Notifications）
    → Router（createBrowserRouter + lazy + loader 鉴权）
      → 布局 AppRoot（ProtectedRoute）→ 页面（只做组装）
        → Feature 层（features/<name>/api + components + hooks）
          → lib/api-client（axios）→ 后端 /api/v1
```

单向依赖：页面 → feature → api 客户端 → 后端；禁止反向。全局实例（QueryClient）只在组合根创建。

### 3.3 目录结构（要点）

```text
frontend/src/
├── app/            # 组合根、router、routes（landing/auth/app/*）
├── components/     # 通用组件（ui、layouts、Navbars、错误边界）
├── config/         # env.ts、paths.ts（路由路径唯一真源）
├── features/       # auth / comments / discussions / home / knowledge / teams / users
├── generated/      # OpenAPI 生成的类型与 hooks（自动生成，勿手改）
├── hooks/ lib/     # 通用 hooks、api-client、react-query、auth/authorization
├── styles/         # tokens.css（设计 Token）+ Tailwind 入口
├── testing/        # MSW handlers、测试工具
└── types/ utils/   # 公共类型、工具
```

知识库 Feature（`frontend/src/features/knowledge/`）：`api/knowledge-bases.ts`、`api/documents.ts`、
`api/types.ts` + 组件（列表/概览/文档面板/新建/删除/工具栏）。

### 3.4 状态与数据流

- 服务端状态全部走 TanStack Query：queryKey + queryFn 集中在 feature 的 api 层，写操作成功后
  `invalidateQueries(['knowledge-bases', ...])` 刷新。
- 全局客户端状态：zustand（`src/components/ui/notifications/notifications-store.ts` 通知等少量场景），
  未引入重型全局 store。
- 鉴权：`GET /api/v1/auth/me` 探测 → 未登录跳 `/auth/login`；`access_token` 存 localStorage，
  401 时用 refresh token 单飞刷新后重试原请求。
- 页面路由：`src/config/paths.ts` 统一声明（chat / agents / space / knowledge(kg·skills·tools·mcp) / overview 等）。

## 4. 后端架构

### 4.1 技术栈

Python 3.12 + FastAPI + SQLAlchemy 2（async）+ Alembic + Celery + Redis + MinIO + pymilvus + Socket.IO + OpenTelemetry
（依赖清单见 `backend/pyproject.toml`）。

### 4.2 应用组装

入口 `backend/main.py` → `register_app()`（`backend/src/core/register.py`）：

- 生命周期（lifespan）：建表 → Redis/Milvus/MinIO/Snowflake 初始化 → Milvus 连接池按域建库并
  `ensure_base_collections()` → 操作日志消费者 → 缓存 Pub/Sub 监听器。
- 中间件执行顺序（CORS → Context(trace_id/request_id) → AccessLog → I18n → JWT → State → OperaLog），
  注册顺序见 `register_middleware()`。
- 路由：`backend/src/app/router.py` 挂载 `admin_v1 / task_v1 / kb_v1`，前缀统一 `/api/v1`；
  插件路由由 `backend/src/plugin/router.py` 动态注入（`build_final_router`）。
- 其它：全局异常处理、分页（fastapi-pagination）、健康检查 `GET /api/v1/health`、
  Prometheus + OTel（`GRAFANA_METRICS_ENABLE` 时开启）、Socket.IO ASGI 挂载。

### 4.3 模块划分

| 模块 | 位置 | 职责 |
| --- | --- | --- |
| admin | `backend/src/app/admin/` | 认证（JWT/OAuth2）、RBAC、用户/角色/菜单/部门/字典、登录与操作日志 |
| kb | `backend/src/app/kb/` | 知识库、文档、去重、标签、统计、Milvus 按 KB 隔离（EagleRAG 迁移） |
| task | `backend/src/app/task/` | Celery 任务控制、结果查询、调度器 API |
| plugin | `backend/src/plugin/` | 插件框架（config/dict/email/notice/oauth2），启动时检查并安装插件依赖 |
| common / core / database / middleware | `backend/src/` | 通用响应/异常/安全、配置、数据库（PG/Redis/Milvus/MinIO）、中间件栈 |

### 4.4 业务分层（FBA）

请求方向严格 `api → service → crud → model → utils`（import-linter 契约强制，见 §8）：

```text
api/v1（FastAPI 路由，Pydantic DTO + JWT 依赖）
  → service（业务编排，如 kb_service / kb_stats_service / document_service）
    → crud（TenantScopedCrud 统一注入租户过滤）
      → model（SQLAlchemy，基类见 backend/src/common/model.py）
        → utils（被多层共享的纯工具，如 kb/utils/namespace.py）
```

多租户过滤**下沉到 CRUD 层**，service 不自行拼接过滤条件。

### 4.5 多租户模型（kb 模块）

- 两轴隔离：`plugin_namespace`（部署级域，Milvus Database + PG 过滤，运行期不可切换）+ `kb_name`
  （请求级知识库，共享集合内标量过滤，可动态增删）。
- 域解析：`backend/src/app/kb/deps.py` 的 `get_current_tenant` 读 `X-Plugin-Namespace` 头，与实例
  配置不一致返回 403（`ALLOW_NAMESPACE_OVERRIDE` 仅测试用）。
- 向量层：`backend/src/database/milvus_pool.py`（按 db 缓存连接，禁止 close）+ `milvus_kb_ops.py`
  （基础集合 ragf_text/ragf_visual、AUTOINDEX + kb_name INVERTED 索引、dynamic field 预埋
  document_id / document_version_id，版本化 Phase 2 前恒为 1）。

### 4.6 异步任务（Celery）

- Broker：RabbitMQ（可切换 Redis）；结果后端：PostgreSQL（`db+postgresql+psycopg`）。
- 调度：`DatabaseScheduler`（`backend/src/app/task/utils/schedulers.py`）+ Beat，任务包按
  `app/task/tasks/**/tasks.py` 自动发现（`backend/src/app/task/celery.py`）。
- API：`/api/v1/tasks`、`/api/v1/task-results`、`/api/v1/schedulers`。
- 容器：worker / beat / flower（监控）/ celery-exporter。

### 4.7 实时通道

Socket.IO 服务端已注册（`backend/src/common/socketio/server.py`，AsyncRedisManager，namespace `/ws`，
JWT 鉴权）；前端目前**未接入**（见 §9）。

## 5. 数据与基础设施

### 5.1 PostgreSQL 16

- kb 模块核心表：`knowledge_bases`（复合主键 `(kb_name, plugin_namespace)`）、`documents`、
  `document_dedup`（`(sha256, kb_name, plugin_namespace)` 去重）、`document_keywords`。
- admin 系统表：用户/角色/菜单/部门/字典/日志等；Celery 任务结果表。
- 迁移：Alembic（`backend/src/alembic/`）。

### 5.2 Milvus 2.5 + etcd

- 集合：`ragf_text`（文本向量）、`ragf_visual`（视觉向量），维度见 `settings.MILVUS_TEXT_VECTOR_DIM` 等。
- 隔离：同一 Database 内共享集合，`kb_name` 标量过滤；`enable_dynamic_field` 承载版本化字段。

### 5.3 MinIO

- bucket `ragf-kb`（`settings.MINIO_KB_BUCKET`），对象键 `kb/{plugin_namespace}/{kb_name}/{document_id}/{filename}`。
- 上传/预签名下载/替换/删除均封装在 `backend/src/app/kb/service/document_storage.py`。

### 5.4 Redis 7

缓存、会话/在线状态、缓存 Pub/Sub、Socket.IO manager、限流等。

## 6. 关键链路

### 6.1 请求生命周期

```text
浏览器 → Nginx :8000 → FastAPI 中间件链（CORS→Context→Access→I18n→JWT→State→OperaLog）
  → 路由 → service → crud → PG/Redis/Milvus/MinIO → 统一响应包装（response_schema）
```

### 6.2 文档上传链路（当前实现）

```text
POST /api/v1/documents（multipart）
  → SHA-256 去重（同库重复 → 409）
  → MinIO 落盘（ragf-kb）
  → documents 登记（status=pending，source_uri=object_key）
  → document_dedup 落 object_key
```

下载走 `GET /documents/{id}/download` 预签名 URL；`PUT /documents/{id}/file` 替换文件；
`DELETE /documents/{id}` 与 `DELETE /knowledge_bases/{kb_name}` 级联清理
（Milvus 向量 → PG 行 → OSS 尽力清理）。解析/分块/向量化（RAG 摄取）尚未接入，`rebuild` 当前返回明确错误。

### 6.3 异步任务链路

```text
API → Celery 任务（celery_aio_pool 异步执行）
  → RabbitMQ 队列 → Worker 执行 → 结果写 PostgreSQL
Beat（DatabaseScheduler）→ 定时任务
Flower / celery-exporter → 监控
```

### 6.4 可观测链路

OpenTelemetry 埋点（FastAPI/Celery/SQLAlchemy/Redis/HTTP）→ Alloy → Loki（日志）/ Prometheus（指标）/
Tempo（链路）→ Grafana 大盘。

## 7. 部署与运维

`docker-compose.yml` 编排（服务名 `ragf_*`）：`ragf_server`、`ragf_nginx`（:8000）、`ragf_postgres`、
`ragf_redis`、`ragf_rabbitmq`、`ragf_minio`（:9000/:9001）、`ragf_etcd` + `ragf_milvus`（:19530）、
`ragf_celery_worker/beat/flower/exporter`、`ragf_loki/prometheus/alloy/tempo/grafana`。

- 开发：`task dev`（后端热重载 :8000）+ `task worker`；前端 `pnpm dev`（:5000，`VITE_APP_API_URL=http://127.0.0.1:8000`）。
- 构建：`backend/Dockerfile`（ragf_server/worker 镜像）；前端 `pnpm build` 产出 `frontend/dist` 由 Nginx 托管。

## 8. 架构约束与提交前检查

架构边界由静态分析工具强制，本地 pre-commit 与 CI 双通道阻断，有意豁免必须显式声明。

### 8.1 后端：import-linter（Python）

配置在 `backend/pyproject.toml` 的 `[tool.importlinter]`，运行 `backend/.venv/bin/import-linter lint`（或 `uv run import-linter lint`），违规即非零退出：

| 契约 | 规则 | 说明 |
| --- | --- | --- |
| kb 模块分层 | `layers`：api → service → crud → model → utils | 上层可依赖下层，反之禁止（`containers` 限定 `backend.src.app.kb`） |
| 业务模块互不依赖 | `independence`：admin / kb / task | 三个业务模块不互相 import，需要跨模块依赖时先补 `ignore_imports` 并写明理由 |

已声明的豁免（均在契约内注释原因，禁止绕过）：

- `task.tasks.db_log → admin`：日志任务消费 admin 日志服务，后续反转依赖方向后删除。
- `common.security → admin`：JWT/权限读取 admin 用户/角色数据，属**已知债务**，后续应下沉为独立 auth 模块或端口。
- `app.*.tests → app`：测试模块可自由组合被测模块。

### 8.2 前端：dependency-cruiser（TypeScript）

配置在 `frontend/.dependency-cruiser.cjs`，运行 `cd frontend && pnpm arch:check`（即 `depcruise "src/**/*.{ts,tsx}" --config .dependency-cruiser.cjs`）：

- `no-circular`：禁止循环依赖。
- `no-cross-feature-*`：按 feature 数组展开，feature 之间互不引用，共享代码下沉到 components / lib / hooks / utils。
- `features-not-to-app`：feature 禁止反向依赖 app 层。
- `shared-not-to-app-features`：lib / hooks / components / utils / config / types 禁止依赖 app 与 feature。
- `generated-is-leaf`：OpenAPI 生成产物只被消费，不反向依赖 src 内代码。

已知限制：dependency-cruiser 18.x 暂不支持 TypeScript 7（项目为 `typescript@^7`），会降级解析并告警，
`import type` 等纯类型依赖可能漏检；等上游支持后自动恢复全量分析。

### 8.3 落地通道

- **pre-commit**（`.pre-commit-config.yaml` 顶部 local hooks）：`architecture-backend` + `architecture-frontend`，
  全量分析、提交即拦截；`pre-commit install` 后生效。
- **CI**（`.github/workflows/architecture.yml`）：push / PR 触发，backend 用 `uv sync --frozen` + `uv run import-linter lint`，
  frontend 用 `pnpm install --frozen-lockfile` + `pnpm arch:check`。

## 9. 现状与已知缺口

- 文档过时：README 仍写「Vue 3 + TypeScript（前端，待迁移）」，实际前端已迁移为 React 19 + Vite。
- RAG 核心未落地：文档摄取（解析/清洗/分块/向量化）、检索、问答生成、SSE 流式均未实现；
  文档状态停在 `pending`，`rebuild` 返回明确错误（扩展点已留）。
- 版本化：`document_version_id` 动态字段已预埋，具体版本化流程待摄取管线完成后实现
  （见 `docs/specs/2026-09-02-document-versioning-spec.md`）。
- Socket.IO：服务端已注册，前端未接入（依赖列表无 socket.io-client）。
- 前端 API 契约：kb/documents 已纳入 OpenAPI 生成管线（`src/generated/knowledge_bases/`、
  `src/generated/documents/`），`features/knowledge/api` 作为薄封装转发生成产物并统一做缓存失效。
- 占位页面：chat / agents / space / knowledge( skills·tools·mcp ) 等路由存在，对应后端能力待建设。
- 架构债务：`common.security`（JWT/权限）直接依赖 admin 用户/角色模型，导致所有业务模块经公共层
  间接依赖 admin；已在 §8.1 显式豁免，后续应下沉为独立 auth 模块后移除。
- 工具限制：dependency-cruiser 18.x 尚不支持 TypeScript 7（见 §8.2），`import type` 依赖可能漏检。
- 文档准确性：`docs/frontend/前端架构设计.md` 是脚手架参考（描述 apps/web、electron、extension 结构），
  与当前仓库目录不完全一致，引用时注意区分。

## 10. 相关文档

- 架构图：`docs/specs/2026-09-02-前后端基础架构.hierarchy.md`
- 知识库设计概览：`docs/知识库设计/知识库设计概览.md`
- EagleRAG KB 迁移：`docs/specs/2026-09-01-eaglerag-kb-migration-design.md`
- 文档版本化：`docs/specs/2026-09-02-document-versioning-spec.md`
- RAG 核心设计：`docs/RAG_core/00_RAG核心的设计总览.md`
- 工程治理：`docs/工程治理/`（路由层设计、数据库层设计、认证授权设计、消息队列设计、构建与部署、环境变量）
- API 概览：`docs/api/api.md`
