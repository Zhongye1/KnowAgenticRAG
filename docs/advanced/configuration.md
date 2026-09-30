# 配置系统详解

## 概述

系统采用分层配置架构，模型供应商和运行时系统配置由网页界面管理，启动期配置由环境变量提供。

## 配置层级

```
代码默认值 → 环境变量 → PostgreSQL 管理员配置
   (低)                              (高)
```

## 模型配置

由网页统一管理，详见 [模型配置](../intro/model-config.md)。

## 应用配置

运行时系统配置定义于 `backend/package/ars/config/options.py`，管理员通过系统配置页面或 `/api/system/config` 接口修改，值保存到 PostgreSQL。API 与 worker 通过 Redis 短期缓存共享配置；Redis 不可用时直接回源 PostgreSQL。

### 读取配置

```python
from ars.config.options import system_options

values = await system_options.get()
default_model = values["default_model"]
```

管理员更新配置后，服务先提交 PostgreSQL，再失效 Redis 缓存。运行中的 API 和 worker 会在下一次读取时获得最新配置，不需要重启。

Project、User Data、Skill source 与 Skill projection 使用各自的显式存储目录；数据库、Redis 和 sandbox 仍属于启动期环境变量配置。LangGraph checkpoint 固定使用 PostgreSQL，不提供后端选择。运行中的已初始化组件不承诺启动期配置热更新，修改后需要重启服务。

系统配置以 PostgreSQL 为唯一事实源。旧数据库系统配置仍可一次性迁移；`SAVE_DIR` 与 `saves/config/base.toml` 已不再进入 shipping 配置面。
