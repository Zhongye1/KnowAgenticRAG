import asyncio
import sys

from minio import Minio
from minio.error import S3Error

from backend.src.common.log import log
from backend.src.core.config import settings


class MinioCli(Minio):
    """MinIO 对象存储客户端"""

    def __init__(
        self,
        host: str = settings.MINIO_HOST,
        port: int = settings.MINIO_PORT,
        access_key: str = settings.MINIO_ACCESS_KEY,
        secret_key: str = settings.MINIO_SECRET_KEY,
        *,
        secure: bool = settings.MINIO_SECURE,
        buckets: tuple[str, ...] = (
            settings.MINIO_BUCKET,
            settings.MINIO_ATTACHMENT_BUCKET,
            settings.MINIO_KB_BUCKET,
        ),
    ) -> None:
        """
        初始化 MinIO 客户端

        :param host: MinIO 服务器的主机地址
        :param port: MinIO API 端口
        :param access_key: 访问密钥（等同用户名）
        :param secret_key: 秘密密钥（等同密码）
        :param secure: 是否使用 TLS
        :param buckets: 启动时确保存在的存储桶列表
        """
        super().__init__(
            endpoint=f'{host}:{port}',
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )
        self._buckets = buckets

    def _init_sync(self) -> None:
        """同步初始化：验证连通性并确保桶存在（在线程池中执行）"""
        # 触发一次真实请求验证连通性与认证
        list(self.list_buckets())
        for bucket in self._buckets:
            if not self.bucket_exists(bucket):
                self.make_bucket(bucket)

    async def init(self) -> None:
        """初始化 MinIO 服务器"""
        try:
            await asyncio.to_thread(self._init_sync)
            log.info('MinIO 服务器连接成功')
        except S3Error as e:
            log.error('MinIO 服务器请求失败: {}', e.message)
            sys.exit()
        except Exception as e:
            log.error('MinIO 服务器连接异常 {}', e)
            sys.exit()

    async def close(self) -> None:
        """释放 MinIO 连接（urllib3 连接池由进程退出时回收）"""


# 创建 minio 客户端单例
minio_client: MinioCli = MinioCli()
