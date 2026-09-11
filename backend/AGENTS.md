# AGENTS.md — backend

> 面向 AI 代理与开发者的后端架构总纲。改动代码前先读「§2 铁律」与「§5 分层与依赖方向」；逐条开发规范见 `docs/工程治理/业务模块开发规范.md`。

## 1. 项目定位

RAG-F 智能知识管理平台后端：基于 **FastAPI** 的私有知识库 RAG 问答系统，核心能力为知识库/文档管理、异步文档摄取、混合检索 + 精排、SSE 流式问答、MCP 工具面。技术基线是 **fba（FastAPI Best Architecture）模板**，在此之上叠加 RAG 业务域。

## 2. 铁律（违反会被 CI/工具链拦下）

1. **分层依赖方向由 import-linter 强制**（契约定义在 `pyproject.toml` 的 `[tool.importlinter]`）。改完 import 后跑 `uv run lint-imports`（dev 依赖组已含）。跨域新增依赖必须在契约 `ignore_imports` 中显式豁免，并注明决策依据（引用 `docs/specs/` 中的 D/M 编号）。
2. **8 个业务域互不依赖**（independence 契约）；域内固定 `api → service → crud → model` 分层，上层可依赖下层，反之禁止。
3. **ruff 规则严格**：单引号、line-length 120、异步函数内禁止阻塞调用（open/httpx/sleep 等规则已开启）、公共函数必须标注返回类型。提交前 `task lint`。
4. `model/__init__.py` **必须聚合导出全部模型类**——建表与模型注册依赖它。
5. **配置一律走 `src/core/config.py` 的 `Settings`**（pydantic-settings），不在业务代码里直接读 `os.environ`；RAGF 业务参数以 `RAGF_` 前缀集中声明。
6. 新表结构变更走 Alembic 迁移（`src/alembic/`），不要手工改库。

## 3. 技术栈与选型

| 类别     | 选型                                                                       | 说明                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web 框架 | FastAPI（fba 模板）                                                        | 异步优先；响应/异常/分页由 `src/common` 统一                                                                                                                   |
| ORM      | SQLAlchemy 2.0 异步 + asyncpg                                              | 可切 asyncmy（MySQL）；CRUD 基于 `sqlalchemy-crud-plus`                                                                                                        |
| 迁移     | Alembic                                                                    | `src/alembic/versions`                                                                                                                                         |
| 向量库   | **Milvus ≥2.5**                                                            | dense+sparse 双字段 + BM25 Function + 服务端 RRFRanker；按租户 namespace 分库（`src/database/milvus_pool.py`）——选 Milvus 而非 pgvector 是为了混合检索与规模化 |
| 缓存     | Redis（redis-py 异步单例）                                                 | 缓存装饰器 / pubsub / JWT 吊销名单                                                                                                                             |
| 任务队列 | Celery 5 + celery-aio-pool                                                 | broker **RabbitMQ**（可切 Redis）；result backend 直写 PostgreSQL；支持原生 async 任务                                                                         |
| 对象存储 | MinIO                                                                      | 原始文件与解析后 Markdown 落桶                                                                                                                                 |
| 模型接入 | OpenAI 兼容协议 + HuggingFace Inference                                    | 默认 embedding `BAAI/bge-m3`、reranker `BAAI/bge-reranker-v2-m3`；统一走 `model_provider` 域的模型工厂                                                         |
| 文档解析 | Knowhere SDK（内部 MinerU）+ pixelrag + DashScope | 双管线路由（ingest/routing），legacy 工厂链已删除                                                                                                              |
| 流式     | sse-starlette                                                              | `EventSourceResponse` 输出 D25 事件协议（meta/citation/delta/usage/done）                                                                                      |
| 认证     | JWT（python-jose）+ RBAC                                                   | 中间件式认证 + 路由权限装饰器；OAuth2 由插件提供                                                                                                               |
| 实时通道 | python-socketio                                                            | 挂载于 `/ws`                                                                                                                                                   |
| 可观测   | OpenTelemetry + Prometheus + loguru                                        | FastAPI/SQLAlchemy/Redis/httpx/Celery/openai 自动埋点                                                                                                          |
| 工具链   | uv + Taskfile + ruff + pyright + pytest + import-linter + prek             | Python ≥3.12                                                                                                                                                   |

## 4. 目录结构

```text
backend/
├── main.py                  # 入口：装插件依赖 → register_app()
├── run.py                   # IDE 调试友好启动
├── Taskfile.yml             # 后端任务（dev/run/init-db 等，需从仓库根启动）
├── pyproject.toml           # 依赖 + ruff + import-linter 契约（架构即代码）
├── pyrightconfig.json       # pyright 类型检查（extraPaths 指向仓库根，backend 作为包导入）
└── src/
    ├── core/                # 应用组装：config.py（Settings）、register.py（中间件/路由/lifespan 注册）
    ├── app/                 # 业务域（每个域自含 api/service/crud/model/schema 分层）
    │   ├── admin/           # 认证与系统管理：JWT、RBAC、用户/角色/菜单/日志/验证码
    │   ├── kb/              # 知识库域：知识库/文档/ACL/标签 CRUD、租户 scope 依赖注入（deps.py）
    │   ├── ingest/          # 摄取域：上传入队 Celery、解析工厂/注册表、分块器（chunking/）
    │   ├── retrieval/       # 检索域：策略召回 vector/hybrid → RRF → 精排 → PG 来源补全；可选视觉召回 ragf_visual（独立 visual_results）
    │   ├── chat/            # 问答域：SSE 流式生成、引用组装、prompt 上下文
    │   ├── model_provider/  # 模型接入域：模型工厂（embed/chat/rerank/visual）、ModelCache、连通性测试
    │   ├── task/            # 任务域：Celery 实例（celery.py）、队列划分、动态定时 DatabaseScheduler
    │   └── mcp/             # MCP 工具面：对外检索/带引用问答/文档读取（PAT 鉴权，复用 chat/retrieval）
    ├── common/              # 跨域公共设施：security（jwt/rbac/permission）、cache、exception、
    │                        #   response、lifespan、queue、socketio、observability、pagination、enums
    ├── database/            # 外部依赖客户端：db.py（异步引擎/多数据源 session）、redis.py、
    │                        #   milvus.py / milvus_pool.py / milvus_kb_ops.py、minio.py
    ├── middleware/          # HTTP 中间件：jwt_auth / access（限流）/ logs / i18n / request_state
    ├── plugin/              # 插件系统：core.py（发现/拓扑排序）、settings_source.py（插件配置并入 Settings）
    │                        #   内置插件：oauth2 / notice / email / dict / config
    ├── alembic/             # 数据库迁移
    ├── locale/
    ├── log/
    ├── static/
    ├── sql/
    ├── utils/
    └── tests/
```

## 5. 分层与依赖方向

**域内五层**（kb / model_provider 为完整五层；retrieval / chat / mcp 为 api → service 两层）：

```text
api（路由，薄） → service（业务编排） → crud（DAO，sqlalchemy-crud-plus） → model（ORM） → utils
```

**域间固定方向**（下游域 → 上游基础域，ragf-design 决策 D9/D10/D18/D30）：

```text
mcp ──→ chat ──→ retrieval ──→ kb
 │         │          │
 └─────────┴──→ model_provider ←── ingest ──→ kb / task
```

- ingest：只消费 kb 的文档登记/分块只读契约（D9）与 model_provider 的模型客户端；任务代码域内归属，派发走 `app/task` 的 celery 实例（D10）。
- mcp：工具面只编排 chat/retrieval/kb 的服务门面，**不直连存储**（D30）。
- 已知债务豁免（在 pyproject 中注明待还）：`common.security → admin`（用户查询，待下沉独立 auth 模块）、`task.tasks.db_log → admin`。
- `common/`、`database/`、`middleware/` 是被所有域依赖的横切层，**禁止反向依赖任何业务域**。

## 6. 关键链路

**问答（SSE 流式）**：`app/chat/api/v1/chat.py`（EventSourceResponse）→ `ChatService.astream` → `RetrievalService._aggregate` 五步编排：① KB 归属/ACL 校验（scope 表达式由 `retrieval/service/scope.py` 生成 Milvus 标量过滤）② embedding（model_provider）③ 策略召回（`RETRIEVE_STRATEGIES` 注册表 → `milvus_kb_ops.search_ragf_kb`，dense+sparse RRF；可选视觉召回 `strategies/visual.py` → `milvus_visual_ops.search_visual`，命中独立 `visual_results` 返回，失败降级）④ reranker 精排（失败降级为召回序）⑤ 回查 PG chunks 补全来源 → `build_citations` → chat model 流式输出 `delta` 帧。

**摄取（Celery 异步，双管线 spec：docs/specs/2026-09-10-dual-pipeline-ingest-design.md）**：上传/URL 端点 `send_task` 入队（ingest/knowhere/visual 三队列可独立路由）→ `ingest/tasks/tasks.py: ingest.process_document` 为**路由入口**：策略链（`ingest/routing/`，默认 auto：knowhere 扩展集含 pdf/docx/pptx/md/txt/csv，图片/扫描件走 visual）决定管线。knowhere = Knowhere SDK 语义解析（`ingest/service/knowhere_service.py`）；visual = PixelRAG 视觉切片（`ingest/service/visual_service.py`）。**legacy 工厂链（parser/chunking/MinerU 直连）已删除**——摄取硬依赖 Knowhere 服务 + DASHSCOPE_API_KEY，引擎不可用时路由期 fail-closed 报错。两条管线共享：**先 Milvus 后 PG 双写**（失败删向量补偿）、`ingest_jobs` 细粒度审计（`ingest/model/ingest_job.py`，job_id = Celery task_id）、dedup 成功后置登记（D9）、限额三道关（`ingest/limits.py`）；`ingest.reconcile` 由 beat 周期对账（含视觉管线），PG 为事实源。

## 7. 设计模式与代表落点

| 模式              | 落点                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 依赖注入          | FastAPI `Depends` + `Annotated` 别名；租户 scope 链 `kb/deps.py`；权限链 `[DependsJwtAuth, Depends(RequestPermission(...)), DependsRBAC]` |
| 仓库/CRUD 泛型    | `kb/crud/base.py: TenantScopedCrud(CRUDPlus[M])`——租户隔离收口在基类                                                                      |
| 策略 + 注册表     | `retrieval/service/strategies/__init__.py` 的 `RETRIEVE_STRATEGIES` 字典分发召回策略                                                      |
| 工厂              | `ingest/parser/factory.py: DocumentProcessorFactory`（按文件类型路由 + fallback）；`model_provider/service/model_factory.py` 三类模型选型 |
| 装饰器注册表      | `ingest/parser/registry.py` 的 `register`（OCR/解析引擎 PROCESSORS）                                                                      |
| 观察者/生命周期   | `common/lifespan.py: LifespanManager.register`（启动/关闭钩子），在 `core/register.py` 统一挂载                                           |
| 门面 + 构造器注入 | `RetrievalService` / `ChatService` 依赖（chunk_source/kb_dao/provider/strategies）全部构造参数可替换，利于测试                            |
| 插件 + 拓扑排序   | `plugin/core.py` 插件发现/排序；`plugin/settings_source.py` 把插件配置并入 Settings                                                       |
| 模块级单例        | `redis_client`、`milvus_pool`、各 service 的 `get_xxx_service()`                                                                          |
| 中间件链          | `core/register.py: register_middleware`：操作日志 → 请求状态 → CORS → i18n → 限流 → JWT                                                   |

## 8. 开发约定（新增代码怎么放）

- **新增业务端点**：按五层走（model → schema → crud → service → api），路由汇总进该域 `api/v1/router.py` 并挂到 `src/app/router.py`；不要跨域 import，需要上游能力就调用该域 service 门面。
- **Schema 四件套命名**：`CreateXxxParam` / `UpdateXxxParam` / `DeleteXxxParam` / `GetXxxDetail`，继承 `SchemaBase`，字段必带 `Field(description=...)`（OpenAPI 文档来源，前端 `generated/` 代码生成依赖它）。
- **异步纪律**：async 函数内禁止阻塞 IO（ruff 已开启对应规则）；CPU/重 IO 作业进 Celery 任务，不要在请求协程里做。
- **测试**：放在域内 `tests/`，可自由 import 其他域（契约已豁免 `*.tests`）。
- **插件形态**：可插拔功能放 `src/plugin/<name>/`（`plugin.toml` 声明），核心业务放 `src/app/<name>/`。
- 详细逐条规范（命名、主键、审计字段 Mixin、菜单/权限 SQL 等）见 `docs/工程治理/业务模块开发规范.md`。

## 9. 常用命令

```bash
# 仓库根（Taskfile.yml）：依赖容器在 Docker，代码在宿主机
task init        # 一键初始化：装依赖 → 起容器 → 建表 → 种子数据
task dev         # 一键起本地环境：依赖容器 + 后端热重载 + 前端
task worker      # Celery worker（task beat 为定时调度）
task deps-up / deps-status   # 起/查依赖容器（PG/Redis/RabbitMQ/Milvus/MinIO/Grafana 栈）
task test / lint / format

# backend/ 目录（backend/Taskfile.yml）
task install     # uv sync
task dev         # uvicorn 热重载（等价根 task dev）
task init-db     # 建表 + Redis 初始化（幂等）

# 架构与类型检查
uv run lint-imports   # import-linter 分层契约检查
uv run pyright        # 类型检查（配置见 backend/pyrightconfig.json，在 backend/ 下运行）
```

开发前需 `backend/src/.env`（从 `src/.env.example` 复制）。

## 10. 文档索引

- `docs/工程治理/`：业务模块开发规范、认证授权设计、数据库层设计、消息队列设计、中间件与异常处理、路由层设计、配置清单、构建与部署
- `docs/参考/`：fba 各专题（JWT/RBAC/多租户/事务/缓存/Celery/分页/时区…）
- `docs/RAG_core/`：RAG 核心设计总览、文档解析
- `docs/specs/`：历史设计决策（RAG API 路线、访问控制、Agent/MCP、文档版本等，import-linter 豁免注释中的 D/M 编号出处）
