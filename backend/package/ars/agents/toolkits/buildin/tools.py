import asyncio
import os
import re
import tempfile
from contextlib import suppress
from pathlib import Path, PurePosixPath
from typing import Annotated

import httpx
from langchain.tools import InjectedToolCallId
from langchain_core.messages import ToolMessage
from langchain_core.tools import tool as langchain_tool
from langgraph.prebuilt.tool_node import ToolRuntime
from langgraph.types import Command, interrupt
from pydantic import BaseModel, Field

from ars.agents.backends.paths import (
    VIRTUAL_PATH_PREFIX,
    VIRTUAL_SKILLS_PATH,
)
from ars.agents.backends.sandbox import ProvisionerSandboxBackend
from ars.agents.toolkits.registry import ToolExtraMetadata, _all_tool_instances, _extra_registry, tool
from ars.config.options import system_options
from ars.utils import logger
from ars.utils.question_utils import normalize_questions

_OCR_OUTPUT_DIR_NAME = "ocr"
_OCR_PREVIEW_LIMIT = 1200
_SAFE_OUTPUT_STEM_RE = re.compile(r"[^A-Za-z0-9._\-\u4e00-\u9fff]+")


_LANGSEARCH_SEARCH_URL = "https://api.langsearch.com/v1/web-search"

# LangSearch 的 freshness 预设为小写驼峰；本工具对模型暴露的 time_range 沿用上游的
# PascalCase（OneDay/OneWeek/...）。两者只差首字母大小写，映射见 _normalize_freshness。
_LANGSEARCH_FRESHNESS_PRESETS = {
    "oneday": "oneDay",
    "oneweek": "oneWeek",
    "onemonth": "oneMonth",
    "oneyear": "oneYear",
}
_DATE_ONLY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DATE_RANGE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$")

# 单条结果正文的默认字符上限（LangSearch 按字符计，非 token）。
_LANGSEARCH_DEFAULT_MAX_CHARS = 5000

LANGSEARCH_SEARCH_DESCRIPTION = """执行网络网页搜索，获取实时互联网网页内容与资料。

适用场景：
1. 获取最新的时事新闻、即时信息或最新科技动态
2. 检索特定网站的内容（通过 sites 参数指定）
3. 查找指定时间范围内发布的文章（通过 time_range 参数过滤）

参数使用建议：
- query: 输入简短清晰的搜索关键词或简短提问
- count: 默认 10 条，深度调研可适当调大（最多 50 条）
- time_range: 需要时效性强的资讯时建议传入 'OneDay'、'OneWeek' 或 'OneMonth'
- sites: 仅需特定站点（如官媒、平台）时传入站点域名
- content_format: 默认 'text' 返回完整正文（单条最多 5000 字符）；上下文紧张时用 'snippet' 只要摘要
"""


class LangSearchInput(BaseModel):
    query: str = Field(description="搜索查询词，1-100字符，必须精准描述检索需求")
    count: int = Field(default=10, ge=1, le=50, description="返回搜索结果数量，支持 1-50 条，默认 10 条")
    time_range: str | None = Field(
        default=None,
        description=(
            "按发文时间筛选结果。可选枚举值:\n"
            "- 'OneDay': 近24小时内\n"
            "- 'OneWeek': 近1周内\n"
            "- 'OneMonth': 近1个月内\n"
            "- 'OneYear': 近1年内\n"
            "- 'YYYY-MM-DD..YYYY-MM-DD': 自定义日期范围区间 (如 '2025-01-01..2025-12-31')"
        ),
    )
    sites: list[str] | None = Field(
        default=None, description="指定限定搜索的完整域名列表 (如 ['sohu.com', '163.com'])，最多支持 20 个站点"
    )
    block_hosts: list[str] | None = Field(
        default=None, description="指定屏蔽的搜索域名列表 (如 ['example.com'])，最多支持 5 个站点"
    )
    content_format: str = Field(
        default="text",
        description=(
            "正文详略：'text'（默认）返回完整正文，'snippet' 仅返回摘要以节省上下文。"
            "为兼容旧用法保留 'markdown'，其行为等同 'text'（LangSearch 只输出纯文本）。"
        ),
    )


def _normalize_freshness(time_range: str | None) -> str | None:
    """把对模型暴露的 time_range 规整为 LangSearch 的 freshness。

    预设值仅差首字母大小写（OneDay -> oneDay），日期与日期区间原样透传。
    无法识别的取值返回 None：丢弃时间过滤而不是让整次搜索失败，并告警以保持可观察。
    """
    if not time_range:
        return None
    raw = time_range.strip()
    preset = _LANGSEARCH_FRESHNESS_PRESETS.get(raw.lower())
    if preset:
        return preset
    if _DATE_ONLY_RE.match(raw) or _DATE_RANGE_RE.match(raw):
        return raw
    logger.warning(f"无法识别的 time_range '{raw}'，已忽略该时间过滤。")
    return None


def _build_langsearch_payload(
    query: str,
    count: int,
    time_range: str | None,
    sites: list[str] | None,
    block_hosts: list[str] | None,
    content_format: str,
) -> dict:
    payload: dict = {"query": query[:100], "count": min(max(1, count), 50)}

    freshness = _normalize_freshness(time_range)
    if freshness:
        payload["freshness"] = freshness

    if sites:
        payload["includeDomains"] = sites[:20]
    if block_hosts:
        payload["excludeDomains"] = block_hosts[:5]

    # 'snippet' 只取摘要；'text' 与 'markdown' 均请求完整正文。
    if content_format.strip().lower() != "snippet":
        payload["contents"] = {"text": {"maxCharacters": _LANGSEARCH_DEFAULT_MAX_CHARS}}

    return payload


def _parse_langsearch_response(query: str, data: dict) -> dict:
    """把 LangSearch 响应规整为统一的 web_search 结果结构。

    HTTP 状态由调用方经 raise_for_status 把关，此处只处理响应体。
    """
    web_pages = (data.get("data") or {}).get("webPages") or {}
    results = []
    for item in web_pages.get("value") or []:
        res_item = {
            "title": item.get("name") or "",
            "url": item.get("url") or "",
            # 请求正文时 text 有值；否则回落到 snippet。
            "content": item.get("text") or item.get("snippet") or "",
        }
        if item.get("snippet") and item.get("text"):
            res_item["snippet"] = item["snippet"]
        if item.get("datePublished"):
            res_item["publish_time"] = item["datePublished"]
        results.append(res_item)

    parsed: dict = {
        "query": query,
        "results": results,
        "total_matches": web_pages.get("totalEstimatedMatches"),
    }
    usage = data.get("usage") or {}
    if usage:
        parsed["usage"] = usage
    return parsed


def _langsearch_error_detail(response: httpx.Response) -> str:
    """从错误响应中提取可读信息。

    官方约定：错误文本可能出现在 `message` 或 `msg`，`code` 可能是字符串或数字，
    因此逐一兼容读取；`log_id` 一并带出以便向服务方排查。
    """
    try:
        body = response.json()
    except Exception:  # noqa: BLE001 - 非 JSON 响应体同样要给出可读信息
        text = (response.text or "").strip()
        return text[:200] if text else "无响应体"
    detail = body.get("message") or body.get("msg") or body.get("code") or ""
    log_id = body.get("log_id")
    return f"{detail} (log_id={log_id})" if log_id else str(detail)


@langchain_tool("web_search", args_schema=LangSearchInput, description=LANGSEARCH_SEARCH_DESCRIPTION)
def _langsearch_search(
    query: str,
    count: int = 10,
    time_range: str | None = None,
    sites: list[str] | None = None,
    block_hosts: list[str] | None = None,
    content_format: str = "text",
) -> dict:
    api_key = os.getenv("LANGSEARCH_API_KEY")
    if not api_key:
        return {"query": query, "results": [], "error": "LANGSEARCH_API_KEY 未配置"}

    payload = _build_langsearch_payload(query, count, time_range, sites, block_hosts, content_format)
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(_LANGSEARCH_SEARCH_URL, headers=headers, json=payload)
            # 以 HTTP 状态为判据：响应体的 code 可能是字符串或数字，且 msg 在出错时也可能为 null。
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        detail = _langsearch_error_detail(exc.response)
        logger.error(f"LangSearch 返回 HTTP {exc.response.status_code}: {detail}")
        return {"query": query, "results": [], "error": f"HTTP {exc.response.status_code}: {detail}"}
    except Exception as exc:  # noqa: BLE001 - 网络/解析异常统一降级为结构化错误
        logger.error(f"LangSearch search failed: {exc}")
        return {"query": query, "results": [], "error": str(exc)}

    return _parse_langsearch_response(query, data)


def _create_langsearch_search():
    """Create the LangSearch web search tool instance."""
    return _langsearch_search


# provider -> (required env var, factory, display name)
_WEB_SEARCH_PROVIDERS = {
    "langsearch": ("LANGSEARCH_API_KEY", _create_langsearch_search, "LangSearch 网页搜索"),
}


def _resolve_web_search_provider() -> str | None:
    """Resolve the web search provider to use from WEB_SEARCH_PROVIDER, or auto-detect by API key."""
    configured = os.getenv("WEB_SEARCH_PROVIDER", "").strip().lower()
    if configured:
        if configured not in _WEB_SEARCH_PROVIDERS:
            logger.warning(f"Unknown WEB_SEARCH_PROVIDER '{configured}', ignoring.")
            return None
        env_key, _, _ = _WEB_SEARCH_PROVIDERS[configured]
        if not os.getenv(env_key):
            logger.warning(f"WEB_SEARCH_PROVIDER is set to '{configured}', but {env_key} is not configured.")
            return None
        return configured

    return next(
        (provider for provider, (env_key, _, _) in _WEB_SEARCH_PROVIDERS.items() if os.getenv(env_key)),
        None,
    )


def _register_web_search_tool() -> None:
    """Register the web search tool selected via WEB_SEARCH_PROVIDER (or auto-detection)."""
    provider = _resolve_web_search_provider()
    if provider is None:
        return

    _, create_tool, display_name = _WEB_SEARCH_PROVIDERS[provider]
    _extra_registry["web_search"] = ToolExtraMetadata(category="buildin", tags=["搜索"], display_name=display_name)
    _all_tool_instances.append(create_tool())


# 模块加载时注册网络搜索工具
try:
    _register_web_search_tool()
except Exception as e:
    logger.warning(f"Failed to register web search tool: {e}")


class PresentArtifactsInput(BaseModel):
    """Expose artifact files to the frontend after the agent finishes."""

    filepaths: list[str] = Field(description="需要展示给用户的文件绝对路径列表；建议把交付物放在 Project outputs/ 下")


def _normalize_presented_artifact_path(filepath: str, runtime: ToolRuntime) -> str:
    from ars.agents.backends.sandbox.backend import ProvisionerSandboxBackend

    runtime_context = runtime.context
    runtime_scope_id, uid, workdir_relative_path = _resolve_runtime_sandbox_scope(runtime)

    normalized_input = str(filepath or "").strip()
    if not normalized_input:
        raise ValueError("文件路径不能为空")

    normalized_path = str(
        PurePosixPath(normalized_input if normalized_input.startswith("/") else f"/{normalized_input}")
    )
    workdir_path = str(getattr(runtime_context, "workdir_path", "") or "").rstrip("/")
    allowed = normalized_path.startswith(f"{workdir_path}/") or normalized_path.startswith(
        f"{VIRTUAL_PATH_PREFIX.rstrip('/')}/"
    )
    allowed = allowed or normalized_path.startswith(f"{VIRTUAL_SKILLS_PATH}/")
    if not workdir_path or not allowed:
        raise ValueError(f"文件不在当前用户可见范围内: {normalized_input}")
    backend = ProvisionerSandboxBackend(
        thread_id=runtime_scope_id,
        uid=str(uid),
        workdir_path=workdir_relative_path,
        create_if_missing=False,
    )
    if not backend.regular_file_exists(normalized_path):
        raise ValueError(f"文件不存在或不是普通文件: {normalized_input}")
    return normalized_path


PRESENT_ARTIFACTS_DESCRIPTION = """
将已经生成好的结果文件展示给用户。

使用场景：
1. 你已经写好了最终结果文件；建议放在当前 Project Workdir 的 `outputs/` 下
2. 你希望前端在对话结束后显示这些结果文件卡片
3. 这些文件需要支持下载或预览

注意事项：
1. 可以传入当前 Project Workdir、User Data 或已授权 Skills 中的普通文件
2. 不要传入中间过程文件，只有真正需要给用户看的结果文件才调用
3. 可以一次传多个文件
"""


@tool(
    category="buildin",
    tags=["文件", "交付物"],
    display_name="展示交付物",
    description=PRESENT_ARTIFACTS_DESCRIPTION,
    args_schema=PresentArtifactsInput,
)
def present_artifacts(
    filepaths: list[str],
    runtime: ToolRuntime,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """登记当前用户可见的普通文件，使前端展示给用户。"""
    try:
        normalized_paths = [_normalize_presented_artifact_path(filepath, runtime) for filepath in filepaths]
    except ValueError as exc:
        return Command(update={"messages": [ToolMessage(content=f"Error: {exc}", tool_call_id=tool_call_id)]})

    return Command(
        update={
            "artifacts": normalized_paths,
            "messages": [ToolMessage(content="已将交付物展示给用户", tool_call_id=tool_call_id)],
        }
    )


class OcrParseFileInput(BaseModel):
    """Parse a sandbox file with OCR and save the Markdown result."""

    file_path: str = Field(description="需要 OCR 解析的 Project、User Data 或已授权 Skill 文件绝对路径")
    ocr_engine: str | None = Field(default=None, description="可选 OCR 引擎；省略时使用系统默认 OCR 引擎")


OCR_PARSE_FILE_DESCRIPTION = """
将沙盒中的 PDF、Office 文档或图片文件解析为 Markdown 文本，并把结果保存为文件。

使用场景：
1. 用户上传了 PDF、Office 文档或图片附件，需要提取其中的文字内容
2. Project Workdir、User Data 或 Skills 下已有文件，需要转成可读取的 Markdown
3. 解析结果较长，后续应使用 read_file 读取保存后的 Markdown 文件

注意事项：
1. file_path 必须位于当前用户可见范围
2. 解析结果会写入当前 Project Workdir 的 outputs/ocr/ 下
4. 工具只返回结果文件路径和短预览，不直接返回完整 OCR 文本
5. 如需在前端展示结果文件，请再调用 present_artifacts
"""


@tool(
    category="buildin",
    tags=["文件", "OCR"],
    display_name="OCR 解析文件",
    description=OCR_PARSE_FILE_DESCRIPTION,
    args_schema=OcrParseFileInput,
)
async def ocr_parse_file(file_path: str, runtime: ToolRuntime, ocr_engine: str | None = None) -> dict:
    """Parse a sandbox file with OCR, persist Markdown output, and return only a short result summary."""
    from ars.services.ocr_service import parse_document

    runtime_scope_id, uid, workdir_relative_path = _resolve_runtime_sandbox_scope(runtime)
    source_virtual_path = _resolve_ocr_source_path(file_path, runtime)
    backend = ProvisionerSandboxBackend(
        thread_id=runtime_scope_id,
        uid=uid,
        workdir_path=workdir_relative_path,
        create_if_missing=False,
    )
    from ars.services.ocr_service import resolve_ocr_engine_id

    engine = resolve_ocr_engine_id(ocr_engine, (await system_options.get())["default_ocr_engine"])
    source_temp = ""
    output_temp = ""
    try:
        suffix = PurePosixPath(source_virtual_path).suffix
        with tempfile.NamedTemporaryFile(prefix="ars-ocr-source-", suffix=suffix, delete=False) as temp_file:
            source_temp = temp_file.name
        try:
            await asyncio.to_thread(
                backend.download_authorized_file_to_path,
                source_virtual_path,
                source_temp,
                100 * 1024 * 1024,
            )
        except ValueError as exc:
            raise ValueError(f"文件不存在或不是普通文件: {source_virtual_path}") from exc
        markdown = await parse_document(source_temp, params={"ocr_engine": engine})
        workdir_path = str(_runtime_scope_value(runtime, "workdir_path") or "").rstrip("/")
        parsed_path = _next_ocr_output_path(backend, workdir_path, PurePosixPath(source_virtual_path))
        with tempfile.NamedTemporaryFile(prefix="ars-ocr-output-", delete=False) as temp_file:
            output_temp = temp_file.name
            temp_file.write(markdown.encode("utf-8"))
        await asyncio.to_thread(backend.upload_authorized_file_from_path, parsed_path, output_temp)
    finally:
        for temp_path in (source_temp, output_temp):
            if temp_path:
                with suppress(FileNotFoundError):
                    await asyncio.to_thread(os.unlink, temp_path)
    preview, truncated = _ocr_preview(markdown)

    return {
        "source_path": source_virtual_path,
        "parsed_path": parsed_path,
        "ocr_engine": engine,
        "char_count": len(markdown),
        "preview": preview,
        "truncated": truncated,
    }


def _resolve_ocr_source_path(file_path: str, runtime: ToolRuntime) -> str:
    """校验 OCR 输入位于当前用户可见文件范围。"""
    _resolve_runtime_sandbox_scope(runtime)

    normalized_input = str(file_path or "").strip()
    if not normalized_input:
        raise ValueError("文件路径不能为空")
    if ".." in PurePosixPath(normalized_input).parts:
        raise ValueError("只允许解析当前用户可见范围内的文件")

    clean_virtual_path = "/" + normalized_input.lstrip("/")
    workdir_path = str(_runtime_scope_value(runtime, "workdir_path") or "").rstrip("/")
    allowed = clean_virtual_path.startswith(f"{workdir_path}/") or clean_virtual_path.startswith(
        f"{VIRTUAL_PATH_PREFIX.rstrip('/')}/"
    )
    allowed = allowed or clean_virtual_path.startswith(f"{VIRTUAL_SKILLS_PATH}/")
    if not workdir_path or not allowed:
        raise ValueError("只允许解析当前用户可见范围内的文件")

    return clean_virtual_path


def _resolve_runtime_sandbox_scope(runtime: ToolRuntime) -> tuple[str, str, str]:
    """读取 execution runtime、用户与 Workdir 路径。"""
    runtime_thread_id = _runtime_scope_value(runtime, "runtime_scope_id") or _runtime_scope_value(runtime, "thread_id")
    uid = _runtime_scope_value(runtime, "uid")
    workdir_path = _runtime_scope_value(runtime, "workdir_relative_path")
    if not runtime_thread_id:
        raise ValueError("当前运行时缺少 thread_id")
    if not uid:
        raise ValueError("当前运行时缺少 uid")
    if not workdir_path:
        raise ValueError("当前运行时缺少 workdir_relative_path")
    return runtime_thread_id, uid, workdir_path


def _runtime_scope_value(runtime: ToolRuntime, key: str) -> str | None:
    """Look up a runtime scope value from LangGraph config, context, or state."""
    config = getattr(runtime, "config", None)
    configurable = config.get("configurable", {}) if isinstance(config, dict) else {}
    sources = (
        configurable if isinstance(configurable, dict) else {},
        getattr(runtime, "context", None),
        getattr(runtime, "state", None) if isinstance(getattr(runtime, "state", None), dict) else {},
    )
    for source in sources:
        value = source.get(key) if isinstance(source, dict) else getattr(source, key, None)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _next_ocr_output_path(backend, workdir_path: str, source_path: PurePosixPath) -> str:
    """在当前 Project outputs 中选择不冲突的 Markdown 路径。"""
    base_name = _safe_ocr_output_stem(source_path)
    candidate = f"{workdir_path}/outputs/{_OCR_OUTPUT_DIR_NAME}/{base_name}.md"
    index = 1
    while backend.regular_file_exists(candidate):
        candidate = f"{workdir_path}/outputs/{_OCR_OUTPUT_DIR_NAME}/{base_name}-{index}.md"
        index += 1
    return candidate


def _safe_ocr_output_stem(source_path: Path) -> str:
    """Build a filesystem-friendly output filename stem from the source file name."""
    stem = source_path.stem.strip() or "ocr_result"
    safe_stem = _SAFE_OUTPUT_STEM_RE.sub("_", stem).strip("._-")
    return safe_stem or "ocr_result"


def _ocr_preview(markdown: str) -> tuple[str, bool]:
    """Return the short preview included in the tool result and whether it was truncated."""
    if len(markdown) <= _OCR_PREVIEW_LIMIT:
        return markdown, False
    return markdown[:_OCR_PREVIEW_LIMIT].rstrip(), True


ASK_USER_QUESTION_DESCRIPTION = """
在执行过程中，当你需要用户做决定或补充需求时，使用这个工具向用户提问。

适用场景：
1. 收集用户偏好或需求（例如风格、范围、优先级）
2. 澄清模糊指令（存在多种合理解释时）
3. 在实现过程中让用户选择方案方向
4. 在有明显权衡时让用户做取舍

使用规范：
1. questions 提供 1-5 个问题，每项包含：question、options、multi_select、allow_other
2. 每个问题的 options 提供 2-5 个有区分度的选项，每项包含 label 和 value
3. 若有推荐选项：把推荐项放在第一位，并在 label 末尾加 "(Recommended)"
4. 若需要多选：将该问题的 multi_select 设为 true
5. allow_other 通常保持 true，用户可通过 Other 输入自定义答案

注意事项：
1. 不要用这个工具询问“是否继续执行”“计划是否准备好”这类流程控制问题
2. 不要在信息已充分、无需用户决策时滥用该工具
3. 先基于现有上下文自行决策，只有关键不确定性时才提问

返回结果：
answer 为 object，格式为 {question_id: answer}。
其中 answer 可能是 string（单选）、list（多选）或 object（Other 文本）。
"""


@tool(
    category="buildin",
    tags=["交互"],
    display_name="向用户提问",
    description=ASK_USER_QUESTION_DESCRIPTION,
)
def ask_user_question(
    questions: Annotated[
        list[dict] | str | None,
        "问题列表，每项格式 {question, options, multi_select, allow_other, question_id(optional)}",
    ] = None,
) -> dict:
    """向用户发起问题并等待回答。"""
    # 解析 questions 参数：如果是字符串，尝试解析为 JSON
    if isinstance(questions, str):
        try:
            import json

            questions = json.loads(questions)
            logger.debug(f"Parsed string questions to list: {questions}")
        except Exception as e:
            logger.error(f"Failed to parse questions string: {e}, using None")
            questions = None

    normalized_questions = normalize_questions(questions or [])

    if not normalized_questions:
        raise ValueError("questions 至少需要包含一个有效问题")

    interrupt_payload = {
        "questions": normalized_questions,
        "source": "ask_user_question",
    }
    answer = interrupt(interrupt_payload)

    return {
        "questions": normalized_questions,
        "answer": answer,
    }
