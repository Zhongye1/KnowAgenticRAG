"""视觉管线单测（双管线摄取 spec D7：行构建纯函数 + 编码器工具函数）。"""

from __future__ import annotations

import math

from backend.src.app.ingest.engine.visual_encoder import _image_mime, _l2_normalize
from backend.src.app.ingest.service.visual_service import build_visual_rows, visual_tile_object_key

_ACL = {'namespace': 'core', 'visibility': 'public', 'owner_id': 'u1', 'groups': ['g1']}


def test_build_visual_rows_idempotent_ids_and_acl() -> None:
    tiles = [
        {'image_bytes': b'\xff\xd8abc', 'page': 0, 'position': 'strip_0', 'width': 800, 'height': 600},
        {'image_bytes': b'\x89PNG\r\n\x1a\nxx', 'page': 1, 'position': 'strip_1', 'width': 800, 'height': 600},
    ]
    vectors = [[0.1, 0.2], [0.3, 0.4]]
    rows = build_visual_rows(tiles, document_id='doc1', kb_name='kb1', acl_fields=_ACL, vectors=vectors)
    assert [row['id'] for row in rows] == ['doc1_t0', 'doc1_t1']
    assert rows[0]['vector'] == [0.1, 0.2]
    # ACL 镜像字段逐行携带（spec D7）
    assert rows[0]['namespace'] == 'core'
    assert rows[0]['visibility'] == 'public'
    assert rows[0]['groups'] == ['g1']
    # 对象键 = image_path（MinIO tiles 前缀）
    assert rows[0]['image_path'] == visual_tile_object_key('core', 'kb1', 'doc1', 'doc1_t0')
    assert rows[0]['image_path'].endswith('/tiles/doc1_t0.jpg')
    assert rows[1]['chunk_type'] == 'tile'


def test_l2_normalize() -> None:
    vec = _l2_normalize([3.0, 4.0])
    assert math.isclose(sum(x * x for x in vec), 1.0)
    assert _l2_normalize([0.0, 0.0]) == [0.0, 0.0]


def test_image_mime_detection() -> None:
    assert _image_mime(b'\x89PNG\r\n\x1a\n...') == 'png'
    assert _image_mime(b'\xff\xd8...') == 'jpeg'
    assert _image_mime(b'GIF8...') == 'gif'
    assert _image_mime(b'RIFF####WEBP') == 'webp'
    assert _image_mime(b'??') == 'jpeg'
