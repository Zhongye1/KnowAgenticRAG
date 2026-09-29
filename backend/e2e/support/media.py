"""接口造数用的二进制素材。

PNG 由 ``zlib`` 直接拼（不引图像库）：视觉管线要的是真实渲染 + 真实编码，
素材本身不需要是「真图」，用最小的确定性载荷能让失败可复现。

PDF 同样手工拼最小合法结构（含 xref）：**上传会真的走限额校验并解析页数**
（`ingest/limits.count_pdf_pages`），`b'%PDF-1.7'` 这种假头会被判 `pdf_unreadable`
直接 415，必须给出真能被 pdfium 解析的文件。
"""

from __future__ import annotations

import struct
import zlib

__all__ = ['pdf_bytes', 'png_bytes']


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


def pdf_bytes(pages: int = 1) -> bytes:
    """生成最小合法 PDF（``pages`` 页，Helvetica 一行文本）。

    结构完整到能被 pdfium 解析出正确页数：Catalog → Pages → Page[] → Font，
    外加 Contents 流与 xref 表。带 xref 是刻意的——缺了它 pdfium 虽多数情况能重建，
    但页数校验路径就会变成「靠容错通过」，测不出真实上传链路。
    """
    objects: list[bytes] = [
        b'<</Type/Catalog/Pages 2 0 R>>',
        f'<</Type/Pages/Kids[{" ".join(f"{4 + i} 0 R" for i in range(pages))}]/Count {pages}>>'.encode(),
        b'<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    ]
    contents_ref = f'{4 + pages} 0 R'.encode()
    objects.extend(b'<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]'
            b'/Resources<</Font<</F1 3 0 R>>>>/Contents ' + contents_ref + b'>>' for _ in range(pages))
    stream = b'BT /F1 12 Tf 20 100 Td (e2e) Tj ET'
    objects.append(b'<</Length ' + str(len(stream)).encode() + b'>>stream\n' + stream + b'\nendstream')

    out = bytearray(b'%PDF-1.4\n')
    offsets: list[int] = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f'{index} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref_pos = len(out)
    out += f'xref\n0 {len(objects) + 1}\n'.encode() + b'0000000000 65535 f \n'
    for offset in offsets:
        out += f'{offset:010d} 00000 n \n'.encode()
    out += f'trailer\n<</Size {len(objects) + 1}/Root 1 0 R>>\nstartxref\n{xref_pos}\n%%EOF\n'.encode()
    return bytes(out)
