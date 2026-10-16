"""下载类响应的契约声明。

这些端点把字节流写进响应体，媒体类型在运行期才确定（导出格式、对象自身的 content type、
请求参数都可能改变它），因此契约里声明的是通用的字节流类型，而不是某一个具体格式。
声明之后响应才在 `web/openapi.json` 里有内容，前端调这些端点时拿到的是 `Blob` 而不是
`unknown`，响应契约门禁也才能对它们生效。
"""

from __future__ import annotations

from typing import Any

_BINARY_SCHEMA = {"type": "string", "format": "binary"}


def _binary_response(media_type: str) -> dict[str, Any]:
    return {"content": {media_type: {"schema": _BINARY_SCHEMA}}}


# 运行期决定媒体类型的下载：导出格式、对象 content type 或请求参数都可能变。
BINARY_DOWNLOAD = _binary_response("application/octet-stream")
# 技能包导出固定是 zip；评估数据集导出固定是 ndjson。
ZIP_DOWNLOAD = _binary_response("application/zip")
NDJSON_DOWNLOAD = _binary_response("application/x-ndjson")
