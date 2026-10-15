"""LangSearch 联网搜索工具的契约测试。

覆盖三类事实：
1. 未配置 key 时的结构化降级（不抛异常、不留空成功）。
2. 请求参数到 LangSearch 契约的映射，以及响应体到统一结果结构的规整。
3. provider 注册表按环境变量选择并暴露统一工具名 ``web_search``。

另覆盖官方文档明确的两处易错点：``freshness`` 预设为小写驼峰（PascalCase 会 400），
以及错误响应中 ``message``/``msg``/``code`` 的类型不固定、需以 HTTP 状态为主判据。
"""

import httpx
import pytest
from unittest.mock import patch

from ars.agents.toolkits.buildin.tools import (
    _LANGSEARCH_SEARCH_URL,
    _all_tool_instances,
    _build_langsearch_payload,
    _create_langsearch_search,
    _extra_registry,
    _normalize_freshness,
    _register_web_search_tool,
)


def _response(status: int, payload: dict) -> httpx.Response:
    return httpx.Response(status, json=payload, request=httpx.Request('POST', _LANGSEARCH_SEARCH_URL))


# LangSearch 真实响应结构（取自官方文档与实测响应）。
_SUCCESS_BODY = {
    'code': 200,
    'log_id': 'd385e1e7ec723e30',
    'msg': None,
    'data': {
        '_type': 'SearchResponse',
        'queryContext': {'originalQuery': '什么是设计模式?'},
        'webPages': {
            'webSearchUrl': 'https://langsearch.com/search?q=test',
            'totalEstimatedMatches': 2,
            'value': [
                {
                    'id': 'results.#0',
                    'name': '设计模式',
                    'url': 'https://www.processon.com/view/5e81868be4b0069b2bbaa548',
                    'displayUrl': 'https://www.processon.com/view/5e81868be4b0069b2bbaa548',
                    'snippet': '设计模式是软件设计中常见问题的可复用解法。',
                    'text': '设计模式（Design Pattern）是软件工程中对常见问题的可复用解决方案。',
                    'datePublished': '2026-08-18T21:40:13.000Z',
                }
            ],
        },
    },
    'usage': {'input_tokens': 8, 'output_tokens': 215},
}


def test_langsearch_missing_key(monkeypatch):
    monkeypatch.delenv('LANGSEARCH_API_KEY', raising=False)
    search = _create_langsearch_search()
    res = search.invoke({'query': 'python'})
    assert res['error'] == 'LANGSEARCH_API_KEY 未配置'
    assert res['results'] == []


def test_langsearch_success_maps_request_and_response(monkeypatch):
    monkeypatch.setenv('LANGSEARCH_API_KEY', 'test_key')

    with patch('httpx.Client.post', return_value=_response(200, _SUCCESS_BODY)) as mock_post:
        search = _create_langsearch_search()
        res = search.invoke(
            {
                'query': '什么是设计模式?',
                'count': 5,
                'time_range': 'OneWeek',
                'sites': ['processon.com', 'github.com'],
                'block_hosts': ['badsite.com'],
                'content_format': 'text',
            }
        )

        # 响应规整：name/url/text/datePublished 映射到统一结构。
        assert res['query'] == '什么是设计模式?'
        assert res['total_matches'] == 2
        assert res['usage'] == {'input_tokens': 8, 'output_tokens': 215}
        assert len(res['results']) == 1
        item = res['results'][0]
        assert item['title'] == '设计模式'
        assert item['url'] == 'https://www.processon.com/view/5e81868be4b0069b2bbaa548'
        assert item['content'] == '设计模式（Design Pattern）是软件工程中对常见问题的可复用解决方案。'
        assert item['snippet'] == '设计模式是软件设计中常见问题的可复用解法。'
        assert item['publish_time'] == '2026-08-18T21:40:13.000Z'

        # 请求映射：PascalCase time_range -> camelCase freshness；站点过滤走原生字段。
        _, kwargs = mock_post.call_args
        payload = kwargs['json']
        assert payload['query'] == '什么是设计模式?'
        assert payload['count'] == 5
        assert payload['freshness'] == 'oneWeek'
        assert payload['includeDomains'] == ['processon.com', 'github.com']
        assert payload['excludeDomains'] == ['badsite.com']
        assert payload['contents'] == {'text': {'maxCharacters': 5000}}
        assert kwargs['headers']['Authorization'] == 'Bearer test_key'


def test_langsearch_snippet_mode_omits_contents(monkeypatch):
    """content_format='snippet' 不请求正文，交由服务端只回摘要。"""
    monkeypatch.setenv('LANGSEARCH_API_KEY', 'test_key')
    payload = _build_langsearch_payload('q', 3, None, None, None, 'snippet')
    assert 'contents' not in payload
    assert payload['count'] == 3


@pytest.mark.parametrize(
    ('raw', 'expected'),
    [
        ('OneDay', 'oneDay'),
        ('oneweek', 'oneWeek'),
        ('OneYear', 'oneYear'),
        ('2025-01-01', '2025-01-01'),
        ('2025-01-01..2025-12-31', '2025-01-01..2025-12-31'),
        (None, None),
        ('', None),
        ('yesterday', None),  # 无法识别：丢弃过滤而不是让整次搜索 400
    ],
)
def test_normalize_freshness(raw, expected):
    assert _normalize_freshness(raw) == expected


def test_langsearch_http_error_is_structured(monkeypatch):
    """错误体里 message/msg/code 的类型不固定，但必须给出可读错误且不抛异常。"""
    monkeypatch.setenv('LANGSEARCH_API_KEY', 'test_key')
    body = {'code': '400', 'log_id': 'example-request-id', 'message': 'count must not exceed 50'}

    with patch('httpx.Client.post', return_value=_response(400, body)):
        search = _create_langsearch_search()
        res = search.invoke({'query': 'q', 'count': 50})

    assert res['results'] == []
    assert '400' in res['error']
    assert 'count must not exceed 50' in res['error']
    assert 'example-request-id' in res['error']


def test_register_web_search_tool_provider_selection(monkeypatch):
    monkeypatch.setenv('WEB_SEARCH_PROVIDER', 'langsearch')
    monkeypatch.setenv('LANGSEARCH_API_KEY', 'key1')

    instances_before = len(_all_tool_instances)

    _register_web_search_tool()

    assert _extra_registry['web_search'].display_name == 'LangSearch 网页搜索'
    assert len(_all_tool_instances) == instances_before + 1
    assert _all_tool_instances[-1].name == 'web_search'


def test_no_provider_selected_registers_nothing(monkeypatch):
    """未配置 provider 与 key 时不得注册 web_search（模型不应看到不可用的工具）。"""
    monkeypatch.delenv('WEB_SEARCH_PROVIDER', raising=False)
    monkeypatch.delenv('LANGSEARCH_API_KEY', raising=False)

    instances_before = len(_all_tool_instances)
    _register_web_search_tool()

    assert len(_all_tool_instances) == instances_before
