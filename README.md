# KnowledgeRAG

可私有部署的多租户知识智能体平台：把 RAG 检索、知识图谱、LangGraph 多智能体编排、MCP / Skills、沙盒工具与权限管理放进同一个工作台。

本文件只讲**怎么开发和怎么部署**。系统边界、目录职责与主链路见 [ARCHITECTURE.md](ARCHITECTURE.md)；功能说明与完整文档见 [docs/](docs/index.md)。

## 技术栈与仓库结构

| 层           | 技术                                                                                           | 位置                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 后端         | Python 3.13 · FastAPI · LangGraph · ARQ worker                                                 | `backend/server`（HTTP 入口）、`backend/package/ars`（业务与基础设施） |
| 前端         | React 19 · Vite · TypeScript · Tailwind 4 · shadcn/Radix                                       | `web/`                                                                 |
| 存储         | PostgreSQL · Redis · Silo（MinIO 兼容分支） · Milvus · Neo4j                                   | 由 Compose 提供                                                        |
| 命令行客户端 | `ars-cli`                                                                                      | `packages/ars-cli`                                                     |
| 文档站       | VitePress                                                                                      | `docs/`                                                                |
| 任务入口     | [Taskfile.yml](Taskfile.yml)（便捷封装）；[docker-compose.yml](docker-compose.yml)（事实来源） | 仓库根                                                                 |

开发拓扑是**全容器化**的：`api`、`worker`、`storage-migrator`、`sandbox-provisioner`、`web`、`postgres`、`redis`、`minio`、`milvus`、`etcd`、`graph`。文档解析与 OCR（`mineru-api`、`paddlex`）在 `all` profile 下可选启动。

## 环境要求

- Docker Engine 24+ 与 Docker Compose v2.20+
- 至少一个兼容 OpenAI 接口的模型服务（初始化脚本要求填硅基流动的 `SILICONFLOW_API_KEY`）
- 文档解析（PDF / Office / 图片）需要 `MINERU_API_KEY`；本地跑解析 / OCR 容器需要 NVIDIA Container Toolkit
- 可选：`task`（[go-task](https://taskfile.dev/)）。本文的 `task *` 都只是 `docker compose` 的封装，不装也能直接用对应命令
- 可选：`uv` 与 Python 3.13（`task lint` / `task format` / `task test` 在宿主机跑，需要它们；也可改用下面的容器内命令）
- 可选：宿主机前端开发需要 Node 22+ 与 `pnpm`（版本见 `web/package.json` 的 `packageManager`）

## 开发

### 1. 准备配置

```bash
git clone https://github.com/Zhongye1/KnowledgeRAG-OGAS.git
cd KnowledgeRAG-OGAS

# 推荐：初始化脚本引导填 Key、生成安全密钥、预拉镜像
./scripts/init.sh          # Windows: .\scripts\init.ps1

# 或手动：复制模板后按注释填写
cp .env.template .env
```

`JWT_SECRET_KEY`、`API_KEY_DERIVATION_SECRET`、`SANDBOX_PROVISIONER_TOKEN` 必须各自独立、至少 32 个非空白字符，并在后续重建与升级中保持原值；三者复用或过短会在启动时被拒绝。完整变量与默认值见 [.env.template](.env.template)。

### 2. 启动

```bash
task up                    # 等价于 docker compose up -d
```

首次启动需要构建镜像并等 `storage-migrator` 成功；`api` 的 healthcheck 有 180s 的 `start_period`。

| 入口                   | 地址                                    |
| ---------------------- | --------------------------------------- |
| Web（Vite 开发服务器） | http://localhost:5173                   |
| API 文档               | http://localhost:5050/docs              |
| 进程存活               | http://localhost:5050/api/system/health |
| 接流量就绪             | http://localhost:5050/api/system/ready  |

`health` 只表示 API 进程活着；`ready` 才表示 PostgreSQL / Redis / 兼容 worker 租约等接流量条件成立，两者都不代表登录、对话、知识库或 Agent Run 的业务链路正确。

不需要知识库与知识图谱时用 LITE 模式起最小栈（只起 `postgres redis minio api worker`）：

```bash
task up-lite
```

### 3. 日常命令

```bash
task ps          # 服务状态
task logs        # api 最近日志 + 当前分支与提交
task shell       # 进入 api 容器
task down        # 停止
task reset       # 破坏性：删除数据卷后重建并写入初始用户
```

`api-dev`、`worker-dev` 与 `web-dev` 默认热重载，改本地代码通常不需要重启容器。容器名与挂载方式见 [docker-compose.yml](docker-compose.yml)。

### 4. 后端开发

```bash
task lint               # ruff check + import 排序 + 格式检查（只读）
task format             # ruff format + ruff check --fix + import 排序修复
task test               # 单元测试（宿主机 uv，不依赖容器服务）
task test:integration   # 真实 PostgreSQL / 真实 HTTP
task test:e2e           # 端到端
```

容器内等价命令（与[测试规范](docs/develop-guides/testing-guidelines.md)一致）：

```bash
docker compose exec api uv run --group test pytest test/unit -m "not slow"
docker compose exec api uv run --group test pytest test/integration
docker compose exec api uv run --group test pytest test/e2e -m e2e
```

测试按 unit / integration / e2e 分层放在 `backend/test`。改动面与最低证据的对应关系、fixture 与 skip 规则由[测试规范](docs/develop-guides/testing-guidelines.md)拥有。

### 5. 前端开发

```bash
task web:dev        # 起 web 服务（5173），/api 与 /minio 由 vite 代理
task web:logs
task web:verify     # lint + 单测 + 设计 token + 分层 + 契约漂移 + 构建
```

容器已在运行时，也可以在宿主机直接跑：

```bash
cd web && pnpm install && pnpm run dev
```

浏览器只访问同源路径 `/api/*` 与 `/minio/*`（开发由 vite 代理，生产由你接的反向代理转发，见下文「对外入口」），前端代码里没有后端地址配置。后端接口变化后必须刷新契约快照并重新生成客户端，两个产物都入库：

```bash
task web:api        # = pnpm run api:snapshot + pnpm run api:gen
```

前端分层、API 段边界、颜色 token 与契约流水线见 [web/ARCHITECTURE.md](web/ARCHITECTURE.md)、[web/AGENTS.md](web/AGENTS.md) 与[界面设计规范](docs/develop-guides/design.md)。

### 6. 提交前

```bash
task verify         # 工程契约静态校验 + 其自测
task web:verify     # 前端全部门禁
```

仓库带 `.pre-commit-config.yaml`（ruff、uv-lock、工程契约、前端 lint / 类型 / token / 分层 / 依赖边界）。非平凡改动必须在同一变更里新增或更新一份[决策记录](docs/develop-guides/decisions/README.md)；提案、证据与收敛流程见 [Spec Loop](docs/develop-guides/spec-loop.md)，分支与 Review 流程见[贡献指南](docs/develop-guides/contributing.md)。

## 生产部署

生产用 [docker-compose.prod.yml](docker-compose.prod.yml)：`ARS_ENV=production`，关键变量缺失时直接拒绝启动；对外只发布前端 nginx 的 80 端口，数据库与其余内部服务都不映射到宿主机。

### 1. 配置

```bash
cp .env.template .env.prod
```

生产 Compose 强制要求下列变量非空，缺失或为空会报出具体变量名：

```
POSTGRES_PASSWORD
NEO4J_PASSWORD
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
JWT_SECRET_KEY
API_KEY_DERIVATION_SECRET
ARS_INSTANCE_ID
SANDBOX_PROVISIONER_TOKEN
```

三个安全密钥分别用 `openssl rand -hex 32` 生成、互不复用并持久保存。`API_KEY_DERIVATION_SECRET` 决定幂等 API Key 的安全重放，轮换后既有创建请求无法重放原 secret。另外还需要模型服务的 Key（默认 `SILICONFLOW_API_KEY`）与文档解析的 `MINERU_API_KEY`，它们不由 Compose 强制校验。

### 2. 启动

```bash
# 核心服务（CPU）
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 追加 GPU 文档解析 / OCR（mineru-api、paddlex）
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile all up -d --build
```

从旧文件布局升级到 v0.7.2 不能直接 `up`：停机迁移、失败续跑、成套回滚与 Kubernetes 存储边界只在[生产部署指南](docs/advanced/deployment.md#2-启动服务)中维护，升级前请完整阅读。

### 3. 验证

前端 nginx 同源转发 `/api/`，所以从宿主机直接探：

```bash
curl -f http://localhost/api/system/health
curl -f http://localhost/api/system/ready
```

需要绕过 nginx 直连 API 时用 `docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T api curl -f http://localhost:5050/api/system/ready`。`ready` 只证明接流量条件成立，不替代真实业务链路验收。

### 4. 对外入口

生产 Compose 的 `web` 服务用 [docker/web.Dockerfile](docker/web.Dockerfile) 的 `production` 阶段（nginx，配置在 [docker/nginx/](docker/nginx/)）托管 `web/dist`，并同源转发：

- `/api/` → `api:5050`（关闭缓冲、600s 超时，适配 SSE 流式）
- `/minio/public/` → `minio:9000/public/`（只允许 GET/HEAD），其余 `/minio/` 返回 404

浏览器访问 `http://localhost` 即可。要换域名或加 TLS，在它前面再加一层反向代理；只有前端与 API 不同源时才需要配置 `ARS_CORS_ORIGINS`。

### 5. 运维要点

- 重建或升级 Redis 容器后必须重启 worker（arq 不会自动重连），否则 `/api/system/ready` 不恢复：`docker compose -f docker-compose.prod.yml --env-file .env.prod restart worker`。
- `ARS_CORS_ORIGINS` 在生产默认为空：前后端同源留空即可，跨域部署必须显式声明来源，否则浏览器请求被拒。
- 日志：`docker logs -f api-prod`、`docker logs -f worker-prod`、`docker logs -f web-prod`。
- 维护数据库等内部服务优先用 `docker compose exec`，不要为了临时调试把端口重新暴露到公网。
- 第三方组件许可证、再分发义务与商业部署边界见[生产部署指南](docs/advanced/deployment.md#第三方组件与许可证)。

## 文档

文档站是 `docs/`（VitePress）：

```bash
cd docs && pnpm install && pnpm run dev
```

常用入口：[项目概览](docs/intro/project-overview.md)、[快速开始](docs/intro/quick-start.md)、[代码地图](ARCHITECTURE.md)、[配置参考](docs/advanced/configuration.md)、[测试规范](docs/develop-guides/testing-guidelines.md)、[工程信任系统](docs/develop-guides/engineering-trust.md)、[版本变更记录](docs/develop-guides/changelog.md)。

## 许可证

按 `backend/pyproject.toml` 与 `packages/ars-cli/pyproject.toml` 的声明，本项目采用 MIT 许可证。Compose 引入的 Neo4j、Silo、Milvus、etcd、Redis 等第三方组件保留各自原始许可证，部署与再分发的边界见[生产部署指南](docs/advanced/deployment.md#第三方组件与许可证)。
