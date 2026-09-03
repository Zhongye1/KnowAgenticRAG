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
from typing import Any

import socketio

from fastapi import FastAPI
from fastapi.params import Depends
from fastapi_pagination import add_pagination
from prometheus_client import make_asgi_app
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.authentication import AuthenticationMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from starlette_context.middleware import ContextMiddleware
from starlette_context.plugins import RequestIdPlugin

from backend import __version__
from backend.src.common.cache.pubsub import cache_pubsub_manager
from backend.src.common.exception.exception_handler import register_exception
from backend.src.common.lifespan import lifespan_manager
from backend.src.common.log import set_custom_logfile, setup_logging
from backend.src.common.observability.otel import init_otel
from backend.src.common.response.response_code import StandardResponseCode
from backend.src.core.config import settings
from backend.src.core.path_conf import STATIC_DIR, UPLOAD_DIR
from backend.src.database.db import create_tables, dispose_database
from backend.src.database.milvus import milvus_client
from backend.src.database.minio import minio_client
from backend.src.database.redis import redis_client
from backend.src.middleware.access_middleware import AccessMiddleware
from backend.src.middleware.i18n_middleware import I18nMiddleware
from backend.src.middleware.jwt_auth_middleware import JwtAuthMiddleware
from backend.src.middleware.logs_middleware import OperaLogMiddleware
from backend.src.middleware.request_state_middleware import StateMiddleware
from backend.src.plugin.hooks import init_plugin_otel_hooks, register_plugin_hooks
from backend.src.plugin.router import build_final_router
from backend.src.utils.demo_mode import demo_site
from backend.src.utils.openapi import ensure_unique_route_names, simplify_operation_ids
from backend.src.utils.serializers import MsgSpecJSONResponse
from backend.src.utils.snowflake import snowflake
from backend.src.utils.trace_id import OtelTraceIdPlugin


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

    # 初始化向量数据库 milvus
    await milvus_client.init()

    # 初始化多租户 Milvus 连接池（按域绑定 Database）与基础集合
    from backend.src.database.milvus_kb_ops import ensure_base_collections, ensure_ragf_template_collection
    from backend.src.database.milvus_pool import get_milvus_pool

    milvus_pool = get_milvus_pool()
    milvus_pool.ensure_database()
    ensure_base_collections()
    ensure_ragf_template_collection()

    # 幂等确保默认 modelscope provider（D11/D16；表已由 create_tables 建好）
    from backend.src.app.model_provider.service.provider_service import provider_service
    from backend.src.database.db import async_db_session

    async with async_db_session() as session:
        await provider_service.ensure_default_modelscope(session)

    # 初始化对象存储 minio
    await minio_client.init()

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

        # 释放 milvus 连接
        await milvus_client.close()

        # 清空多租户 Milvus 连接池引用
        milvus_pool.close_all()

        # 释放 minio 连接
        await minio_client.close()

        # 释放数据库连接池
        await dispose_database()


def register_app() -> FastAPI:
    """注册 FastAPI 应用"""

    app = FastAPI(
        title=settings.FASTAPI_TITLE,
        version=__version__,
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
    app.mount('/static/upload', StaticFiles(directory=UPLOAD_DIR), name='upload')

    # 固有静态资源
    if settings.FASTAPI_STATIC_FILES:
        app.mount('/static', StaticFiles(directory=STATIC_DIR), name='static')


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
    # 请求上下文（ContextVar）中间件注册，给每个请求注入请求追踪 ID
    plugins = [OtelTraceIdPlugin()] if settings.GRAFANA_METRICS_ENABLE else [RequestIdPlugin(validate=True)]

    app.add_middleware(
        ContextMiddleware,
        plugins=plugins,  # 进入请求时，插件把 trace_id/request_id 注入上下文
        # 兜底
        default_error_response=MsgSpecJSONResponse(
            content={
                'code': StandardResponseCode.HTTP_400,
                'msg': 'BAD_REQUEST',
                'data': None,
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
            allow_methods=['*'],
            allow_headers=['*'],
            expose_headers=settings.CORS_EXPOSE_HEADERS,
        )


def register_router(app: FastAPI) -> None:
    """
    注册路由

    :param app: FastAPI 应用实例
    :return:
    """

    dependencies = Depends(demo_site()) if settings.DEMO_MODE else None

    # API
    router = build_final_router()
    app.include_router(router, dependencies=dependencies)

    # Extra
    ensure_unique_route_names(app)
    simplify_operation_ids(app)

    register_health_check(app)


def register_health_check(app: FastAPI) -> None:
    """注册健康检查接口"""

    from backend.src.common.response.response_schema import response_base

    @app.get(f'{settings.FASTAPI_API_V1_PATH}/health', summary='健康检查', tags=['Health'])
    async def health_check() -> Any:
        """服务健康检查"""
        from backend.src.database.db import async_db_session
        from backend.src.database.redis import redis_client

        status = {'status': 'ok'}
        try:
            async with async_db_session() as session:
                await session.execute(text('SELECT 1'))
            status['database'] = 'ok'
        except SQLAlchemyError:
            status['database'] = 'error'
            status['status'] = 'degraded'
        try:
            async with asyncio.timeout(5):
                await redis_client.ping()
            status['redis'] = 'ok'
        except (RedisError, TimeoutError):
            status['redis'] = 'error'
            status['status'] = 'degraded'
        return response_base.success(data=status)


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
        socketio_path='/ws/socket.io',
    )
    app.mount('/ws', socket_app)


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
