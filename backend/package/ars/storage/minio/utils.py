"""
MinIO 存储工具函数
简化的存储操作辅助函数
"""

import os
import uuid
import warnings
from io import BytesIO

from ars.utils.upload_utils import read_upload_with_limit
from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

from .client import aupload_file_to_minio


def get_file_size(file_path: str) -> int:
    """获取文件大小"""
    return os.path.getsize(file_path)


def generate_unique_filename(original_name: str) -> str:
    """生成唯一的文件名"""
    name_parts = original_name.rsplit(".", 1)
    base_name = name_parts[0] if len(name_parts) == 2 else original_name
    extension = f".{name_parts[1]}" if len(name_parts) == 2 else ""
    return f"{base_name}_{uuid.uuid4().hex[:8]}{extension}"


async def upload_image_to_minio(
    upload: UploadFile,
    *,
    object_prefix: str,
    max_size_bytes: int,
    too_large_message: str,
) -> str:
    file_content = await read_upload_with_limit(
        upload,
        max_size_bytes=max_size_bytes,
        too_large_message=too_large_message,
    )

    allowed_formats = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp", "GIF": "gif"}
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(file_content)) as image:
                file_extension = allowed_formats.get(image.format or "")
                if file_extension is None:
                    raise ValueError("只能上传 PNG、JPEG、WebP 或 GIF 图片")

                for frame_index in range(getattr(image, "n_frames", 1)):
                    image.seek(frame_index)
                    image.load()
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        SyntaxError,
    ) as exc:
        raise ValueError("只能上传 PNG、JPEG、WebP 或 GIF 图片") from exc

    object_name = f"{object_prefix.strip('/')}/{uuid.uuid4()}.{file_extension}"
    return await aupload_file_to_minio("public", object_name, file_content)
