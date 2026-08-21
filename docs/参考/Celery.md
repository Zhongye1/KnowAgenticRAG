# Celery

Celery 是 Python 生态中成熟的分布式任务队列。它的概念较多，初次接触时不容易快速理解，因此本页会结合 fba 的集成方式说明它的核心组件和使用场景

## 为什么选择 Celery?

Celery 是基于 Python 的分布式任务队列系统，适合处理耗时任务、周期任务和需要后台执行的业务逻辑。任务会由独立 Worker 进程执行，不会阻塞 FastAPI 主应用进程，从而提升接口响应速度和系统吞吐量。fba 迁移到 Celery 的相关讨论可查看：#225

## Broker（消息代理/中间件）

在 Celery 词汇表 中对 Broker 有以下描述：

> 企业集成模式 将 消息代理 定义为一种架构构件，它可以接收来自多个目的地的 消息 ，确定正确的目的地并将消息路由到正确的通道

在 Celery 中，我们可以将它视为存储已创建的调度任务并进行消息传递的桥梁，而它本身并不会执行任务；当任务被调度时，Broker 会存储调度任务消息，当 Worker 执行任务时，会从 Broker 调度任务消息中提取任务，因此，Broker 是 Celery 工作的重要组件

Celery 在文档 后端和代码 中列出了所支持的消息代理，fba 将通过 `ENVIRONMENT` 环境变量来自动选择使用 Redis 还是 RabbitMQ

```python
@model_validator(mode='before')
@classmethod
def check_env(cls, values):
    if values['ENVIRONMENT'] == 'prod':
        # dev 环境默认使用 redis，如果是 prod 环境，则使用 rabbitmq
        values['CELERY_BROKER'] = 'rabbitmq'
    return values
```

## Worker

Worker 是调度任务的实际执行者，它从 Broker 中提取任务并执行，并且这是一种监听行为，当 Broker 接收调度信息后，Worker 就会提取任务并执行

如果没有 Worker 运行，调度任务消息会在 Broker 中积压，直到有 Worker 接收并执行

fba 支持通过 Docker 快捷的分布式扩容 Worker 数量：

```bash
docker compose up -d --scale fba_celery_worker=3
```

## Backend

Celery 用户指南中的 任务页面 对 Backend 有如下介绍：

> 如果你想跟踪任务或需要返回值，那么 Celery 必须将状态存储或发送到某个地方，以便日后检索。有几种内置的结果后端可供您选择：SQLAlchemy/Django ORM、Memcached、RabbitMQ/QPid (rpc) 和 Redis，您也可以定义自己的后端；没有哪种后端能很好地适用于每种使用情况。 您应该了解每个后端的优缺点，然后选择最适合您需求的后端

我们在 fba 中使用数据库作为默认存储后端

### 场景假设：跟踪异步任务的结果并返回结果

你正在构建一个耗时的生成测试报告的任务程序，为了在页面中直观的看到效果，你可以在前端项目中触发启动任务接口，FastAPI 收到请求后，触发 Celery 执行任务，此时，任务已经在 Celery 中执行，而不会阻塞 FastAPI 主应用，也不会占用 FastAPI 主应用资源，等待任务执行完成后，FastAPI 将返回任务结果，然后前端再对返回结果进行处理

在上述场景中，任务会将结果存储到 Backend，你可以在 Celery 状态文档中查看所有状态信息；Celery 执行任务并不强制要求使用 Backend，但是，如果你需要查看任务的结果，我们则推荐你这么做

## 优雅的集成

我们在 fba 中以非常优雅的方式集成了 Celery，你无需担心 Celery 苛刻的文件结构成本，只需通过简单的配置就可以轻松使用它，并且，我们支持直接创建异步函数的任务， 在 Celery6.0 版本之前，官网不提供异步函数支持

进入源码 `backend/app` 目录，其中，`task` 目录就是我们的 Celery 应用程序，如果你不想使用它，而是使用其他任务应用，可以直接删除此文件夹

## 执行池

我们要根据实际情况为 worker 选择不同的执行池，目前推荐以下几种类型：

- prefork
- threads
- gevent

任务涉及大量计算（如图像处理、数据计算等）：

```bash
celery -A backend.app.task.celery worker -l info -P prefork
```

## 并发数

celery 提供了 worker 并发数 `-c` 设置，参考如下：

- prefork
- threads
- gevent

并发数建议设置为 CPU 核心数的 1 到 2 倍

```bash
celery -A backend.app.task.celery worker -l info -P gevent -c 1000
```

## 队列

celery 提供了 queue（队列），我们可以在 celery 配置中添加如下代码：

```python
app.conf.task_queues = (
    Queue('cpu_bind', routing_key='cpu'),  # cpu 密集型绑定队列
    Queue('io_bind', routing_key='io'),    # io 密集型绑定队列
    Queue('all_in'),                   # 无路由键的简单队列
)
```

启动 worker 时，需要添加 `-Q` 参数指定队列进行启动，例如：

```bash
celery -A backend.app.task.celery worker -l info -P gevent -c 1000 -Q cpu_bind  # 启动 cpu worker
celery -A backend.app.task.celery worker -l info -P gevent -c 1000 -Q io_bind  # 启动 io worker
```

接下来，我们就可以像下面这样在任务定义的时候指定队列运行任务了

```python
from backend.app.task.celery import celery_app


@celery_app.task(queue='io_bind')
async def io_bind_task():
    ...
```
