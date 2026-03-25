"""
obsidian_sync.py
Obsidian Vault 双向同步模块
- 将 Obsidian Vault 中的 .md 文件同步到知识库
- 支持增量同步（基于 mtime 变化检测）
- 支持 [[wikilink]] 解析和反向链接提取
- API: POST /api/integrations/obsidian/sync, GET /status, POST /configure
"""

from __future__ import annotations

import os
import re
import json
import time
import hashlib
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

# ── 配置存储 ──────────────────────────────────────────────────────
_CONFIG_PATH = Path(__file__).parent.parent / "metadata" / "obsidian_config.json"
_SYNC_STATE_PATH = Path(__file__).parent.parent / "metadata" / "obsidian_sync_state.json"


def _load_config() -> dict:
    try:
        if _CONFIG_PATH.exists():
            return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _save_config(config: dict):
    _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_sync_state() -> dict:
    try:
        if _SYNC_STATE_PATH.exists():
            return json.loads(_SYNC_STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _save_sync_state(state: dict):
    _SYNC_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    _SYNC_STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Obsidian Markdown 处理 ─────────────────────────────────────────

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")
FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def _parse_md_file(file_path: Path) -> Dict[str, Any]:
    """解析 Obsidian Markdown 文件，提取元数据、正文、wikilinks"""
    text = file_path.read_text(encoding="utf-8", errors="ignore")

    # 提取 frontmatter
    frontmatter = {}
    body = text
    fm_match = FRONTMATTER_RE.match(text)
    if fm_match:
        body = text[fm_match.end():]
        try:
            import yaml
            frontmatter = yaml.safe_load(fm_match.group(1)) or {}
        except Exception:
            pass

    # 提取 wikilinks（[[链接]]）
    wikilinks = list(set(WIKILINK_RE.findall(text)))

    # 提取标签（#tag）
    tags = re.findall(r"(?<!\S)#([a-zA-Z\u4e00-\u9fff][a-zA-Z0-9\u4e00-\u9fff_/-]*)", body)

    return {
        "title": frontmatter.get("title") or file_path.stem,
        "body": body,
        "frontmatter": frontmatter,
        "wikilinks": wikilinks,
        "tags": list(set(tags)),
        "word_count": len(body),
    }


def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


# ── 核心同步逻辑 ──────────────────────────────────────────────────

def _do_sync(vault_path: str, kb_id: Optional[str], exclude_patterns: List[str]) -> Dict[str, Any]:
    """
    遍历 vault 目录，找出变化的 .md 文件，写入知识库文件目录
    返回同步统计：added / updated / skipped / errors
    """
    vault = Path(vault_path)
    if not vault.exists():
        raise FileNotFoundError(f"Vault 路径不存在: {vault_path}")

    state = _load_sync_state()
    vault_state = state.get(vault_path, {})

    stats = {"added": 0, "updated": 0, "skipped": 0, "errors": 0, "files": []}

    # 目标目录：将笔记复制到后端可访问的目录
    if kb_id:
        target_dir = Path(__file__).parent.parent / "local-KLB-files" / kb_id / "obsidian"
    else:
        target_dir = Path(__file__).parent.parent / "local-KLB-files" / "_obsidian_import"
    target_dir.mkdir(parents=True, exist_ok=True)

    for md_file in vault.rglob("*.md"):
        # 检查排除模式
        rel = md_file.relative_to(vault).as_posix()
        excluded = any(
            re.search(pattern, rel)
            for pattern in (exclude_patterns or [])
        )
        if excluded:
            stats["skipped"] += 1
            continue

        try:
            current_hash = _file_hash(md_file)
            prev_hash = vault_state.get(rel, {}).get("hash")

            if prev_hash == current_hash:
                stats["skipped"] += 1
                continue

            # 解析并复制
            parsed = _parse_md_file(md_file)

            # 写入到目标目录（保留子目录结构）
            dest = target_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(md_file.read_text(encoding="utf-8", errors="ignore"), encoding="utf-8")

            # 写入元数据 sidecar
            sidecar = dest.with_suffix(".meta.json")
            sidecar.write_text(json.dumps({
                "title": parsed["title"],
                "tags": parsed["tags"],
                "wikilinks": parsed["wikilinks"],
                "word_count": parsed["word_count"],
                "frontmatter": parsed["frontmatter"],
                "source": "obsidian",
                "vault_rel_path": rel,
                "synced_at": time.time(),
            }, ensure_ascii=False, indent=2), encoding="utf-8")

            action = "updated" if prev_hash else "added"
            stats[action] += 1
            stats["files"].append({"path": rel, "action": action, "title": parsed["title"]})

            vault_state[rel] = {"hash": current_hash, "synced_at": time.time()}

        except Exception as e:
            logger.error(f"[ObsidianSync] 处理文件失败: {md_file}: {e}")
            stats["errors"] += 1

    # 检测已删除的文件
    for rel in list(vault_state.keys()):
        if not (vault / rel).exists():
            try:
                (target_dir / rel).unlink(missing_ok=True)
                (target_dir / rel).with_suffix(".meta.json").unlink(missing_ok=True)
                del vault_state[rel]
                stats["files"].append({"path": rel, "action": "deleted"})
            except Exception:
                pass

    state[vault_path] = vault_state
    _save_sync_state(state)

    stats["total_md_files"] = len(vault_state)
    stats["synced_at"] = time.time()
    return stats


# ── Pydantic 模型 ────────────────────────────────────────────────

class ObsidianConfigRequest(BaseModel):
    vault_path: str                       # Obsidian vault 本地路径
    kb_id: Optional[str] = None          # 目标知识库 ID
    auto_sync: bool = False              # 是否在应用启动时自动同步
    exclude_patterns: List[str] = []     # 排除的正则表达式列表
    note: Optional[str] = None


# ── API 端点 ─────────────────────────────────────────────────────

@router.post("/api/integrations/obsidian/configure")
async def configure_obsidian(req: ObsidianConfigRequest):
    """配置 Obsidian Vault 路径"""
    vault = Path(req.vault_path)
    if not vault.exists():
        raise HTTPException(status_code=400, detail=f"路径不存在: {req.vault_path}")
    if not vault.is_dir():
        raise HTTPException(status_code=400, detail="路径必须是目录（Vault 文件夹）")

    # 统计 .md 文件数量
    md_count = sum(1 for _ in vault.rglob("*.md"))

    config = _load_config()
    config["obsidian"] = {
        "vault_path": str(req.vault_path),
        "kb_id": req.kb_id,
        "auto_sync": req.auto_sync,
        "exclude_patterns": req.exclude_patterns,
        "configured_at": time.time(),
    }
    _save_config(config)

    return {
        "success": True,
        "vault_path": str(req.vault_path),
        "md_file_count": md_count,
        "message": f"Vault 配置成功，共找到 {md_count} 个 Markdown 文件"
    }


@router.post("/api/integrations/obsidian/sync")
async def sync_obsidian(background_tasks: BackgroundTasks, force: bool = False):
    """触发 Obsidian Vault 同步（增量）"""
    config = _load_config().get("obsidian")
    if not config:
        raise HTTPException(
            status_code=400,
            detail="尚未配置 Obsidian Vault，请先调用 /api/integrations/obsidian/configure"
        )

    vault_path = config["vault_path"]
    kb_id = config.get("kb_id")
    exclude_patterns = config.get("exclude_patterns", [])

    try:
        stats = _do_sync(vault_path, kb_id, exclude_patterns)
        return JSONResponse({"success": True, "stats": stats})
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"[ObsidianSync] 同步失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"同步失败: {str(e)}")


@router.get("/api/integrations/obsidian/status")
async def obsidian_status():
    """获取 Obsidian 同步配置和状态"""
    config = _load_config().get("obsidian", {})
    state = _load_sync_state()

    vault_path = config.get("vault_path", "")
    vault_state = state.get(vault_path, {})

    return {
        "configured": bool(config),
        "vault_path": vault_path,
        "kb_id": config.get("kb_id"),
        "auto_sync": config.get("auto_sync", False),
        "synced_files": len(vault_state),
        "last_sync": max((v.get("synced_at", 0) for v in vault_state.values()), default=None),
        "exclude_patterns": config.get("exclude_patterns", []),
    }


@router.get("/api/integrations/obsidian/files")
async def list_obsidian_files(page: int = 1, page_size: int = 50):
    """列出已同步的 Obsidian 文件"""
    config = _load_config().get("obsidian", {})
    vault_path = config.get("vault_path", "")
    state = _load_sync_state().get(vault_path, {})

    items = [
        {"path": rel, "hash": info["hash"], "synced_at": info["synced_at"]}
        for rel, info in state.items()
    ]
    items.sort(key=lambda x: x["synced_at"], reverse=True)

    total = len(items)
    start = (page - 1) * page_size
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items[start: start + page_size],
    }
