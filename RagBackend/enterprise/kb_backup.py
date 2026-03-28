"""
kb_backup.py
知识库定时备份模块

功能：
  - 按需备份指定知识库（Markdown 导出 + ZIP 打包）
  - 自动备份历史列表（SQLite 记录）
  - 定时备份（通过 BackgroundTasks + schedule）
  - 下载接口：直接下载 ZIP 包

API:
  POST /api/backup/create    -- 创建备份
  GET  /api/backup/list      -- 备份历史列表
  GET  /api/backup/{bak_id}  -- 下载备份 ZIP
  DELETE /api/backup/{bak_id} -- 删除备份
"""

from __future__ import annotations

import io
import json
import logging
import os
import sqlite3
import time
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/backup", tags=["知识库备份"])

# - -
_BACKEND_ROOT = Path(__file__).parent.parent
_KB_ROOT      = _BACKEND_ROOT / "local-KLB-files"
_BACKUP_DIR   = _BACKEND_ROOT / "backups"
_BACKUP_DB    = _BACKEND_ROOT / "backups" / "backup_index.db"

_BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def _init_backup_db():
    with sqlite3.connect(_BACKUP_DB) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS backups (
                id         TEXT PRIMARY KEY,
                kb_id      TEXT,
                kb_name    TEXT,
                created_at TEXT,
                file_path  TEXT,
                size_bytes INTEGER DEFAULT 0,
                file_count INTEGER DEFAULT 0,
                status     TEXT DEFAULT 'ok'
            )
        """)


_init_backup_db()


# - -
def _create_backup(bak_id: str, kb_id: Optional[str]):
    """
    创建备份：
    1. 扫描 local-KLB-files/<kb_id> 目录
    2. 打包为 ZIP（含原文件 + metadata.json）
    3. 写入备份数据库
    """
    try:
        if kb_id:
            target_dirs = [_KB_ROOT / kb_id]
        else:
            target_dirs = [d for d in _KB_ROOT.iterdir() if d.is_dir()] if _KB_ROOT.exists() else []

        buf = io.BytesIO()
        file_count = 0
        metadata = {"backup_id": bak_id, "created_at": datetime.now().isoformat(), "files": []}

        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for kb_dir in target_dirs:
                if not kb_dir.exists():
                    continue
                for fpath in kb_dir.rglob("*"):
                    if fpath.is_file():
                        arcname = str(fpath.relative_to(_KB_ROOT))
                        zf.write(fpath, arcname)
                        metadata["files"].append({
                            "path": arcname,
                            "size": fpath.stat().st_size,
                        })
                        file_count += 1
            zf.writestr("_backup_metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2))

        buf.seek(0)
        zip_path = _BACKUP_DIR / f"{bak_id}.zip"
        zip_path.write_bytes(buf.read())
        size_bytes = zip_path.stat().st_size

        with sqlite3.connect(_BACKUP_DB) as conn:
            conn.execute(
                """UPDATE backups SET file_path=?, size_bytes=?, file_count=?, status='ok'
                   WHERE id=?""",
                (str(zip_path), size_bytes, file_count, bak_id)
            )
        logger.info(f"[Backup] 备份完成: {bak_id}, {file_count}个文件, {size_bytes/1024:.1f}KB")
    except Exception as e:
        logger.error(f"[Backup] 备份失败 {bak_id}: {e}")
        with sqlite3.connect(_BACKUP_DB) as conn:
            conn.execute("UPDATE backups SET status='error' WHERE id=?", (bak_id,))


# - Request model -
class BackupRequest(BaseModel):
    kb_id: Optional[str] = None   # None =
    kb_name: str = "全量"


# - -
@router.post("/create")
async def create_backup(req: BackupRequest, bg: BackgroundTasks):
    """创建知识库备份（异步执行，立即返回 backup_id）"""
    bak_id = str(uuid.uuid4())[:8]
    with sqlite3.connect(_BACKUP_DB) as conn:
        conn.execute(
            "INSERT INTO backups (id, kb_id, kb_name, created_at) VALUES (?,?,?,?)",
            (bak_id, req.kb_id or "all", req.kb_name, datetime.now().isoformat())
        )
    bg.add_task(_create_backup, bak_id, req.kb_id)
    return {"backup_id": bak_id, "status": "running", "message": "备份任务已启动"}


@router.get("/list")
async def list_backups(limit: int = 20):
    """获取备份历史列表"""
    with sqlite3.connect(_BACKUP_DB) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM backups ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    backups = []
    for r in rows:
        d = dict(r)
        d["size_kb"] = round(d.get("size_bytes", 0) / 1024, 1)
        backups.append(d)
    return {"backups": backups, "total": len(backups)}


@router.get("/{bak_id}")
async def download_backup(bak_id: str):
    """下载备份 ZIP 包"""
    with sqlite3.connect(_BACKUP_DB) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM backups WHERE id=?", (bak_id,)).fetchone()
    if not row or not row["file_path"]:
        raise HTTPException(404, "备份不存在或正在处理中")
    if row["status"] != "ok":
        raise HTTPException(400, f"备份状态: {row['status']}")
    zip_path = Path(row["file_path"])
    if not zip_path.exists():
        raise HTTPException(404, "备份文件已被删除")

    def iter_file():
        with open(zip_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    fname = f"ragf_backup_{row['kb_name']}_{bak_id}.zip"
    return StreamingResponse(
        iter_file(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.delete("/{bak_id}")
async def delete_backup(bak_id: str):
    """删除备份记录（同时删除 ZIP 文件）"""
    with sqlite3.connect(_BACKUP_DB) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT file_path FROM backups WHERE id=?", (bak_id,)).fetchone()
        if not row:
            raise HTTPException(404, "备份不存在")
        if row["file_path"]:
            try:
                Path(row["file_path"]).unlink(missing_ok=True)
            except Exception:
                pass
        conn.execute("DELETE FROM backups WHERE id=?", (bak_id,))
    return {"message": "备份已删除", "id": bak_id}
