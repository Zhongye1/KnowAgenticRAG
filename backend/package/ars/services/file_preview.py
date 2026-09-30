"""把中立 Workspace preview 结果装配为 HTTP 响应。"""

from __future__ import annotations

import io
from urllib.parse import quote

from ars.utils.filepreview import PreviewResult
from ars.workspace.preview import preview_workspace_file
from fastapi.responses import StreamingResponse


async def render_file_preview(
    path: str,
    raw_content: bytes,
    *,
    office_cache_key: str,
) -> dict | StreamingResponse:
    """把持久文件预览结果转换为 Workspace/Viewer HTTP 响应。"""
    result = await preview_workspace_file(path, raw_content, office_cache_key=office_cache_key)
    return _preview_response(result)


def _preview_response(result: PreviewResult) -> dict | StreamingResponse:
    if not isinstance(result.content, bytes):
        return result.payload()
    filename = result.filename or "preview"
    return StreamingResponse(
        io.BytesIO(result.content),
        media_type=result.media_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}",
            "X-Ars-Preview-Type": result.preview_type,
            "X-Ars-Preview-Filename": quote(filename),
        },
    )
