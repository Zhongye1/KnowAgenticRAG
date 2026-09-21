<div align="center">

# RAG-F · 智能知识管理平台

**基于检索增强生成（RAG）的私有知识库问答系统**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.12-3776ab?logo=python)](https://www.python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-ff4438?logo=redis)](https://redis.io/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3.13-ff6600?logo=rabbitmq)](https://www.rabbitmq.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?logo=docker)](https://docs.docker.com/compose/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](#license)

[快速启动](#-快速开始) · [常用命令](#-常用命令) · [测试](#-测试) · [项目结构](#-项目结构) · [文档](#-文档) · [常见问题](#-常见问题)

</div>

---

## 项目简介

RAG-F 是一套面向个人与团队的智能知识管理平台，通过将私有文档与大语言模型深度结合，实现**检索增强生成（RAG）**问答，显著降低 AI 幻觉、提升领域知识回答的准确性。

核心能力：

- 🧠 **防幻觉问答** — 答案严格基于你的文档，来源可追溯
- 📚 **统一知识管理** — 多格式文档导入、知识库分类与权限管理
- 🤖 **Agent 任务模式** — ReAct 框架，自然语言驱动多步骤任务
- ✍️ **文档创作** — 报告 / 摘要 / 大纲 / 博客 / 论文等多种生成模式
- 🗺️ **可观测性** — 内置 Loki / Prometheus / Tempo / Grafana 监控栈
- 🚀 **本地优先** — 数据不出本机，私有化部署

> 技术栈：FastAPI + SQLAlchemy + Celery + PostgreSQL + Redis + RabbitMQ（后端）；React 19 + TypeScript + Vite（前端）。

---

## 快速开始

开发模式约定：**依赖跑 Docker 容器，代码跑宿主机**，所有操作通过 [Taskfile](https://taskfile.dev) 统一管理。

### 0. 一键初始化（推荐）

代码拉取、工具安装完成后，一条命令完成全部初始化：

```bash
task init
```

自动执行：安装依赖 → 启动并等待依赖容器健康 → 建表与 Redis 初始化 → 导入种子数据。

完成后即可启动项目：

```bash
task dev       # 启动后端（热重载）；异步任务另开终端 task worker
```

> 分步说明见下方 1~6 节，`task init` 是它们的组合，可重复执行（幂等）。

### 1. 环境要求

| 软件 | 版本要求 | 用途 |
| --- | --- | --- |
| Git | 较新版本即可 | 拉取代码 |
| Docker | 24+（含 Compose v2） | 运行依赖容器 |
| uv | 0.12+ | Python 依赖管理（自动管理 Python 版本） |
| Task | 3.x | 项目任务统一入口 |

### 2. 安装工具

```bash
# uv
curl -LsSf https://astral.sh/uv/install.sh | sh
# 安装完成后重启终端或 source ~/.bashrc

# Task（任选其一）
brew install go-task/tap/go-task          # macOS / Linux
go install github.com/go-task/task/v3/cmd/task@latest
npm install -g @go-task/cli
```

验证：`uv --version && task --version`

### 3. 拉取代码

```bash
git clone https://github.com/Zhongye1/KnowledgeRAG-OGAS.git
cd KnowledgeRAG-OGAS
```

### 4. 安装后端依赖

```bash
task install
```

等价于在 `backend/` 下执行 `uv sync`：自动创建 `backend/.venv` 并安装 `pyproject.toml` 声明的全部依赖。

验证：

```bash
backend/.venv/bin/python --version   # 应输出 Python 3.12.x
task --list-all                      # 查看全部可用任务
```

### 5. 启动依赖（Docker）

```bash
task deps-up      # 启动 PostgreSQL / Redis / RabbitMQ
task deps-status  # 三个容器均应显示 healthy
```

| 容器 | 服务 | 宿主机端口 | 默认账号 |
| --- | --- | --- | --- |
| `ragf_postgres` | PostgreSQL 16 | 5432 | `postgres` / `123456` |
| `ragf_redis` | Redis | 6379 | - |
| `ragf_rabbitmq` | RabbitMQ 3.13 | 5672（管理台 15672） | `guest` / `guest` |

### 6. 启动项目

```bash
task dev
```

自动完成：① 拉起 Docker 依赖（已运行则跳过）→ ② 在宿主机启动后端开发服务器（热重载）。

- API 文档： <http://127.0.0.1:8000/docs>
- OpenAPI JSON： <http://127.0.0.1:8000/openapi>

修改代码后服务器自动重启；按 `Ctrl+C` 停止开发环境。

> 本地环境变量位于 `backend/src/.env`，已默认指向 localhost 映射端口，一般无需修改。

### 7. 项目初始化说明

| 项目 | 初始化方式 | 说明 |
| --- | --- | --- |
| 数据库表 | 自动 | 后端启动时自动 `create_all` 建表，无需手动迁移（Alembic 迁移为占位，未上线不生成脚本） |
| Redis | 自动 | 后端启动时自动初始化连接与状态 |
| 消息队列 | 手动 | Celery broker 为 Redis（db 1），结果写入 PostgreSQL；需另开终端 `task worker` |
| 定时任务 | 手动 | 需另开终端 `task beat`（调度器：DatabaseScheduler） |
| 初始化数据 | 可选 | `task db-init` 导入部门/菜单等种子数据（幂等，已初始化自动跳过） |

> 首次使用流程：`task deps-up` → `task dev`（自动建表）→ 另开终端 `task worker`（异步任务）→ 可选 `task db-init`（种子数据）。

---

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `task init` | 一键初始化（依赖安装 → 容器 → 建表 → 种子数据） |
| `task env:check` | 校验各层 env 账号字段一致性 |
| `task build` / `task docker-build` | 构建安装包 / Docker 镜像 |
| `task dev` | 一键启动本地开发环境（依赖 + 后端） |
| `task backend:dev` | 单独启动后端（热重载，端口 8000） |
| `task backend:run` | 通过 `run.py` 启动后端（IDE 调试友好） |
| `task deps-up` / `task deps-down` | 启动 / 停止 Docker 依赖 |
| `task deps-status` / `task deps-logs` | 依赖状态 / 日志 |
| `task worker` | 启动 Celery Worker（异步任务消费者） |
| `task beat` | 启动 Celery Beat（定时任务调度器） |
| `task db-init` | 导入数据库初始化数据（可选，幂等） |
| `task install` | 安装全部依赖 |
| `task lint` / `task format` | 代码检查 / 格式化 |
| `task test` | 运行测试（后端域内单测 + 前端 vitest） |
| `task backend:e2e` | 接口自动化测试（详见 [测试](#-测试)） |

---

## 测试

分两层，都在 `backend/`：

| 命令 | 范围 | 前置 |
| --- | --- | --- |
| `cd backend && .venv/bin/pytest src/` | 域内单测 / 集成测（默认 `testpaths=src`，直接 `pytest` 等价） | 无 |
| `cd backend && .venv/bin/pytest e2e/ -m "not chain"` | 接口自动化：进程内打**真实 ASGI 栈**（中间件链、依赖注入、路由、鉴权全走），不 override 鉴权依赖 | `task deps-up` |
| `cd backend && .venv/bin/pytest e2e/` | 全量接口用例（含 RAG 链路） | 依赖容器 + `task backend:worker:test` |

Taskfile 等价入口：`task backend:test` / `task backend:e2e`（追加参数走 `--`，如 `task backend:e2e -- -m p0`）。

按优先级筛选：`-m p0` 冒烟（基建自检 + 权限矩阵）、`-m p1` 回归（文档 / 检索 / RAG 链路）、`-m p2` 扩展（MCP 工具面、模型供应商）。

接口测试**不需要单独的 env 文件**：`backend/e2e/conftest.py` 在进程内把默认数据源重指到 `{DATABASE_SCHEMA}_test`（即 `ragf_test`）并幂等建库，dev 库不受影响。

### chain 用例

标了 `@pytest.mark.chain` 的用例跑的是**真实异步链路**：`test_rag_pipeline_e2e.py` 整个文件（上传 → 摄取 → 检索 → 问答 → 引用回查、SSE 与非流式同源、rebuild、`sha256` 去重、文档级 ACL × 召回、三档 visibility 结果集、`ragf_visual` 视觉集合 ACL），加 `test_chat_stream_e2e.py` 两条有命中的 SSE 协议用例。摄取侧由 Celery Worker 真排队执行（真 embedding / 精排，需模型供应商凭据），问答侧用 LLM 替身。

- Worker 必须**指向测试库**：API 侧在进程内切 `ragf_test`，而 Worker 是独立进程、按 `DATABASE_SCHEMA` 连库。用 `task worker` 起的 Worker 读的是 dev 库，找不到测试库里的文档行，chain 用例必然超时失败；因此用 `task backend:worker:test`（内部即 `DATABASE_SCHEMA=ragf_test`）。
- Worker 不可达时（`inspect().ping()` 无响应）这批用例自动 skip、其余照跑，所以没起 Worker 时也可以直接跑 `pytest e2e/`，不会假失败。

用例矩阵与断言依据见 [接口测试规格](docs/specs/2026-09-21-backend-api-test-spec.md)。

---

## 项目结构

```
├── backend/            # FastAPI 后端（包、配置、插件、迁移）
│   ├── src/.env        # 本地开发环境变量
│   └── Taskfile.yml    # 后端任务
├── frontend/           # React 19 前端（Vite + shadcn/ui）
├── deploy/             # Docker 部署配置（Compose / Nginx / 监控）
├── docker-compose.yml  # 依赖与全量服务编排
├── docs/               # VitePress 文档站
└── Taskfile.yml        # 项目任务统一入口
```

---

## 打包与构建

```bash
task build                    # 构建后端 Python 安装包（wheel + sdist → backend/dist）
task docker-build             # 构建 Docker 镜像（ragf_server + Celery 全服务）
task docker-build DOCKER_SERVICES=ragf_server   # 构建单个镜像
task backend:export           # 导出 requirements.txt
```

详细打包配置与部署说明见 [构建与部署](docs/工程治理/构建与部署.md)。

## 文档

- [本地启动指南](docs/开始/index.md) — 从拉取代码到运行项目的完整流程
- [API 文档](http://127.0.0.1:8000/docs) — 后端运行后访问
- 文档站：`cd docs && pnpm install && pnpm run dev` → <http://localhost:6632>

---

## License

MIT
