"""KB 文档对象存储服务（EagleRAG storage/minio_client.py 迁移）。

对象键约定 ``kb/{plugin_namespace}/{kb_name}/{document_id}/{filename}``：
前缀即租户域隔离（namespace/kb_name 均来自域守卫解析后的值）。
桶由 ``MINIO_KB_BUCKET`` 指定，首次上传时懒创建；同步 SDK 调用统一放线程池。
"""

import asyncio
import io

from datetime import timedelta
from pathlib import PurePosixPath

from backend.src.common.log import log
from backend.src.core.config import settings
from backend.src.database.minio import minio_client

__all__ = ['delete_document_object', 'get_document_url', 'kb_object_key', 'upload_document_bytes']

_bucket_ready = False


def _ensure_bucket() -> None:
    """确保 KB 桶存在（幂等，进程内只检查一次）。"""
    bucket = settings.MINIO_KB_BUCKET
    if not minio_client.bucket_exists(bucket):
        minio_client.make_bucket(bucket)


def kb_object_key(plugin_namespace: str, kb_name: str, document_id: str, filename: str) -> str:
    """构造对象键：``kb/{namespace}/{kb_name}/{document_id}/{filename}``。"""
    safe_name = PurePosixPath(filename).name or 'file'
    return f'kb/{plugin_namespace}/{kb_name}/{document_id}/{safe_name}'


async def upload_document_bytes(
    object_key: str,
    data: bytes,
    content_type: str = 'application/octet-stream',
) -> str:
    """上传文档字节流到 KB 桶，返回对象键。"""
    global _bucket_ready
    if not _bucket_ready:
        await asyncio.to_thread(_ensure_bucket)
        _bucket_ready = True
    await asyncio.to_thread(
        minio_client.put_object,
        settings.MINIO_KB_BUCKET,
        object_key,
        io.BytesIO(data),
        len(data),
        content_type=content_type,
    )
    return object_key


async def delete_document_object(object_key: str) -> None:
    """删除对象（尽力而为，失败仅记录，不阻断级联删除）。"""
    try:
        await asyncio.to_thread(minio_client.remove_object, settings.MINIO_KB_BUCKET, object_key)
    except Exception as exc:
        log.warning('删除 KB 对象失败 key=%s: %s', object_key, exc)


def get_document_url(object_key: str, expires: int = 3600) -> str:
    """生成对象预签名下载 URL。"""
    return minio_client.presigned_get_object(settings.MINIO_KB_BUCKET, object_key, expires=timedelta(seconds=expires))
