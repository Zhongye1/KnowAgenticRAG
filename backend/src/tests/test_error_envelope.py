"""统一错误信封契约：``msg`` 恒为字符串，结构化 detail 走 ``data``。

**为什么需要这个测试**：``http_exception_handler`` 的 dev 分支曾把 ``exc.detail``
原样塞进 ``msg``，而 detail 可以是任意 JSON（摄取限额 422 的
``{code, reason, suggestion}``）。这既违反 ``ResponseSchemaModel.msg: str`` 的契约，
也让按文本渲染 msg 的客户端拿到对象后崩掉（前端通知中心就踩过：整棵组件树被
ErrorBoundary 兜底成错误页）。限额这类**面向用户的**校验失败必须既能被读出人话，
又能被程序分支，所以：``msg`` 放可读文案，``data`` 放结构化原文。

prod 口径：默认脱敏（防信息泄露），但 detail 显式声明 ``public: True`` 时放行——
限额原因是用户自己能处置的信息，藏起来只会让人收到一句无法行动的通用错误。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette_context.middleware import ContextMiddleware
from starlette_context.plugins import RequestIdPlugin

from backend.src.common.exception.exception_handler import _detail_to_message, register_exception
from backend.src.core.config import settings

if TYPE_CHECKING:
    from collections.abc import Iterator

_LIMIT_DETAIL = {
    'code': 'file_too_large',
    'reason': '文件大小 10 字节，超过上限 8 字节',
    'suggestion': '请压缩或拆分文档后重新上传',
    'public': True,  # 与 app/ingest/limits.py: to_detail() 实际形状一致
}

# 没声明 public 的结构化 detail：prod 必须继续脱敏
_PRIVATE_DETAIL = {
    'code': 'internal_probe',
    'reason': '内部依赖连接串 postgres://… 探活失败',
}


def _build_client(monkeypatch: pytest.MonkeyPatch, *, environment: str) -> Iterator[TestClient]:
    """最小 app：只装上下文中间件 + 异常处理器 + 四个抛 HTTPException 的路由。

    处理器会往 ``ctx.__request_*_exception__`` 写异常信息（中间件联动，见
    中间件与异常处理 §6.4），所以这里必须挂上 starlette-context 中间件。
    """
    monkeypatch.setattr(settings, 'ENVIRONMENT', environment)

    app = FastAPI()
    app.add_middleware(ContextMiddleware, plugins=[RequestIdPlugin()])
    register_exception(app)

    @app.get('/structured')
    async def _structured() -> None:
        raise HTTPException(status_code=422, detail=_LIMIT_DETAIL)

    @app.get('/structured-private')
    async def _structured_private() -> None:
        raise HTTPException(status_code=422, detail=_PRIVATE_DETAIL)

    @app.get('/plain')
    async def _plain() -> None:
        raise HTTPException(status_code=404, detail='知识库不存在: kb1')

    @app.get('/no-detail')
    async def _no_detail() -> None:
        raise HTTPException(status_code=404)

    yield TestClient(app)


@pytest.fixture
def dev_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    yield from _build_client(monkeypatch, environment='dev')


@pytest.fixture
def prod_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    yield from _build_client(monkeypatch, environment='prod')


@pytest.mark.parametrize(
    ('detail', 'expected'),
    [
        ('知识库不存在: kb1', '知识库不存在: kb1'),
        ('  两端空白被裁掉  ', '两端空白被裁掉'),
        (_LIMIT_DETAIL, f'{_LIMIT_DETAIL["reason"]}（{_LIMIT_DETAIL["suggestion"]}）'),
        ({'reason': '只有原因'}, '只有原因'),
        ({'msg': '嵌套 msg'}, '嵌套 msg'),
        ([{'msg': '第一条'}, {'msg': '第二条'}], '第一条；第二条'),
        (None, ''),
        ({'unexpected': 1}, '{"unexpected": 1}'),
    ],
)
def test_detail_to_message_always_returns_text(detail: object, expected: str) -> None:
    """各种 detail 形态都折叠成字符串（这是 ``msg: str`` 契约的实现处）。"""
    assert _detail_to_message(detail) == expected


def test_structured_detail_exposes_text_in_msg_and_structure_in_data(dev_client: TestClient) -> None:
    """dev：可读原因+建议在 ``msg``（字符串），结构化 detail 原样在 ``data``。"""
    resp = dev_client.get('/structured')
    body = resp.json()

    assert resp.status_code == 422
    assert body['code'] == 422
    assert isinstance(body['msg'], str), f'msg 必须是字符串: {body!r}'
    assert _LIMIT_DETAIL['reason'] in body['msg']
    assert _LIMIT_DETAIL['suggestion'] in body['msg']
    assert body['data'] == _LIMIT_DETAIL, '结构化 detail 不应丢，只是改放 data'
    assert body['trace_id']


def test_string_detail_stays_in_msg_without_data(dev_client: TestClient) -> None:
    """dev：纯字符串 detail 仍是 msg，data 保持 null（不改变既有形态）。"""
    resp = dev_client.get('/plain')
    body = resp.json()

    assert resp.status_code == 404
    assert body['msg'] == '知识库不存在: kb1'
    assert body['data'] is None


def test_missing_detail_still_yields_text(dev_client: TestClient) -> None:
    """不传 detail 的 ``HTTPException``：``msg`` 仍是可读字符串（Starlette 补状态短语），绝不是 null。"""
    body = dev_client.get('/no-detail').json()

    assert isinstance(body['msg'], str)
    assert body['msg'], 'msg 为空会让前端只能吃状态码兜底文案'
    assert body['data'] is None


def test_prod_still_exposes_public_detail(prod_client: TestClient) -> None:
    """prod：声明了 ``public`` 的 detail 照常放行（限额是用户可自行处置的信息）。"""
    resp = prod_client.get('/structured')
    body = resp.json()

    assert resp.status_code == 422
    assert body['code'] == 422, '放行分支的 code 应与 HTTP status 一致，而不是通用 400'
    assert isinstance(body['msg'], str)
    assert _LIMIT_DETAIL['reason'] in body['msg']
    assert _LIMIT_DETAIL['suggestion'] in body['msg']
    assert body['data'] == _LIMIT_DETAIL
    assert body['trace_id']


def test_prod_masks_detail_without_public_flag(prod_client: TestClient) -> None:
    """prod：没声明 ``public`` 的结构化 detail 一律脱敏（默认口径不变）。"""
    body = prod_client.get('/structured-private').json()

    assert isinstance(body['msg'], str)
    assert _PRIVATE_DETAIL['reason'] not in body['msg']
    assert body['data'] is None
    assert body['code'] == 400, '脱敏分支仍是通用 400 信封'


def test_prod_masks_plain_string_detail(prod_client: TestClient) -> None:
    """prod：字符串 detail 从不对外（``public`` 只能由结构化 detail 显式声明）。"""
    body = prod_client.get('/plain').json()

    assert isinstance(body['msg'], str)
    assert '知识库不存在' not in body['msg']
    assert body['data'] is None
