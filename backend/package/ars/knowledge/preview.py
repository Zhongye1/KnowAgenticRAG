"""Knowledge 文件的 MinIO 预览与持久化 Office 缓存。"""

from __future__ import annotations

from ars.knowledge.utils.kb_utils import is_minio_url, parse_minio_url
from ars.repositories.knowledge_file_repository import KnowledgeFileRepository
from ars.storage.minio import get_minio_client
from ars.utils.filepreview import (
    MAX_BINARY_PREVIEW_SIZE_BYTES,
    OfficePreviewConversionError,
    convert_office_to_pdf,
    is_office_pdf_preview_file,
    preview_too_large,
    render_preview,
)


async def read_knowledge_file_preview(kb_id: str, file_id: str) -> dict:
    """从 Knowledge metadata 与 MinIO 对象生成只读文件预览。"""
    file_record = await KnowledgeFileRepository().get_by_file_id(file_id)
    if file_record is None or file_record.kb_id != kb_id:
        raise ValueError(f"File {file_id} not found")
    if file_record.is_folder:
        raise ValueError("Cannot preview a folder")

    filename = file_record.filename or file_record.original_filename or file_id
    response = {
        "source": "knowledge",
        "kb_id": kb_id,
        "file_id": file_id,
        "filename": filename,
        "readonly": True,
    }
    original_path = file_record.minio_url or file_record.path
    if not original_path:
        return {
            **response,
            "content": None,
            "preview_type": "unsupported",
            "supported": False,
            "message": "文件没有可预览的原始内容",
        }

    file_size = file_record.file_size
    if file_size is None:
        file_size = await _get_minio_file_size(original_path)
    if file_size is not None and int(file_size) > MAX_BINARY_PREVIEW_SIZE_BYTES:
        return {**response, **preview_too_large().payload()}

    if is_office_pdf_preview_file(filename):
        pdf_content = await _read_office_pdf_preview(kb_id, file_id, filename, original_path)
        return {
            **response,
            "content": pdf_content,
            "filename": f"{filename.rsplit('.', 1)[0] or file_id}.pdf",
            "media_type": "application/pdf",
            "preview_type": "pdf",
            "supported": True,
            "message": None,
            "binary": True,
        }

    raw_content = await _read_minio_bytes(original_path)
    if len(raw_content) > MAX_BINARY_PREVIEW_SIZE_BYTES:
        return {**response, **preview_too_large().payload()}
    result = render_preview(filename, raw_content)
    if isinstance(result.content, bytes):
        return {
            **response,
            "content": result.content,
            "media_type": result.media_type,
            "preview_type": result.preview_type,
            "supported": result.supported,
            "message": result.message,
            "binary": True,
        }
    return {**response, **result.payload()}


async def _read_office_pdf_preview(
    kb_id: str,
    file_id: str,
    filename: str,
    original_path: str,
) -> bytes:
    minio_client = get_minio_client()
    bucket_name = minio_client.KB_BUCKETS["parsed"]
    object_name = f"{kb_id}/preview/{file_id}.pdf"
    if await minio_client.astat_file(bucket_name, object_name) is not None:
        return await minio_client.adownload_file(bucket_name, object_name)

    raw_content = await _read_minio_bytes(original_path)
    try:
        pdf_content = await convert_office_to_pdf(filename, raw_content)
    except OfficePreviewConversionError as exc:
        raise ValueError(str(exc)) from exc
    await minio_client.aupload_file(
        bucket_name=bucket_name,
        object_name=object_name,
        data=pdf_content,
        content_type="application/pdf",
    )
    return pdf_content


async def _get_minio_file_size(file_path: str) -> int | None:
    bucket_name, object_name = _parse_minio_path(file_path)
    return await get_minio_client().astat_file(bucket_name, object_name)


async def _read_minio_bytes(file_path: str) -> bytes:
    bucket_name, object_name = _parse_minio_path(file_path)
    return await get_minio_client().adownload_file(bucket_name, object_name)


def _parse_minio_path(file_path: str) -> tuple[str, str]:
    if not file_path or not is_minio_url(file_path):
        raise ValueError(f"Invalid MinIO path format: {file_path}")
    return parse_minio_url(file_path)
