# AGENTS.md — 仓库根

> 面向 AI 代理与开发者的项目总览：工程化配置与大致结构。**进入具体端开发前，先读对应端的 AGENTS.md**：[backend/AGENTS.md](backend/AGENTS.md)（后端架构）· [frontend/AGENTS.md](frontend/AGENTS.md)（前端架构）。

## 1. 项目定位

**RAG-F 智能知识管理平台**：基于检索增强生成（RAG）的私有知识库问答系统——文档摄取 → 向量化 → 混合检索 + 精排 → 带引用的流式问答，另含 MCP 工具面与可观测栈。前后端同仓（monorepo）。

## 2. 仓库结构

```text
├── backend/                 # FastAPI 后端（fba 模板）—— 见 backend/AGENTS.md
├── frontend/                # React 19 + Vite 前端 —— 见 frontend/AGENTS.md
├── docs/                    # VitePress 文档站（工程治理 / RAG_core / 参考 / specs）
├── deploy/                  # 部署配置（Grafana/Alloy/Prometheus/Tempo 等）
├── docker-compose.yml       # 依赖容器 + 部署栈
├── Dockerfile               # 后端镜像（ragf_server / ragf_celery_*）
├── Taskfile.yml             # 项目统一任务入口（聚合前后端子 Taskfile）
├── flake.nix                # Nix 开发环境（node22 / python312 / go-task）
├── .pre-commit-config.yaml  # 提交钩子：格式化 + 架构契约（违规阻断提交）
├── .github/workflows/       # CI：architecture.yml（架构契约）、docs.yml（Pages 部署）
├── .agents/ + skills-lock.json  # 仓库内 agent 技能（excalidraw 图、fba 规范等）
└── .env.example             # 根 env（Docker Compose 用：POSTGRES_*/RABBITMQ_*/端口映射）
```

**env 是两层的，别搞混**：根 `.env`（cp 自 `.env.example`）只给 Docker Compose 用（容器账号与端口映射 `DOCKER_MAP_*`）；后端运行时读 `backend/src/.env`（cp 自 `backend/src/.env.example`，映射到 `src/core/config.py` 的 Settings）。

## 3. 开发模式约定

**依赖跑 Docker 容器，代码跑宿主机**，所有操作经 Taskfile 统一入口：

```bash
task init        # 一键初始化（幂等）：uv/pnpm 装依赖 → 起依赖容器 → 建表 → 种子数据
task dev         # 一键开发环境：依赖容器 + 后端 uvicorn 热重载(8000) + 前端 Vite(5000)
task worker      # Celery Worker（摄取等异步任务）；task beat 为定时调度
task dev:stop    # 停止前后端进程 + 依赖容器
```

- 前后端子任务以命名空间调用：`task backend:<t>` / `task frontend:<t>`（如 `backend:dev`、`frontend:test`）。
- 依赖容器：`task deps-up / deps-status / deps-logs / deps-down`（PostgreSQL 16 / Redis / RabbitMQ 3.13 / MinIO / Milvus 2.5 + etcd，`--wait` 等健康检查）。
- 通用命令跨两端聚合：`task lint / format / test / install / build`。
- 根目录还有 `task env:check`：校验各层 env 账号字段一致性；`task docker-build`：构建 ragf_server + Celery 系列镜像。

## 4. Docker Compose 拓扑（docker-compose.yml）

| 组       | 服务                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 开发依赖 | `ragf_postgres` `ragf_redis` `ragf_rabbitmq` `ragf_minio` `ragf_milvus`(含 etcd)                                                                 |
| 应用     | `ragf_server`（FastAPI）、`ragf_nginx`（部署入口）、`ragf_ui`（注释占位，前端暂不进容器）                                                        |
| Celery   | `ragf_celery_worker`、**`ragf_celery_ingest_worker`（ingest 独立队列消费者）**、`ragf_celery_beat`、`ragf_celery_flower`、`ragf_celery_exporter` |
| 可观测   | Loki、Prometheus、Grafana Alloy、Tempo（配置在 `deploy/backend/grafana/`）；后端 OTel 全链路埋点                                                 |

## 5. 工程化守护链（三层架构即代码）

1. **提交时**（`.pre-commit-config.yaml`）：ruff check+format、tombi（TOML）、uv-lock/export、end-of-file 等通用钩子；以及两个**本地架构钩子**——backend 跑 import-linter、frontend 跑 dependency-cruiser，**违规直接阻断提交**。有意豁免必须在对应配置文件中显式声明（backend/pyproject.toml `[tool.importlinter]`、frontend/.dependency-cruiser.cjs），不得绕过钩子。
2. **CI 时**（`.github/workflows/architecture.yml`，main 与 `refactor/**` 分支）：复跑两端架构契约（import-linter / dependency-cruiser），双保险。
3. **运行前**：前端 `check:tokens`（设计令牌）+ `check-types`（tsc）、后端 `pyright` + `pytest`。

## 6. 质量工具总表

| 端       | Lint/格式                                   | 类型         | 架构契约                                  | 测试                                                                  |
| -------- | ------------------------------------------- | ------------ | ----------------------------------------- | --------------------------------------------------------------------- |
| backend  | ruff（严格规则集，单引号，line-length 120） | pyright      | import-linter（分层 + 域独立）            | pytest                                                                |
| frontend | oxlint + prettier                           | tsc --noEmit | dependency-cruiser（分层 + feature 边界） | Vitest + Testing Library + MSW；Playwright（e2e，配 MSW mock-server） |

提交钩子：后端 prek/pre-commit；前端 husky + lint-staged。

## 7. 前后端契约：OpenAPI 代码生成

接口类型不手写：后端 FastAPI 导出 `/openapi` → `frontend/scripts/generate-api.mjs` 生成 `frontend/src/generated/`（每端点 = axios 函数 + queryOptions + React Query hook）。改动后端接口后：起后端（8000）→ 前端跑 `pnpm generate:api`。Schema 字段的 `Field(description=...)` 是文档来源，前端生成物直接依赖它。

## 8. 文档体系（docs/，VitePress）

- `docs/工程治理/`：业务模块开发规范、认证授权、数据库层、消息队列、中间件与异常、路由层、配置清单、构建与部署——**后端逐条开发规范以这里为准**。
- `docs/参考/`：fba 模板各专题（JWT/RBAC/多租户/事务/缓存/Celery/分页…）。
- `docs/RAG_core/`：RAG 核心设计（总览、文档解析）；`docs/知识库设计/`：知识库领域设计。
- `docs/specs/`：设计决策与规格（RAG API 路线、访问控制、Agent/MCP、文档版本等）——import-linter 豁免注释里的 D/M 编号出处。
- 本地预览：`cd docs && pnpm dev`（端口 6632）；main 分支由 CI（docs.yml）自动部署到 GitHub Pages。
- 注意：`docs/frontend/前端架构设计.md` 已过时，前端现状见 `frontend/AGENTS.md`。

## 9. 已知债务 / 注意事项

- `CONTRIBUTING.md` 是空文件占位。
- backend 存在 1 个历史 pyright 错误：`src/app/model_provider/tests/test_hf_clients.py:102` 参数类型不匹配，待修。
- 后端 `common.security → admin` 等跨模块豁免为已知债务（backend/AGENTS.md §5、pyproject 契约注释）。
