"""KB 模块端到端冒烟（单事件循环，绕过缺失的登录插件，直接签发 JWT）。

用法（仓库根目录）：
  PYTHONPATH=. backend/.venv/bin/python backend/scripts/kb_smoke.py

前置：依赖容器已启动（task deps-up），种子用户 id=1 (admin) 存在。
"""

import asyncio
import sys

import httpx

from backend.main import app
from backend.src.common.security.jwt import create_access_token
from backend.src.core.config import settings
from backend.src.database.db import create_tables
from backend.src.database.milvus_kb_ops import ensure_base_collections
from backend.src.database.milvus_pool import get_milvus_pool
from backend.src.database.redis import redis_client

BASE = f'http://test{settings.FASTAPI_API_V1_PATH}'


async def main() -> None:
    await create_tables()
    await redis_client.init()
    pool = get_milvus_pool()
    pool.ensure_database()
    ensure_base_collections()

    token = await create_access_token(1, multi_login=False)
    headers = {'Authorization': f'Bearer {token.access_token}'}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=BASE, headers=headers) as client:
        # 创建
        resp = await client.post(
            '/knowledge_bases',
            json={
                'kb_name': 'smoke_test',
                'display_name': '冒烟测试库',
                'description': '端到端冒烟',
                'theme': 'blue',
                'icon': 'database',
                'pdf_text_page_ratio': 0.2,
            },
        )
        assert resp.status_code == 200, resp.text
        print('create:', resp.json()['data']['kb_name'], resp.json()['data']['display_name'])

        # 上传文档（对象存储 + 元数据登记）
        resp = await client.post(
            '/knowledge_bases/smoke_test/documents',
            data={'source_type': 'file'},
            files={'file': ('hello.txt', b'hello kb smoke', 'text/plain')},
        )
        assert resp.status_code == 200, resp.text
        doc = resp.json()['data']
        assert doc['status'] == 'pending' and doc['source_uri'], resp.text
        print('upload doc:', doc['document_id'], doc['source_uri'])

        # 同内容重复上传 → 409（去重）
        resp = await client.post(
            '/knowledge_bases/smoke_test/documents',
            data={'source_type': 'file'},
            files={'file': ('hello2.txt', b'hello kb smoke', 'text/plain')},
        )
        assert resp.status_code == 409, resp.text
        print('duplicate upload 409: ok')

        # 下载链接（对象存储预签名 URL）
        resp = await client.get(f'/documents/{doc["document_id"]}/download')
        assert resp.status_code == 200 and resp.json()['data']['url'], resp.text
        print('download url: ok')

        # 文档重命名（PATCH 元数据）
        resp = await client.patch(
            f'/documents/{doc["document_id"]}',
            json={'name': 'renamed.txt'},
        )
        assert resp.status_code == 200 and resp.json()['data']['name'] == 'renamed.txt', resp.text
        print('document rename: ok')

        # 替换文件（PUT /file，重新上传 OSS + 刷新指纹）
        resp = await client.put(
            f'/documents/{doc["document_id"]}/file',
            files={'file': ('new.txt', b'new content kb smoke', 'text/plain')},
        )
        assert resp.status_code == 200, resp.text
        new_doc = resp.json()['data']
        assert new_doc['sha256'] != doc['sha256'], resp.text
        assert new_doc['status'] == 'pending' and new_doc['source_uri'].endswith('/new.txt'), resp.text
        print('document replace file: ok')

        # 删除单篇文档（级联：向量/OSS/登记行）
        resp = await client.delete(f'/documents/{doc["document_id"]}')
        assert resp.status_code == 200, resp.text
        counts = resp.json()['data']
        assert counts['objects'] == 1 and counts['documents'] == 1, resp.text
        print('document delete counts:', counts)

        resp = await client.get(f'/documents/{doc["document_id"]}')
        assert resp.status_code == 404, resp.text
        print('after-doc-delete detail 404: ok')

        # 级联删除前再上传一个文档，验证对象存储随库删除清理
        resp = await client.post(
            '/knowledge_bases/smoke_test/documents',
            data={'source_type': 'file'},
            files={'file': ('final.txt', b'final kb smoke', 'text/plain')},
        )
        assert resp.status_code == 200, resp.text
        final_doc = resp.json()['data']
        print('upload final doc:', final_doc['source_uri'])

        # 写入一条测试向量（模拟 RAG 层写入，验证 kb_name 标量过滤与级联删除）
        from backend.src.database.milvus_kb_ops import base_collection_names, count_entities_by_kb

        text_coll, _visual_coll = base_collection_names()
        pool.get().insert(
            text_coll,
            [{'id': 'smoke_vec_1', 'vector': [0.01] * settings.MILVUS_TEXT_VECTOR_DIM, 'kb_name': 'smoke_test'}],
        )
        await asyncio.sleep(0.3)
        print('milvus count by kb:', count_entities_by_kb(text_coll, 'smoke_test'))

        # 详情
        resp = await client.get('/knowledge_bases/smoke_test')
        assert resp.status_code == 200, resp.text
        print('detail documents:', resp.json()['data']['documents'])

        # 列表 + 聚合
        resp = await client.get('/knowledge_bases')
        assert resp.status_code == 200, resp.text
        print('list total:', resp.json()['data']['total'])

        resp = await client.get('/knowledge_bases/overview')
        assert resp.status_code == 200, resp.text
        print('overview:', resp.json()['data'])

        # 集合统计 / 分面
        resp = await client.get('/knowledge_bases/smoke_test/collections')
        assert resp.status_code == 200, resp.text
        print('collections:', resp.json()['data'])

        resp = await client.get('/knowledge_bases/smoke_test/facets')
        assert resp.status_code == 200, resp.text
        print('facets:', resp.json()['data'])

        # 域守卫 403
        resp = await client.get('/knowledge_bases', headers={'X-Plugin-Namespace': 'other'})
        assert resp.status_code == 403, resp.text
        print('namespace guard 403: ok')

        # 重建（依赖 RAG 层 → 明确报错）
        resp = await client.post('/knowledge_bases/smoke_test/rebuild')
        print('rebuild:', resp.status_code, resp.json().get('msg'))

        # 标签目录
        resp = await client.get('/tags')
        assert resp.status_code == 200, resp.text
        print('tags:', resp.json()['data'])

        # 级联删除
        resp = await client.delete('/knowledge_bases/smoke_test')
        assert resp.status_code == 200, resp.text
        print('delete counts:', resp.json()['data']['counts'])
        await asyncio.sleep(1.2)
        print('milvus count after delete:', count_entities_by_kb(text_coll, 'smoke_test'))

        resp = await client.get('/knowledge_bases/smoke_test')
        assert resp.status_code == 404, resp.text
        print('after-delete detail 404: ok')

        # 级联删除后对象存储中的文件应已清理
        from backend.src.database.minio import minio_client
        from minio.error import S3Error

        try:
            minio_client.stat_object(settings.MINIO_KB_BUCKET, final_doc['source_uri'])
            raise AssertionError('对象应已随级联删除清理')
        except S3Error:
            print('object cleaned after delete: ok')

    # Milvus 集合与索引
    client = pool.get()
    print('milvus collections:', sorted(client.list_collections()))
    print('ragf_text indexes:', client.list_indexes('ragf_text'))

    await redis_client.aclose()
    print('SMOKE OK')


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except AssertionError as exc:
        print(f'SMOKE FAILED: {exc}')
        sys.exit(1)
