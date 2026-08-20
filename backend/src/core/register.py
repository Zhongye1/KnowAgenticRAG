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

import asyncio
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from common.cache.pubsub import cache_pubsub_manager
from common.log import set_custom_logfile, setup_logging
from database.db import create_tables, dispose_database
from database.redis import redis_client
from fastapi import FastAPI
from middleware.jwt_auth_middleware import JwtAuthMiddleware
from starlette.middleware.authentication import AuthenticationMiddleware
from starlette.staticfiles import StaticFiles

from backend.src.common.lifespan import lifespan_manager
from backend.src.core.config import settings
from backend.src.core.path_conf import STATIC_DIR, UPLOAD_DIR
from backend.src.middleware.logs_middleware import OperaLogMiddleware
from backend.src.middleware.request_state_middleware import StateMiddleware
from backend.src.utils.serializers import MsgSpecJSONResponse
from backend.src.utils.snowflake import snowflake


@lifespan_manager.register
@asynccontextmanager
async def register_init(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    启动初始化

    :param app: FastAPI 应用实例
    :return:
    """
    # 创建数据库表
    await create_tables()

    # 初始化 redis
    await redis_client.init()

    # 初始化 snowflake 节点
    await snowflake.init()

    # 创建操作日志任务
    opera_log_task = asyncio.create_task(OperaLogMiddleware.consumer())

    # 启动缓存 Pub/Sub 监听器
    cache_pubsub_manager.start_listener()

    try:
        yield
    finally:
        # 停止缓存 Pub/Sub 监听器
        await cache_pubsub_manager.stop_listener()

        # 取消操作日志任务
        if not opera_log_task.done():
            opera_log_task.cancel()
            try:
                await opera_log_task
            except asyncio.CancelledError:
                pass

        # 释放 snowflake 节点
        await snowflake.shutdown()

        # 关闭 redis 连接
        await redis_client.aclose()

        # 释放数据库连接池
        await dispose_database()


def register_app() -> FastAPI:
    """注册 FastAPI 应用"""

    app = FastAPI(
        title=settings.FASTAPI_TITLE,
        version=settings.FASTAPI_VERSION,
        description=settings.FASTAPI_DESCRIPTION,
        docs_url=settings.FASTAPI_DOCS_URL,
        redoc_url=settings.FASTAPI_REDOC_URL,
        openapi_url=settings.FASTAPI_OPENAPI_URL,
        default_response_class=MsgSpecJSONResponse,
        lifespan=lifespan_manager.build(),
    )

    # 注册组件

    return app


def register_logger() -> None:
    """注册日志"""
    setup_logging()
    set_custom_logfile()


def register_static_file(app: FastAPI) -> None:
    """
    注册静态资源服务

    :param app: FastAPI 应用实例
    :return:
    """
    # 上传静态资源
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)
    app.mount("/static/upload", StaticFiles(directory=UPLOAD_DIR), name="upload")

    # 固有静态资源
    if settings.FASTAPI_STATIC_FILES:
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def register_middleware(app: FastAPI) -> None:
    """
    注册中间件（执行顺序从下往上）

    :param app: FastAPI 应用实例
    :return:
    """
    # Opera log 操作日志中间件
    app.add_middleware(OperaLogMiddleware)

    # State 请求状态中间件
    app.add_middleware(StateMiddleware)

    # JWT auth 鉴权中间件
    app.add_middleware(
        AuthenticationMiddleware,
        backend=JwtAuthMiddleware(),
        on_error=JwtAuthMiddleware.auth_exception_handler,
    )

    # I18n
    app.add_middleware(I18nMiddleware)

    # Access log
    app.add_middleware(AccessMiddleware)

    # ContextVar
    plugins = (
        [OtelTraceIdPlugin()]
        if settings.GRAFANA_METRICS_ENABLE
        else [RequestIdPlugin(validate=True)]
    )
    app.add_middleware(
        ContextMiddleware,
        plugins=plugins,
        default_error_response=MsgSpecJSONResponse(
            content={
                "code": StandardResponseCode.HTTP_400,
                "msg": "BAD_REQUEST",
                "data": None,
            },
            status_code=StandardResponseCode.HTTP_400,
        ),
    )

    # CORS
    # https://github.com/fastapi-practices/fastapi-best-architecture/pull/789/changes
    # https://github.com/open-telemetry/opentelemetry-python-contrib/issues/4031
    if settings.MIDDLEWARE_CORS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.CORS_ALLOWED_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=settings.CORS_EXPOSE_HEADERS,
        )
