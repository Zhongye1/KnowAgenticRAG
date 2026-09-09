import asyncio
import sys

from pymilvus import MilvusClient, exceptions

from backend.src.common.log import log
from backend.src.core.config import settings


class MilvusCli:
    """Milvus 向量数据库客户端"""

    def __init__(
        self,
        host: str = settings.MILVUS_HOST,
        port: int = settings.MILVUS_PORT,
        user: str = settings.MILVUS_USER,
        password: str = settings.MILVUS_PASSWORD,
        timeout: int = settings.MILVUS_TIMEOUT,
        db_name: str = settings.MILVUS_DATABASE_NAME,
    ) -> None:
        """
        初始化 Milvus 客户端

        :param host: Milvus 服务器的主机地址
        :param port: Milvus 服务器端口（gRPC）
        :param user: 认证用户名
        :param password: 认证密码
        :param timeout: 连接与请求超时时间（秒）
        :param db_name: Milvus 数据库名称
        """
        self._host = host
        self._port = port
        self._user = user
        self._password = password
        self._timeout = timeout
        self._db_name = db_name
        self.client: MilvusClient | None = None

    def _connect(self) -> MilvusClient:
        """建立同步连接（在线程池中执行）"""
        return MilvusClient(
            uri=f'http://{self._host}:{self._port}',
            user=self._user,
            password=self._password,
            db_name=self._db_name,
            timeout=self._timeout,
        )

    async def init(self) -> None:
        """初始化 Milvus 服务器连接"""
        try:
            self.client = await asyncio.to_thread(self._connect)
            # 触发一次真实请求验证连通性与认证
            await asyncio.to_thread(self.client.list_collections)
            log.info('Milvus 服务器连接成功')
        except (exceptions.ParamError, exceptions.ConnectError):
            log.error('Milvus 服务器地址无效或无法连接: {}:{}', self._host, self._port)
            sys.exit()
        except exceptions.ConnectionConfigException:
            log.error('Milvus 服务器连接认证失败')
            sys.exit()
        except exceptions.MilvusException as e:
            log.error('Milvus 服务器请求失败: {}', e)
            sys.exit()
        except Exception as e:
            log.error('Milvus 服务器连接异常 {}', e)
            sys.exit()

    async def close(self) -> None:
        """释放 Milvus 连接"""
        if self.client is not None:
            await asyncio.to_thread(self.client.close)
            self.client = None


# 创建 milvus 客户端单例
milvus_client: MilvusCli = MilvusCli()
