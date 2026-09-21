"""接口造数用的二进制素材。

PNG 由 ``zlib`` 直接拼（不引图像库）：视觉管线要的是真实渲染 + 真实编码，
素材本身不需要是「真图」，用最小的确定性载荷能让失败可复现。
"""

from __future__ import annotations

import struct
import zlib

__all__ = ['png_bytes']


def png_bytes(width: int = 240, height: int = 120) -> bytes:
    """生成 RGB PNG（视觉管线摄取素材）。"""
    raw = b''.join(
        b'\x00' + b''.join(bytes([(x * 3) % 256, 128, (y * 5) % 256]) for x in range(width)) for y in range(height)
    )

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload))

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )
