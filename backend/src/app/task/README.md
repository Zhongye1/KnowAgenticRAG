## 任务介绍

任务使用 Celery 实现，实施看 [#225](https://github.com/fastapi-practices/fastapi-best-architecture/discussions/225)

## 定时任务

在 `backend/app/task/tasks/beat.py` 文件内编写相关定时任务

### 简单任务

在 `backend/app/task/tasks/tasks.py` 文件内编写相关任务代码

### 层级任务

如果你想对任务进行目录层级划分，使任务结构更加清晰，你可以新建任意目录，但必须注意的是

1. 在 `backend/app/task/tasks` 目录下新建 python 包目录
2. 在新建目录下，务必添加 `tasks.py` 文件，并在此文件中编写相关任务代码

## 消息代理

你可以通过 `CELERY_BROKER` 控制消息代理选择，它支持 redis 和 rabbitmq

对于本地调试，建议使用 redis

对于线上环境，强制使用 rabbitmq

## 1. 整体分层

```
task/
├── celery.py            # Celery App 初始化（唯一入口，创建 celery_app 单例）
├── tasks/               # 任务定义（支持目录层级）
│   ├── beat.py          # 本地硬编码 beat 计划
│   ├── base.py          # TaskBase 任务基类（钩子 + 重试）
│   ├── tasks.py         # 示例任务
│   └── db_log/tasks.py  # 子包任务（清理日志）
├── model/               # ORM：TaskScheduler 调度表 + 结果表
├── database.py / session.py  # 自定义结果存储后端（DB backend）
├── utils/
│   ├── schedulers.py    # DatabaseScheduler（数据库驱动调度器）
│   └── tzcrontab.py     # 时区感知 Crontab
├── service / crud / schema / api   # 调度/结果/worker 的管理接口
└── actions.py           # Socket.IO 实时推送 worker 状态
```

## 2. Celery 初始化（`celery.py`）

- **Broker 双支持**：按 `CELERY_BROKER` 在 redis / rabbitmq 间切换（本地 redis，生产强制 rabbitmq）`celery.py:52-54`。
- **结果后端用数据库**：`result_backend` 走 PG/MySQL，与 fba 统一数据层 `celery.py:56-58`，而非默认 RPC/Redis。
- **异步任务补丁**：因为当前 celery < 6.0 不支持原生 `async def` 任务，用 `celery_aio_pool.build_async_tracer` 替换 tracer 来支持协程 任务 `celery.py:46-50`。
- **可观测性**：`worker_process_init` 信号里初始化 OpenTelemetry 追踪（带幂等保护）`celery.py:19-30`。
- **自动发现任务**：`find_task_packages()` 遍历 `tasks/` 目录，凡是包含 `tasks.py` 的包都纳入 `autodiscover_tasks` `celery.py:33-40,84-86`。这就是「层级任务」约定的来源——子目录必须是 Python 包且必须含 `tasks.py`（`README.md:13-18`）。
- **注入自定义组件**：`task_cls=TaskBase`、`beat_scheduler=DatabaseScheduler`、结果后端用自建 `DatabaseBackend` `celery.py:71-82`。

## 3. 任务定义与基类（`tasks/`）

- 示例任务展示了三种形态：同步、异步、`async` 带参 `tasks/tasks.py`。
- `TaskBase`（`tasks/base.py`）是核心抽象：
    - `autoretry_for=(SQLAlchemyError,)` + `max_retries` 自动重试数据库错误 `base.py:15-16`；
    - `before_start / on_success / on_failure` 钩子通过 `task_notification` 经 **Socket.IO 实时推送**任务状态 `base.py:18-46`。
- 子包任务（如 `db_log/tasks.py`）用 `@shared_task` 且直接接入 fba 的 `async_db_session`，体现「业务任务即普通 service 调用」。

## 4. 定时调度：本地 + 数据库双源

这是设计上最复杂的部分：

- **本地源**：`get_local_beat_schedule()` 硬编码示例与「每周六清操作日志 / 每月 15 号清登录日志」`tasks/beat.py`。
- **数据库源 `DatabaseScheduler`**（`utils/schedulers.py`）：把调度配置存进 `task_scheduler` 表，支持运行时增删改，无需重启 beat。
    - `ModelEntry` 把一行 `TaskScheduler` 映射成 Celery 的 `ScheduleEntry`，处理 interval / crontab 两种类型、参数 JSON 解析、启用/禁用 、`one_off` 一次性任务、开始时间判断 `schedulers.py:42-138`。
    - **变更感知**：模型在 insert/update/delete 时通过 SQLAlchemy 事件把时间戳写进 Redis `:last_update`；`schedule_changed()` 读取该值，beat 每 `max_interval=5s` 唤醒检查并热重载 `schedulers.py:371-427`。
    - **分布式锁**：`@beat_init` 时向 Redis 申请 `beat_lock`，保证多 beat 实例只有一把在发任务 `schedulers.py:430-451`。
    - **异常自愈**：参数错误或计划为空的条目会被 `_disable()` 自动置 `enabled=False`，避免 beat 崩溃 `schedulers.py:63-72`。

## 5. 结果存储后端（`database.py` / `session.py`）

原生 celery `DatabaseBackend` 与 fba 的模型/迁移体系冲突，于是**重写**：
- `DatabaseBackend` 复用 fba 自有 `Task / TaskSet / TaskExtended` 模型（见 `model/result.py`），实现增删查、过期清理 `database.py:13-176`。
- `SessionManager` 重写 `prepared=True`，**禁止 celery 自建结果表**，改由 fba 的 Alembic 统一管理 `session.py:9-12`。

## 6. 时区（`utils/tzcrontab.py`）

`TzAwareCrontab` 在原生 crontab 基础上注入 `nowfun=timezone.now`，配合 celery `enable_utc=False` + 全局时区，使定时任务按配置时区触发 而非 UTC `tzcrontab.py:8-20`；`crontab_verify` 做 5 段标准表达式校验。

## 7. 管理与实时层

- API：`/tasks`（worker 控制）、`/task-results`（执行结果）、`/schedulers`（调度 CRUD），标准 service→crud→schema 分层 `api/router.py`。
- `actions.py`：Socket.IO 事件 `task_worker_status`，用 `celery_app.control.ping` 在线程池里探测 worker 存活并回推前端。

---

**设计上的关键取舍**：
① celery<6 用 `celery_aio_pool` 补 async 支持；
② 为兼容 ORM/迁移体系重写结果后端；
③ 用「数据库 + Redis 变更标志 + Redis 分布式锁」实现可热更新的动态调度，而非纯静态 beat 配置。这些点也是后续若升级 celery 6 或要上多 beat 时最需要注意的地方。
