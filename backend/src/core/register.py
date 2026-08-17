"""
FastAPI 项目的应用工厂
这里将各种基础设施（数据库、Redis、日志、中间件、路由、监控、WebSocket）组装成一个完整的应用

register_app()          # 总装入口
├── register_init()     # 生命周期：启动/关闭（lifespan）
├── register_logger()   # 日志系统
├── register_socket_app()  # WebSocket (Socket.IO)
├── register_static_file() # 静态资源
├── register_middleware()  # 中间件栈（7层）
├── register_router()      # 业务路由
├── register_page()        # 分页插件
├── register_exception()   # 全局异常处理
├── register_plugin_hooks() # 插件扩展
└── register_metrics()     # Prometheus + OpenTelemetry

"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI

from src.common.lifespan import lifespan_manager


@lifespan_manager.register
@asynccontextmanager
async    def regsiter_init(app: FastAPI) -> AsyncGenerator[None,None]:
    """启动初始化
    :param app: FastAPI 应用实例
    :return:
    """
