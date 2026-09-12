"""MCP 工具集测试（D21/D30/D33：只读面、权限强制、稳定错误码；注入替身无网络）。"""

from __future__ import annotations

from typing import Any

import pytest

from backend.src.app.kb.service.acl.scope import Scope
from backend.src.app.mcp.schemas import (
    PERM_KB_CHAT,
    PERM_KB_READ,
    PERM_KB_SEARCH,
    READ_SCOPES,
    UserContext,
)
from backend.src.app.mcp.service import TOOLS_BY_NAME, McpToolkit, ToolError
from backend.src.common.exception import errors


def _ctx(*, scopes: frozenset[str] | None = None, tenant: str = 'core') -> UserContext:
    return UserContext(sub='user:1', tenant=tenant, scp=scopes or READ_SCOPES)


class FakeKb:
    def __init__(self, kb_name: str, display_name: str = '', description: str = '') -> None:
        self.kb_name = kb_name
        self.display_name = display_name or kb_name
        self.description = description


class FakeDoc:
    def __init__(
        self,
        *,
        document_id: str,
        kb_name: str,
        name: str,
        active_version: int = 1,
        status: str = 'ready',
        chunk_count: int = 0,
    ) -> None:
        self.document_id = document_id
        self.kb_name = kb_name
        self.name = name
        self.source_type = 'upload'
        self.source_uri = None
        self.status = status
        self.chunk_count = chunk_count
        self.active_version = active_version


class FakeKbDao:
    def __init__(self, kbs: list[FakeKb], *, namespace: str = 'core') -> None:
        self.namespace = namespace
        self.kbs = {kb.kb_name: kb for kb in kbs}

    async def list_all(self, db: Any, *, plugin_namespace: str | None = None) -> list[FakeKb]:
        if (plugin_namespace or self.namespace) != self.namespace:
            return []
        return list(self.kbs.values())

    async def get(self, db: Any, kb_name: str, *, plugin_namespace: str | None = None) -> FakeKb | None:
        if (plugin_namespace or self.namespace) != self.namespace:
            return None
        return self.kbs.get(kb_name)


class FakeDocDao:
    def __init__(self, docs: list[FakeDoc]) -> None:
        self.docs = {(doc.kb_name, doc.document_id): doc for doc in docs}
        self.doc_count = 3

    async def get(
        self,
        db: Any,
        document_id: str,
        *,
        kb_name: str | None = None,
        plugin_namespace: str | None = None,
    ) -> FakeDoc | None:
        return self.docs.get((kb_name or '', document_id))

    async def count_by_kb(self, db: Any, kb_name: str, *, plugin_namespace: str | None = None) -> int:
        return self.doc_count


class FakeChunk:
    def __init__(self, chunk_id: str, chunk_index: int, content: str, token_count: int | None = None) -> None:
        self.chunk_id = chunk_id
        self.chunk_index = chunk_index
        self.content = content
        self.token_count = token_count


class FakeChunkService:
    async def list_by_document(
        self,
        db: Any,
        document_id: str,
        *,
        kb_name: str | None = None,
        version_id: int | None = None,
        plugin_namespace: str | None = None,
    ) -> list[FakeChunk]:
        return [
            FakeChunk(f'{document_id}:{version_id or 1}:0', 0, '第一块', 12),
            FakeChunk(f'{document_id}:{version_id or 1}:1', 1, '第二块', 8),
        ]


class FakeRetrieval:
    async def search(
        self,
        db: Any,
        *,
        kb_name: str,
        query_text: str,
        param: Any = None,
        plugin_namespace: str | None = None,
        scope: Any = None,
    ) -> dict[str, Any]:
        return await self.search_multi(
            db, kb_names=[kb_name], query_text=query_text, param=param, plugin_namespace=plugin_namespace, scope=scope
        )

    async def search_multi(
        self,
        db: Any,
        *,
        kb_names: list[str],
        query_text: str,
        param: Any = None,
        plugin_namespace: str | None = None,
        scope: Any = None,
    ) -> dict[str, Any]:
        return {
            'kb_name': kb_names[0],
            'kb_names': list(kb_names),
            'mode': 'hybrid',
            'recall_count': 1,
            'reranked': True,
            'degraded': False,
            'duration_ms': 3,
            'hit_count': 1,
            'results': [
                {
                    'chunk_id': 'doc-a:1:0',
                    'document_id': 'doc-a',
                    'kb_name': kb_names[0],
                    'version_id': 1,
                    'chunk_index': 0,
                    'content': '版本差异说明',
                    'metadata': {'source': 'guide.md', 'score': 0.91},
                }
            ],
        }


class FakeChat:
    async def acomplete_multi(
        self, db: Any, *, kb_names: list[str], param: Any, plugin_namespace: str | None = None, scope: Any = None
    ) -> dict[str, Any]:
        kb_name = kb_names[0]
        return {
            'kb_name': kb_name,
            'kb_names': list(kb_names),
            'mode': 'hybrid',
            'model_spec': 'acme:qwen-max',
            'hit_count': 1,
            'citations': [
                {'n': 1, 'kb_name': kb_name, 'document_id': 'doc-a', 'version_id': 1, 'chunk_id': 'doc-a:1:0'}
            ],
            'answer': '根据知识库 [1] 版本差异是……',
            'reason': 'complete',
            'usage': {'prompt_tokens': 5, 'completion_tokens': 3, 'total_tokens': 8},
        }


class RaisingChat:
    async def acomplete_multi(self, db: Any, **kwargs: Any) -> dict[str, Any]:
        raise errors.RequestError(msg='chat 模型未配置或不可用')


async def _fake_scope_builder(db: Any, *, user: UserContext, kb_names: list[str] | None = None) -> Any:  # ruff: ignore[unused-async]  # 对齐真实 build_retrieval_scope 的 async 契约
    """罐头 scope：请求的 kb 全部视为已授权（KB 存在性由 FakeKbDao 负责）。"""
    return Scope(namespace=user.tenant, user_id=user.sub, groups=[user.sub], allowed_kbs=list(kb_names or []))


def _toolkit(**overrides: Any) -> McpToolkit:
    kb = FakeKb('dev', '研发库', '研发知识')
    doc = FakeDoc(document_id='doc-a', kb_name='dev', name='guide.md', active_version=2, chunk_count=10)
    base: dict[str, Any] = {
        'kb_dao': FakeKbDao([kb]),
        'doc_dao': FakeDocDao([doc]),
        'chunk_svc': FakeChunkService(),
        'retrieval': FakeRetrieval(),
        'chat': FakeChat(),
        'scope_builder': _fake_scope_builder,
    }
    base.update(overrides)
    return McpToolkit(**base)


async def _call(
    toolkit: McpToolkit, name: str, args: dict[str, Any] | None = None, *, user: UserContext | None = None
) -> dict[str, Any]:
    return await toolkit.call(None, user=user or _ctx(), tool_name=name, args=args or {})  # type: ignore[arg-type]


def test_tool_catalog_metadata() -> None:
    names = {spec.name for spec in TOOLS_BY_NAME.values()}
    assert names == {
        'list_knowledge_bases',
        'search_knowledge',
        'answer_with_citations',
        'read_document_chunks',
        'get_document',
    }
    assert TOOLS_BY_NAME['search_knowledge'].required == frozenset({PERM_KB_SEARCH})


def test_list_knowledge_bases_with_doc_count() -> None:
    result = _run('list_knowledge_bases')
    rows = result['knowledge_bases']
    assert rows[0]['kb_name'] == 'dev'
    assert rows[0]['doc_count'] == 3


def test_permission_denied_on_missing_scp() -> None:
    user = _ctx(scopes=frozenset({PERM_KB_SEARCH, PERM_KB_READ, PERM_KB_CHAT}))
    with pytest.raises(ToolError) as exc_info:
        _run('list_knowledge_bases', user=user)
    assert exc_info.value.code == 'PERMISSION_DENIED'


def test_search_knowledge_hits() -> None:
    result = _run('search_knowledge', {'kb_names': ['dev'], 'query_text': '版本差异'})
    assert result['hit_count'] == 1
    assert result['hits'][0]['chunk_id'] == 'doc-a:1:0'
    assert result['mode'] == 'hybrid'


def test_search_knowledge_kb_not_found() -> None:
    with pytest.raises(ToolError) as exc_info:
        _run('search_knowledge', {'kb_names': ['missing'], 'query_text': 'x'})
    assert exc_info.value.code == 'KB_NOT_FOUND'


def test_cross_tenant_kb_invisible_on_search() -> None:
    """工具版 IDOR（D33）：他租户 KB 对本租户不可见 → KB_NOT_FOUND，不泄漏内容。"""
    user = _ctx(tenant='acme')
    with pytest.raises(ToolError) as exc_info:
        _run('search_knowledge', {'kb_names': ['dev'], 'query_text': '版本差异'}, user=user)
    assert exc_info.value.code == 'KB_NOT_FOUND'


def test_kb_outside_scope_denied_on_search() -> None:
    """KB 存在但不在 scope.allowed_kbs → PERMISSION_DENIED（ACL 求交，agent-layer spec §6）。"""

    async def _narrow_scope(db: Any, *, user: UserContext, kb_names: list[str] | None = None) -> Any:  # ruff: ignore[unused-async]  # 对齐真实 build_retrieval_scope 的 async 契约
        return Scope(namespace=user.tenant, user_id=user.sub, groups=['other-group'], allowed_kbs=[])

    with pytest.raises(ToolError) as exc_info:
        _run('search_knowledge', {'kb_names': ['dev'], 'query_text': '版本差异'}, scope_builder=_narrow_scope)
    assert exc_info.value.code == 'PERMISSION_DENIED'


def test_cross_tenant_kb_invisible_on_get_document() -> None:
    user = _ctx(tenant='acme')
    with pytest.raises(ToolError) as exc_info:
        _run('get_document', {'kb_name': 'dev', 'document_id': 'doc-a'}, user=user)
    assert exc_info.value.code == 'KB_NOT_FOUND'


def test_cross_tenant_kb_invisible_on_read_chunks() -> None:
    user = _ctx(tenant='acme')
    with pytest.raises(ToolError) as exc_info:
        _run('read_document_chunks', {'kb_name': 'dev', 'document_id': 'doc-a'}, user=user)
    assert exc_info.value.code == 'KB_NOT_FOUND'


def test_answer_with_citations_aggregates() -> None:
    result = _run('answer_with_citations', {'kb_names': ['dev'], 'query_text': '版本差异'})
    assert result['answer'].startswith('根据知识库')
    assert result['citations'][0]['document_id'] == 'doc-a'
    assert result['usage']['total_tokens'] == 8


def test_answer_with_citations_model_not_configured() -> None:
    toolkit = _toolkit(chat=RaisingChat())
    with pytest.raises(ToolError) as exc_info:
        _run_with(toolkit, 'answer_with_citations', {'kb_names': ['dev'], 'query_text': 'x'})
    assert exc_info.value.code == 'MODEL_NOT_CONFIGURED'


def test_read_document_chunks_window() -> None:
    result = _run('read_document_chunks', {'kb_name': 'dev', 'document_id': 'doc-a', 'version_id': 2, 'limit': 1})
    assert result['version_id'] == 2
    assert result['total_chunks'] == 2
    assert len(result['chunks']) == 1
    assert result['chunks'][0]['chunk_id'] == 'doc-a:2:0'


def test_read_document_chunks_document_not_found() -> None:
    with pytest.raises(ToolError) as exc_info:
        _run('read_document_chunks', {'kb_name': 'dev', 'document_id': 'nope'})
    assert exc_info.value.code == 'DOCUMENT_NOT_FOUND'


def test_get_document_metadata() -> None:
    result = _run('get_document', {'kb_name': 'dev', 'document_id': 'doc-a'})
    assert result['name'] == 'guide.md'
    assert result['active_version'] == 2
    assert result['versions'][0]['active'] is True


def test_unknown_tool() -> None:
    with pytest.raises(ToolError) as exc_info:
        _run('not_a_tool')
    assert exc_info.value.code == 'UNKNOWN_TOOL'


def test_invalid_params_validation_error() -> None:
    with pytest.raises(ToolError) as exc_info:
        _run('search_knowledge', {'kb_names': ['dev'], 'query_text': 'x', 'top_k': 0})
    assert exc_info.value.code == 'INVALID_REQUEST'


def _run(
    name: str, args: dict[str, Any] | None = None, *, user: UserContext | None = None, **toolkit_overrides: Any
) -> dict[str, Any]:
    import asyncio

    return asyncio.run(_call(_toolkit(**toolkit_overrides), name, args, user=user))


def _run_with(toolkit: McpToolkit, name: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    import asyncio

    return asyncio.run(_call(toolkit, name, args))
