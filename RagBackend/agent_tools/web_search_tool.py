"""
web_search_tool.py
Agent 联网搜索工具

集成方案（免费，无需 API Key）：
  1. DuckDuckGo Instant Answer API  — 结构化结果，速度快
  2. DuckDuckGo HTML 搜索（fallback）— 更完整的网页摘要

返回格式：标准化文本，供 LangChain Tool / ReActAgent 使用

使用方式（在 react_agent.py 中扩展工具列表）：
  from agent_tools.web_search_tool import build_web_search_tool
  tools = [build_rag_search_tool(...), build_web_search_tool()]
"""

from __future__ import annotations

import json
import logging
import re
import urllib.parse
import urllib.request
from typing import Optional
from langchain.tools import Tool

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# DuckDuckGo Instant Answer（零 API Key）
# ─────────────────────────────────────────────────────────────────

_DDG_INSTANT_URL = "https://api.duckduckgo.com/"
_DDG_HTML_URL = "https://html.duckduckgo.com/html/"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

_TIMEOUT = 10  # 秒


def _http_get(url: str, params: dict) -> str:
    """同步 HTTP GET，返回响应体字符串"""
    qs = urllib.parse.urlencode(params)
    full_url = f"{url}?{qs}"
    req = urllib.request.Request(full_url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def _search_ddg_instant(query: str, max_results: int = 5) -> str:
    """
    调用 DuckDuckGo Instant Answer API。
    返回：格式化的搜索结果文本
    """
    params = {
        "q": query,
        "format": "json",
        "no_html": "1",
        "skip_disambig": "1",
    }
    try:
        raw = _http_get(_DDG_INSTANT_URL, params)
        data = json.loads(raw)
    except Exception as e:
        logger.warning(f"[WebSearch] DDG Instant API 失败: {e}")
        return _search_ddg_html(query, max_results)

    parts = []

    # 1. Abstract（百科摘要）
    abstract = data.get("AbstractText", "").strip()
    abstract_url = data.get("AbstractURL", "")
    if abstract:
        parts.append(f"【摘要】{abstract}")
        if abstract_url:
            parts.append(f"来源: {abstract_url}")

    # 2. Answer（直接答案，如计算/单位换算）
    answer = data.get("Answer", "").strip()
    if answer:
        parts.append(f"【直接答案】{answer}")

    # 3. RelatedTopics（相关话题）
    topics = data.get("RelatedTopics", [])
    count = 0
    for topic in topics:
        if count >= max_results:
            break
        if isinstance(topic, dict) and "Text" in topic:
            text = topic["Text"].strip()
            url = topic.get("FirstURL", "")
            if text:
                parts.append(f"• {text}" + (f"\n  链接: {url}" if url else ""))
                count += 1
        elif isinstance(topic, dict) and "Topics" in topic:
            # 嵌套 topics
            for sub in topic["Topics"]:
                if count >= max_results:
                    break
                if isinstance(sub, dict) and "Text" in sub:
                    text = sub["Text"].strip()
                    url = sub.get("FirstURL", "")
                    if text:
                        parts.append(f"• {text}" + (f"\n  链接: {url}" if url else ""))
                        count += 1

    if parts:
        return "\n\n".join(parts)

    # 没有 Instant Answer → fallback 到 HTML
    return _search_ddg_html(query, max_results)


def _search_ddg_html(query: str, max_results: int = 5) -> str:
    """
    解析 DuckDuckGo HTML 搜索结果页（fallback）。
    返回：格式化的搜索结果文本
    """
    params = {"q": query, "kl": "cn-zh"}  # 中文地区设置
    try:
        html = _http_get(_DDG_HTML_URL, params)
    except Exception as e:
        return f"联网搜索失败: {str(e)}"

    # 提取搜索结果标题 + 摘要（简单正则，不依赖 BeautifulSoup）
    # DDG HTML 结构：<a class="result__a" ...>标题</a> + <a class="result__snippet">摘要</a>
    titles = re.findall(r'class="result__a"[^>]*>(.*?)</a>', html, re.DOTALL)
    snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', html, re.DOTALL)
    links = re.findall(r'class="result__url"[^>]*>\s*(https?://[^\s<]+)', html)

    titles = [re.sub(r'<[^>]+>', '', t).strip() for t in titles]
    snippets = [re.sub(r'<[^>]+>', '', s).strip() for s in snippets]

    if not titles:
        return f"未找到关于"{query}"的相关结果。"

    parts = [f"🔍 联网搜索结果：{query}\n"]
    for i in range(min(max_results, len(titles))):
        title = titles[i] if i < len(titles) else ""
        snippet = snippets[i] if i < len(snippets) else ""
        link = links[i] if i < len(links) else ""
        entry = f"[{i+1}] {title}"
        if snippet:
            entry += f"\n    {snippet}"
        if link:
            entry += f"\n    链接: {link}"
        parts.append(entry)

    return "\n\n".join(parts)


# ─────────────────────────────────────────────────────────────────
# LangChain Tool 工厂函数
# ─────────────────────────────────────────────────────────────────

def build_web_search_tool(max_results: int = 5) -> Tool:
    """
    构建联网搜索 LangChain Tool，可直接加入 ReActRAGAgent 的工具列表。

    Args:
        max_results: 最多返回几条搜索结果

    Usage:
        tools = [build_rag_search_tool(...), build_web_search_tool()]
    """

    def web_search(query: str) -> str:
        """执行联网搜索，返回格式化的搜索摘要"""
        logger.info(f"[WebSearch] 执行搜索: {query}")
        try:
            result = _search_ddg_instant(query.strip(), max_results=max_results)
            logger.info(f"[WebSearch] 搜索完成，结果长度: {len(result)}")
            return result
        except Exception as e:
            logger.error(f"[WebSearch] 搜索异常: {e}", exc_info=True)
            return f"联网搜索遇到错误: {str(e)}，请尝试其他问法。"

    return Tool(
        name="web_search",
        func=web_search,
        description=(
            "在互联网上搜索最新信息、新闻、百科知识等。"
            "当用户询问实时信息（如最新新闻、当前价格、近期事件）"
            "或知识库中没有相关内容时，应使用此工具。"
            "输入应为简洁的搜索关键词或问题。"
        ),
    )


# ─────────────────────────────────────────────────────────────────
# FastAPI 路由（独立暴露，供前端直接调用）
# ─────────────────────────────────────────────────────────────────

from fastapi import APIRouter, Query
api_router = APIRouter()


@api_router.get("/api/agent/web-search", summary="联网搜索")
async def api_web_search(
    q: str = Query(..., description="搜索关键词"),
    max_results: int = Query(5, ge=1, le=10, description="最多返回结果数"),
):
    """
    独立的联网搜索接口，前端也可直接调用。
    不需要 API Key，基于 DuckDuckGo 免费接口。
    """
    import asyncio
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, lambda: _search_ddg_instant(q, max_results=max_results)
    )
    return {"query": q, "result": result}
