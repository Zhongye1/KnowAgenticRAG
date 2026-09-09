"""文档去重工具测试。"""

import hashlib

from backend.src.app.kb.crud.crud_dedup import compute_sha256_bytes


def test_compute_sha256_bytes() -> None:
    """SHA-256 计算与标准库一致。"""
    data = b'hello eagle rag'
    assert compute_sha256_bytes(data) == hashlib.sha256(data).hexdigest()
