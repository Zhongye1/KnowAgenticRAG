"""Milvus 客户端连接池：按 db_name 缓存（EagleRAG ADR-001 迁移）。

客户端构造时即绑定 db_name，同一 URI 上多个客户端共享底层连接；
因此 **禁止对池内客户端调用 close()**，否则会连带影响同一连接上的其他客户端。
客户端在进程生命周期内复用，进程退出时由解释器回收。
"""

import threading

from pymilvus import MilvusClient

from backend.src.core.config import settings

__all__ = ['MilvusClientPool', 'get_milvus_pool', 'milvus_db_name']


def milvus_db_name(plugin_namespace: str | None = None) -> str:
    """实例域 → Milvus Database 名映射（core → default，其余同名字库）。"""
    ns = plugin_namespace or settings.PLUGIN_NAMESPACE
    return 'default' if ns == 'core' else ns


class MilvusClientPool:
    """进程级 MilvusClient 缓存，按 db_name 键控。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._clients: dict[str, MilvusClient] = {}
        self._admin: MilvusClient | None = None

    def _uri(self) -> str:
        return f'http://{settings.MILVUS_HOST}:{settings.MILVUS_PORT}'

    def _new_client(self, db_name: str) -> MilvusClient:
        return MilvusClient(
            uri=self._uri(),
            user=settings.MILVUS_USER,
            password=settings.MILVUS_PASSWORD,
            db_name=db_name,
            timeout=settings.MILVUS_TIMEOUT,
        )

    def admin_client(self) -> MilvusClient:
        """默认库管理客户端（仅用于数据库管理，勿 close）。"""
        if self._admin is None:
            with self._lock:
                if self._admin is None:
                    self._admin = self._new_client('default')
        return self._admin

    def get(self, plugin_namespace: str | None = None) -> MilvusClient:
        """按域返回绑定对应 Database 的客户端。"""
        db_name = milvus_db_name(plugin_namespace)
        client = self._clients.get(db_name)
        if client is None:
            with self._lock:
                client = self._clients.get(db_name)
                if client is None:
                    client = self._new_client(db_name)
                    self._clients[db_name] = client
        return client

    def ensure_database(self, plugin_namespace: str | None = None) -> None:
        """按配置自动创建域对应的 Milvus Database。"""
        if not settings.MILVUS_AUTO_CREATE_DB:
            return
        db_name = milvus_db_name(plugin_namespace)
        if db_name == 'default':
            return
        admin = self.admin_client()
        existing = set(admin.list_databases())
        if db_name not in existing:
            admin.create_database(db_name)

    def close_all(self) -> None:
        """清空缓存引用；不调用 close（同连接别名共享，避免连带失效）。"""
        with self._lock:
            self._clients.clear()
            self._admin = None


pool = MilvusClientPool()


def get_milvus_pool() -> MilvusClientPool:
    """获取进程级 Milvus 连接池单例。"""
    return pool
