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

from common import socketio
from common.cache.pubsub import cache_pubsub_manager
from common.exception.exception_handler import register_exception
from common.log import set_custom_logfile, setup_logging
from common.observability.otel import init_otel
from common.response.response_code import StandardResponseCode
from database.db import create_tables, dispose_database
from database.redis import redis_client
from fastapi import FastAPI
from fastapi.params import Depends
from fastapi_pagination import add_pagination
from middleware.access_middleware import AccessMiddleware
from middleware.i18n_middleware import I18nMiddleware
from middleware.jwt_auth_middleware import JwtAuthMiddleware
from plugin.hooks import init_plugin_otel_hooks, register_plugin_hooks
from plugin.router import build_final_router
from prometheus_client import make_asgi_app
from starlette.middleware.authentication import AuthenticationMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from starlette_context.middleware import ContextMiddleware
from starlette_context.plugins import RequestIdPlugin
from utils.demo_mode import demo_site
from utils.openapi import ensure_unique_route_names, simplify_operation_ids
from utils.trace_id import OtelTraceIdPlugin

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
    register_logger()
    register_socket_app(app)
    register_static_file(app)
    register_middleware(app)
    register_router(app)
    register_page(app)
    register_exception(app)

    # 注册插件钩子
    register_plugin_hooks(app)

    if settings.GRAFANA_METRICS_ENABLE:
        register_metrics(app)

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

    # I18n 中间件
    app.add_middleware(I18nMiddleware)

    # Access log 访问日志中间件
    app.add_middleware(AccessMiddleware)

    # ContextVar
    # 请求上下文（ContextVar）中间件注册，给每个请求注入一个"请求追踪 ID"，放进 ContextVar 上下文供后续代码（日志，Context中间件等）读取
    if settings.GRAFANA_METRICS_ENABLE:
        # 开启可观测性，日志关联到 Tempo 的调用链（同一个 Trace ID）
        plugins = [OtelTraceIdPlugin()]
    else:
        # 生成一个随机 UUID，无法与 OTel 链路关联
        plugins = [RequestIdPlugin(validate=True)]

    app.add_middleware(
        ContextMiddleware,
        plugins=plugins,  # 进入请求时，插件把 trace_id/request_id 注入上下文
        # 兜底
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


def register_router(app: FastAPI) -> None:
    """
    注册路由

    :param app: FastAPI 应用实例
    :return:
    """

    if settings.DEMO_MODE:
        dependencies = Depends(demo_site())
    else:
        dependencies = None

    # API
    router = build_final_router()
    app.include_router(router, dependencies=dependencies)

    # Extra
    ensure_unique_route_names(app)
    simplify_operation_ids(app)


def register_page(app: FastAPI) -> None:
    """
    注册分页查询功能

    :param app: FastAPI 应用实例
    :return:
    """
    add_pagination(app)


def register_socket_app(app: FastAPI) -> None:
    """
    注册 Socket.IO 应用

    :param app: FastAPI 应用实例
    :return:
    """
    from backend.src.common.socketio.server import sio

    socket_app = socketio.ASGIApp(
        socketio_server=sio,
        other_asgi_app=app,
        # 切勿删除此配置：https://github.com/pyropy/fastapi-socketio/issues/51
        socketio_path="/ws/socket.io",
    )
    app.mount("/ws", socket_app)


def register_metrics(app: FastAPI) -> None:
    """
    注册指标

    :param app: FastAPI 应用实例
    :return:
    """
    metrics_app = make_asgi_app()
    app.mount(settings.GRAFANA_METRICS_PATH, metrics_app)

    init_otel(app)
    init_plugin_otel_hooks(app)
