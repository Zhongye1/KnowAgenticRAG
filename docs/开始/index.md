---
title: 本地启动指南
description: 从拉取代码到环境安装、启动依赖、运行项目的完整本地开发流程
---

# 本地启动指南

> 开发模式约定：**依赖跑 Docker 容器，代码跑宿主机**。
> 本指南覆盖完整流程：拉取代码 → 安装环境 → 启动依赖 → 启动项目。

## 0. 一键初始化（推荐）

代码拉取、工具安装完成后，一条命令完成全部初始化：

```bash
task init
```

自动执行：安装依赖 → 启动并等待依赖容器健康 → 建表与 Redis 初始化 → 导入种子数据（幂等，可重复执行）。

完成后启动项目：

```bash
task dev       # 启动后端（热重载）；异步任务另开终端 task worker
```

> 分步说明见下方各节，`task init` 是它们的组合。

## 1. 环境要求

| 软件 | 版本要求 | 用途 |
| --- | --- | --- |
| Git | 较新版本即可 | 拉取代码 |
| Docker | 24+（含 Docker Compose v2） | 运行依赖容器 |
| uv | 0.12+ | Python 包管理与虚拟环境 |
| Task | 3.x | 项目任务统一入口 |

后端运行时（Python 3.12+）由 uv 自动下载管理，无需手动安装；Node.js / pnpm 仅文档站需要，可选安装。

### 安装 uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
# 安装完成后重启终端（或 source ~/.bashrc）使命令生效
uv --version
```

### 安装 Task

任选其一：

```bash
# Homebrew（macOS / Linux）
brew install go-task/tap/go-task

# Go
go install github.com/go-task/task/v3/cmd/task@latest

# npm
npm install -g @go-task/cli
```

验证：`task --version`

> Windows 可参考 [taskfile.dev/installation](https://taskfile.dev/installation/)（推荐 winget / scoop）。Docker 建议直接安装 Docker Desktop。

## 2. 拉取代码

```bash
git clone https://github.com/Zhongye1/KnowledgeRAG-OGAS.git
cd KnowledgeRAG-OGAS
```

## 3. 安装后端依赖

```bash
task install
```

等价于在 `backend/` 目录下执行 `uv sync`：自动创建 `backend/.venv` 虚拟环境，并按 `pyproject.toml` / `uv.lock` 安装全部后端依赖。

验证安装：

```bash
backend/.venv/bin/python --version   # 应输出 Python 3.12.x
task --list-all                      # 查看全部可用任务
```

> 环境变量：本地开发读取 `backend/src/.env`，已默认指向 `localhost:5432 / 6379 / 5672`（即下方 Docker 映射端口），一般无需修改。

## 4. 启动依赖（Docker）

```bash
task deps-up
```

启动 3 个依赖容器，并自动等待健康检查通过：

| 容器 | 服务 | 宿主机端口 | 默认账号 |
| --- | --- | --- | --- |
| `ragf_postgres` | PostgreSQL 16 | 5432 | `postgres` / `123456` |
| `ragf_redis` | Redis | 6379 | - |
| `ragf_rabbitmq` | RabbitMQ 3.13 | 5672（管理台 15672） | `guest` / `guest` |

查看状态与日志：

```bash
task deps-status    # 三个服务均应显示 healthy
task deps-logs      # 跟踪容器日志（Ctrl+C 退出）
```

## 5. 启动项目

### 一键启动（推荐）

```bash
task dev
```

该命令自动完成两步：① 拉起 Docker 依赖（已运行则跳过）→ ② 在宿主机启动后端开发服务器（热重载）。

- API 文档： <http://127.0.0.1:8000/docs>
- OpenAPI JSON： <http://127.0.0.1:8000/openapi>

修改后端代码后服务器会自动重启，无需手动操作。停止开发环境：在该终端按 `Ctrl+C`。

### 项目初始化说明

| 项目 | 初始化方式 | 说明 |
| --- | --- | --- |
| 数据库表 | 自动 | 后端启动时自动 `create_all` 建表，无需手动迁移（Alembic 迁移目录暂为空） |
| Redis | 自动 | 后端启动时自动初始化连接与状态 |
| 消息队列 | 手动 | Celery broker 为 Redis（db 1），结果写入 PostgreSQL；需另开终端 `task worker` |
| 定时任务 | 手动 | 需另开终端 `task beat`（调度器：DatabaseScheduler） |
| 初始化数据 | 可选 | `task db-init` 导入部门/菜单等种子数据（幂等，已初始化自动跳过） |

> 首次使用流程：`task deps-up` → `task dev`（自动建表）→ 另开终端 `task worker`（异步任务）→ 可选 `task db-init`（种子数据）。

### 单独启动后端

```bash
task backend:dev      # 热重载模式（默认推荐）
task backend:run      # 通过 run.py 启动（IDE 调试友好）
```

## 6. 常用命令速查

| 命令 | 说明 |
| --- | --- |
| `task init` | 一键初始化（依赖安装 → 容器 → 建表 → 种子数据） |
| `task dev` | 一键启动本地开发环境（依赖 + 后端） |
| `task deps-up` / `task deps-down` | 启动 / 停止 Docker 依赖 |
| `task deps-status` / `task deps-logs` | 依赖状态 / 日志 |
| `task worker` | 启动 Celery Worker（异步任务消费者） |
| `task beat` | 启动 Celery Beat（定时任务调度器） |
| `task db-init` | 导入数据库初始化数据（可选，幂等） |
| `task install` | 安装全部依赖 |
| `task lint` / `task format` | 代码检查 / 格式化 |
| `task test` | 运行测试 |

## 7. 常见问题

**`task: command not found`**
按第 1 节安装 Task CLI。

**`docker: permission denied` 或无法连接 Docker daemon**
启动 Docker（Docker Desktop，或 Linux 下 `systemctl start docker`），并确认当前用户已加入 `docker` 用户组。

**`task deps-status` 显示容器未 healthy**
健康检查需要数秒，稍等后重试；仍失败可 `task deps-logs` 查看容器日志定位。

**后端启动报数据库 / Redis 连接超时**
先确认 `task deps-status` 三个容器均为 healthy；再检查 `backend/src/.env` 中 `DATABASE_HOST`、`REDIS_HOST`、`CELERY_RABBITMQ_HOST` 是否为 `localhost`，端口与第 4 节表格一致。

**端口 8000 被占用**
修改 `backend/Taskfile.yml` 中 `backend:dev` 任务的 `--port`，或结束占用进程。

**前端工程尚未迁移**
`frontend:dev` 目前为占位任务，暂无需启动前端即可使用后端 API。
