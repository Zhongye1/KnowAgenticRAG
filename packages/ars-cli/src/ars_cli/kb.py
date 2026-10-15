from __future__ import annotations

import json
from typing import Any

from rich.console import Console
from rich.table import Table

from ars_cli.client import ArsClient
from ars_cli.config import ConfigStore, Remote
from ars_cli.discovery import ServerCompatibilityError, ensure_server_compatible


class KbError(Exception):
    pass


# =============================================================================
# === 命令入口 ===
# =============================================================================


def run_kb_list(
    store: ConfigStore,
    remote_name: str | None,
    console: Console,
    *,
    as_json: bool = False,
    client_factory: type[ArsClient] = ArsClient,
) -> dict:
    remote = _require_remote(store, remote_name)
    with client_factory(remote) as client:
        _ensure_capability(client, "cli.kb_list")
        data = client.list_external_databases()
    _render_databases(data, console, as_json=as_json)
    return data


def run_kb_files(
    store: ConfigStore,
    remote_name: str | None,
    kb_id: str,
    console: Console,
    *,
    query: str | None = None,
    offset: int = 0,
    limit: int = 100,
    status: str = "all",
    as_json: bool = False,
    client_factory: type[ArsClient] = ArsClient,
) -> dict:
    remote = _require_remote(store, remote_name)
    with client_factory(remote) as client:
        _ensure_capability(client, "cli.kb_files")
        data = client.list_external_files(
            kb_id,
            query=query,
            offset=offset,
            limit=limit,
            status=status,
        )
    _render_files(data, console, as_json=as_json, query=query)
    return data


def run_kb_query(
    store: ConfigStore,
    remote_name: str | None,
    kb_id: str,
    query: str,
    console: Console,
    *,
    file_name: str | None = None,
    top_k: int | None = None,
    search_mode: str | None = None,
    as_json: bool = False,
    client_factory: type[ArsClient] = ArsClient,
) -> dict:
    options: dict[str, Any] = {}
    if top_k is not None:
        options["final_top_k"] = top_k
    if search_mode:
        options["search_mode"] = search_mode

    remote = _require_remote(store, remote_name)
    with client_factory(remote) as client:
        _ensure_capability(client, "cli.kb_query")
        data = client.retrieve_external(
            kb_id, query=query, file_name=file_name, options=options
        )
    _render_retrieve(data, console, as_json=as_json)
    return data


def run_kb_open(
    store: ConfigStore,
    remote_name: str | None,
    kb_id: str,
    file_id: str,
    console: Console,
    *,
    offset: int = 0,
    limit: int = 200,
    as_json: bool = False,
    client_factory: type[ArsClient] = ArsClient,
) -> dict:
    remote = _require_remote(store, remote_name)
    with client_factory(remote) as client:
        _ensure_capability(client, "cli.kb_open")
        data = client.open_external_file(kb_id, file_id, offset=offset, limit=limit)
    _render_open(data, console, as_json=as_json)
    return data


def run_kb_find(
    store: ConfigStore,
    remote_name: str | None,
    kb_id: str,
    file_id: str,
    patterns: list[str],
    console: Console,
    *,
    use_regex: bool = False,
    case_sensitive: bool = False,
    max_windows: int = 5,
    window_size: int = 80,
    as_json: bool = False,
    client_factory: type[ArsClient] = ArsClient,
) -> dict:
    if not patterns:
        raise KbError("至少提供一个 --pattern")
    remote = _require_remote(store, remote_name)
    with client_factory(remote) as client:
        _ensure_capability(client, "cli.kb_find")
        data = client.find_external_file(
            kb_id,
            file_id,
            patterns=patterns,
            use_regex=use_regex,
            case_sensitive=case_sensitive,
            max_windows=max_windows,
            window_size=window_size,
        )
    _render_find(data, console, as_json=as_json)
    return data


# =============================================================================
# === 渲染与公共辅助 ===
# =============================================================================


def _require_remote(store: ConfigStore, remote_name: str | None) -> Remote:
    remote = store.load().get_remote(remote_name)
    if not remote.api_key:
        raise KbError(f"remote 尚未登录: {remote.name}")
    return remote


def _ensure_capability(client: ArsClient, capability: str) -> None:
    try:
        ensure_server_compatible(client.discovery(), capability)
    except ServerCompatibilityError as exc:
        raise KbError(str(exc)) from exc


def _render_databases(data: dict, console: Console, *, as_json: bool) -> None:
    if as_json:
        _print_json(data, console)
        return
    databases = data.get("databases") or []
    if not databases:
        console.print("没有可访问的知识库")
        return
    table = Table(show_header=True, header_style="bold")
    table.add_column("Name")
    table.add_column("Type", width=12)
    table.add_column("Docs", width=5, justify="center")
    table.add_column("KB ID")
    for db in databases:
        table.add_row(
            str(db.get("name") or "-"),
            str(db.get("kb_type") or "-"),
            "yes" if db.get("supports_documents") else "-",
            str(db.get("kb_id") or "-"),
        )
    console.print(table)


def _render_files(
    data: dict, console: Console, *, as_json: bool, query: str | None
) -> None:
    if as_json:
        _print_json(data, console)
        return
    items = data.get("files") or []
    if not items:
        console.print("没有匹配的文件" if query else "知识库中没有文件")
        return
    table = Table(show_header=True, header_style="bold")
    table.add_column("Name")
    table.add_column("Type", width=8)
    table.add_column("Status", width=14)
    table.add_column("Size", width=12, justify="right")
    table.add_column("File ID")
    for item in items:
        table.add_row(
            str(item.get("filename") or item.get("name") or "-"),
            str(
                item.get("file_type") or ("-folder-" if item.get("is_folder") else "-")
            ),
            str(item.get("status") or "-"),
            _format_file_size(item.get("file_size")),
            str(item.get("file_id") or "-"),
        )
    total = int(data.get("total") or 0)
    console.print(table)
    console.print(
        f"共 {total} 条，已展示 {len(items)} 条"
        + ("，还有更多" if data.get("has_more") else "")
    )


def _render_retrieve(data: dict, console: Console, *, as_json: bool) -> None:
    if as_json:
        _print_json(data, console)
        return
    result = data.get("results")
    if isinstance(result, list):
        if not result:
            console.print("没有检索到相关内容")
            return
        for idx, chunk in enumerate(result, 1):
            if not isinstance(chunk, dict):
                console.print(chunk)
                continue
            content = str(chunk.get("content") or "").strip()
            file_id = str(chunk.get("file_id") or "")
            score = (chunk.get("metadata") or {}).get("score")
            header = f"[bold]#{idx}[/bold]"
            if file_id:
                header += f"  file={file_id}"
            if score is not None:
                header += f"  score={score}"
            console.print(header)
            console.print(content)
            console.print()
    elif isinstance(result, str):
        console.print(result)
    else:
        _print_json(data, console)


def _render_open(data: dict, console: Console, *, as_json: bool) -> None:
    if as_json:
        _print_json(data, console)
        return
    content = str(data.get("content") or "")
    start = data.get("start_line")
    end = data.get("end_line")
    total = data.get("total_lines")
    console.print(f"行 {start}-{end} / 共 {total} 行")
    if content:
        console.print(content)


def _render_find(data: dict, console: Console, *, as_json: bool) -> None:
    if as_json:
        _print_json(data, console)
        return
    windows = data.get("windows") or []
    if not windows:
        console.print("没有匹配到内容")
        return
    for idx, window in enumerate(windows, 1):
        console.print(
            f"[bold]窗口 {idx}[/bold]  行 {window.get('start_line')}-{window.get('end_line')}"
            f"  匹配行: {window.get('matched_lines')}"
        )
        console.print(window.get("content") or "")
        console.print()


def _format_file_size(value) -> str:
    try:
        size = int(value or 0)
    except (TypeError, ValueError):
        return "-"
    if size <= 0:
        return "-"
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size} {unit}"
        size = round(size / 1024, 1)
    return f"{size} TB"


def _print_json(data: Any, console: Console) -> None:
    # 直接写到控制台底层流，绕过 Rich 的 markup/highlight，保证可被 jq 等工具解析。
    console.file.write(json.dumps(data, ensure_ascii=False, default=str) + "\n")
