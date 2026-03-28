"""
知识广场 API - 工业级实现
- 知识库分享：用户可将自己的知识库发布到广场
- 圈子系统：创建/加入/退出圈子，圈子内分享知识库
- 搜索：标题/标签/作者全文搜索
- 收藏/点赞/浏览量统计
- 无限滚动分页
- 存储：SQLite（与 audit_log 同级，轻量级）
"""

import sqlite3
import json
import time
import os
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/square", tags=["知识广场"])

# - -
DB_PATH = Path(__file__).parent / "square.db"

# - Initialize -
def ensure_tables():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS sq_shared_kb (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            kb_id       TEXT    NOT NULL,          -- 原始知识库 ID
            kb_name     TEXT    NOT NULL,
            description TEXT    DEFAULT '',
            tags        TEXT    DEFAULT '[]',      -- JSON 数组
            category    TEXT    DEFAULT 'tech',
            cover_color TEXT    DEFAULT '',
            author_id   TEXT    NOT NULL,
            author_name TEXT    NOT NULL,
            circle_id   INTEGER DEFAULT 0,         -- 0 = 不属于圈子
            view_count  INTEGER DEFAULT 0,
            star_count  INTEGER DEFAULT 0,
            fork_count  INTEGER DEFAULT 0,
            is_public   INTEGER DEFAULT 1,
            created_at  REAL    NOT NULL,
            updated_at  REAL    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sq_circles (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT    NOT NULL UNIQUE,
            description  TEXT    DEFAULT '',
            color        TEXT    DEFAULT '#6366f1',
            cover        TEXT    DEFAULT '',
            tags         TEXT    DEFAULT '[]',     -- JSON 数组，圈子标签
            join_type    TEXT    DEFAULT 'open',   -- open / invite
            member_count INTEGER DEFAULT 1,
            kb_count     INTEGER DEFAULT 0,
            creator_id   TEXT    NOT NULL,
            creator_name TEXT    NOT NULL,
            created_at   REAL    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sq_circle_members (
            circle_id  INTEGER NOT NULL,
            user_id    TEXT    NOT NULL,
            joined_at  REAL    NOT NULL,
            PRIMARY KEY (circle_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS sq_stars (
            kb_share_id INTEGER NOT NULL,
            user_id     TEXT    NOT NULL,
            created_at  REAL    NOT NULL,
            PRIMARY KEY (kb_share_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_sq_kb_cat    ON sq_shared_kb(category);
        CREATE INDEX IF NOT EXISTS idx_sq_kb_author ON sq_shared_kb(author_id);
        CREATE INDEX IF NOT EXISTS idx_sq_kb_circle ON sq_shared_kb(circle_id);
        CREATE INDEX IF NOT EXISTS idx_sq_kb_created ON sq_shared_kb(created_at DESC);
    """)
    conn.commit()
    conn.close()
    logger.info("知识广场数据表已初始化")

ensure_tables()


# ── Pydantic Models ───────────────────────────────────────────
class ShareKbRequest(BaseModel):
    kb_id: str
    kb_name: str
    description: str = ''
    tags: List[str] = []
    category: str = 'tech'
    cover_color: str = ''
    author_id: str
    author_name: str
    circle_id: int = 0

class CreateCircleRequest(BaseModel):
    name: str
    description: str = ''
    color: str = '#6366f1'
    cover: str = ''
    tags: List[str] = []
    join_type: str = 'open'
    creator_id: str
    creator_name: str

class JoinCircleRequest(BaseModel):
    user_id: str

class StarRequest(BaseModel):
    user_id: str


# - -
def _row_to_kb(row: tuple) -> dict:
    keys = ['id','kb_id','kb_name','description','tags','category','cover_color',
            'author_id','author_name','circle_id','view_count','star_count','fork_count',
            'is_public','created_at','updated_at']
    d = dict(zip(keys, row))
    d['tags'] = json.loads(d['tags'] or '[]')
    return d

def _row_to_circle(row: tuple) -> dict:
    keys = ['id','name','description','color','cover','tags','join_type',
            'member_count','kb_count','creator_id','creator_name','created_at']
    d = dict(zip(keys, row))
    d['tags'] = json.loads(d['tags'] or '[]')
    return d


# ═══════════════════════════════════════════════════════════════
# API
# ═══════════════════════════════════════════════════════════════

@router.get("/kbs")
def list_shared_kbs(
    category: str = Query('all'),
    sort: str    = Query('hot'),       # hot / new / star / update
    tag: str     = Query(''),
    keyword: str = Query(''),
    circle_id: int = Query(0),
    page: int    = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
):
    """获取广场知识库列表（支持分页、分类、排序、标签、搜索）"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    wheres = ["is_public = 1"]
    params: list = []

    if category != 'all':
        wheres.append("category = ?")
        params.append(category)

    if circle_id > 0:
        wheres.append("circle_id = ?")
        params.append(circle_id)

    if tag:
        wheres.append("tags LIKE ?")
        params.append(f'%"{tag}"%')

    if keyword:
        wheres.append("(kb_name LIKE ? OR description LIKE ? OR author_name LIKE ? OR tags LIKE ?)")
        kw = f'%{keyword}%'
        params.extend([kw, kw, kw, kw])

    where_sql = " AND ".join(wheres)

    order_map = {
        'hot':    'view_count DESC, star_count DESC',
        'new':    'created_at DESC',
        'star':   'star_count DESC',
        'update': 'updated_at DESC',
    }
    order_sql = order_map.get(sort, 'created_at DESC')

    count_sql = f"SELECT COUNT(*) FROM sq_shared_kb WHERE {where_sql}"
    total = c.execute(count_sql, params).fetchone()[0]

    offset = (page - 1) * page_size
    data_sql = f"""
        SELECT id,kb_id,kb_name,description,tags,category,cover_color,
               author_id,author_name,circle_id,view_count,star_count,fork_count,
               is_public,created_at,updated_at
        FROM sq_shared_kb WHERE {where_sql}
        ORDER BY {order_sql} LIMIT ? OFFSET ?
    """
    rows = c.execute(data_sql, params + [page_size, offset]).fetchall()
    conn.close()

    items = [_row_to_kb(r) for r in rows]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (page * page_size) < total,
    }


@router.post("/kbs")
def share_kb(body: ShareKbRequest):
    """将知识库分享到广场"""
    now = time.time()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    exists = c.execute(
        "SELECT id FROM sq_shared_kb WHERE kb_id=? AND author_id=?",
        (body.kb_id, body.author_id)
    ).fetchone()
    if exists:
        conn.close()
        raise HTTPException(400, "已分享过该知识库")

    c.execute("""
        INSERT INTO sq_shared_kb
        (kb_id,kb_name,description,tags,category,cover_color,author_id,author_name,
         circle_id,view_count,star_count,fork_count,is_public,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,0,0,0,1,?,?)
    """, (body.kb_id, body.kb_name, body.description,
          json.dumps(body.tags, ensure_ascii=False),
          body.category, body.cover_color,
          body.author_id, body.author_name, body.circle_id, now, now))
    share_id = c.lastrowid

    # kb_count
    if body.circle_id > 0:
        c.execute("UPDATE sq_circles SET kb_count = kb_count+1 WHERE id=?", (body.circle_id,))

    conn.commit()
    conn.close()
    return {"id": share_id, "message": "分享成功"}


@router.get("/kbs/{share_id}")
def get_shared_kb(share_id: int):
    """获取单个分享知识库详情，同时增加浏览量"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE sq_shared_kb SET view_count=view_count+1 WHERE id=?", (share_id,))
    row = c.execute("""
        SELECT id,kb_id,kb_name,description,tags,category,cover_color,
               author_id,author_name,circle_id,view_count,star_count,fork_count,
               is_public,created_at,updated_at
        FROM sq_shared_kb WHERE id=?
    """, (share_id,)).fetchone()
    conn.commit()
    conn.close()
    if not row:
        raise HTTPException(404, "知识库不存在")
    return _row_to_kb(row)


@router.delete("/kbs/{share_id}")
def unshare_kb(share_id: int, user_id: str = Query(...)):
    """取消分享（仅作者可操作）"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    row = c.execute("SELECT author_id,circle_id FROM sq_shared_kb WHERE id=?", (share_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "不存在")
    if row[0] != user_id:
        conn.close()
        raise HTTPException(403, "无权限")
    c.execute("DELETE FROM sq_shared_kb WHERE id=?", (share_id,))
    if row[1] > 0:
        c.execute("UPDATE sq_circles SET kb_count=MAX(0,kb_count-1) WHERE id=?", (row[1],))
    conn.commit()
    conn.close()
    return {"message": "已取消分享"}


@router.post("/kbs/{share_id}/star")
def toggle_star(share_id: int, body: StarRequest):
    """收藏/取消收藏"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    exists = c.execute(
        "SELECT 1 FROM sq_stars WHERE kb_share_id=? AND user_id=?",
        (share_id, body.user_id)
    ).fetchone()
    if exists:
        c.execute("DELETE FROM sq_stars WHERE kb_share_id=? AND user_id=?", (share_id, body.user_id))
        c.execute("UPDATE sq_shared_kb SET star_count=MAX(0,star_count-1) WHERE id=?", (share_id,))
        starred = False
    else:
        c.execute("INSERT INTO sq_stars VALUES(?,?,?)", (share_id, body.user_id, time.time()))
        c.execute("UPDATE sq_shared_kb SET star_count=star_count+1 WHERE id=?", (share_id,))
        starred = True
    conn.commit()
    conn.close()
    return {"starred": starred}


@router.get("/kbs/{share_id}/starred")
def check_star(share_id: int, user_id: str = Query(...)):
    conn = sqlite3.connect(DB_PATH)
    exists = conn.execute(
        "SELECT 1 FROM sq_stars WHERE kb_share_id=? AND user_id=?",
        (share_id, user_id)
    ).fetchone()
    conn.close()
    return {"starred": bool(exists)}


# ═══════════════════════════════════════════════════════════════
# API
# ═══════════════════════════════════════════════════════════════

@router.get("/circles")
def list_circles(
    keyword: str = Query(''),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """获取圈子列表（热门 + 支持搜索）"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    wheres, params = [], []
    if keyword:
        wheres.append("(name LIKE ? OR description LIKE ?)")
        kw = f'%{keyword}%'
        params.extend([kw, kw])
    where_sql = ("WHERE " + " AND ".join(wheres)) if wheres else ""
    total = c.execute(f"SELECT COUNT(*) FROM sq_circles {where_sql}", params).fetchone()[0]
    offset = (page - 1) * page_size
    rows = c.execute(f"""
        SELECT id,name,description,color,cover,tags,join_type,
               member_count,kb_count,creator_id,creator_name,created_at
        FROM sq_circles {where_sql}
        ORDER BY member_count DESC, created_at DESC
        LIMIT ? OFFSET ?
    """, params + [page_size, offset]).fetchall()
    conn.close()
    return {
        "items": [_row_to_circle(r) for r in rows],
        "total": total,
        "has_more": (page * page_size) < total,
    }


@router.post("/circles")
def create_circle(body: CreateCircleRequest):
    """创建新圈子"""
    now = time.time()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    exists = c.execute("SELECT id FROM sq_circles WHERE name=?", (body.name,)).fetchone()
    if exists:
        conn.close()
        raise HTTPException(400, "圈子名称已存在")
    c.execute("""
        INSERT INTO sq_circles
        (name,description,color,cover,tags,join_type,member_count,kb_count,creator_id,creator_name,created_at)
        VALUES (?,?,?,?,?,?,1,0,?,?,?)
    """, (body.name, body.description, body.color, body.cover,
          json.dumps(body.tags, ensure_ascii=False),
          body.join_type, body.creator_id, body.creator_name, now))
    circle_id = c.lastrowid
    c.execute("INSERT OR IGNORE INTO sq_circle_members VALUES(?,?,?)", (circle_id, body.creator_id, now))
    conn.commit()
    conn.close()
    return {"id": circle_id, "message": "圈子创建成功"}


@router.post("/circles/{circle_id}/join")
def join_circle(circle_id: int, body: JoinCircleRequest):
    """加入圈子"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    circle = c.execute("SELECT join_type FROM sq_circles WHERE id=?", (circle_id,)).fetchone()
    if not circle:
        conn.close()
        raise HTTPException(404, "圈子不存在")
    already = c.execute(
        "SELECT 1 FROM sq_circle_members WHERE circle_id=? AND user_id=?",
        (circle_id, body.user_id)
    ).fetchone()
    if already:
        conn.close()
        return {"message": "已在圈子中", "joined": True}
    c.execute("INSERT INTO sq_circle_members VALUES(?,?,?)", (circle_id, body.user_id, time.time()))
    c.execute("UPDATE sq_circles SET member_count=member_count+1 WHERE id=?", (circle_id,))
    conn.commit()
    conn.close()
    return {"message": "加入成功", "joined": True}


@router.delete("/circles/{circle_id}/join")
def leave_circle(circle_id: int, user_id: str = Query(...)):
    """退出圈子"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    deleted = c.execute(
        "DELETE FROM sq_circle_members WHERE circle_id=? AND user_id=?",
        (circle_id, user_id)
    ).rowcount
    if deleted:
        c.execute("UPDATE sq_circles SET member_count=MAX(1,member_count-1) WHERE id=?", (circle_id,))
    conn.commit()
    conn.close()
    return {"message": "已退出", "joined": False}


@router.get("/circles/{circle_id}/members")
def get_circle_members(circle_id: int, user_id: str = Query('')):
    """检查用户是否已加入某圈子"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    joined = False
    if user_id:
        joined = bool(c.execute(
            "SELECT 1 FROM sq_circle_members WHERE circle_id=? AND user_id=?",
            (circle_id, user_id)
        ).fetchone())
    count = c.execute("SELECT member_count FROM sq_circles WHERE id=?", (circle_id,)).fetchone()
    conn.close()
    return {"joined": joined, "member_count": count[0] if count else 0}


@router.get("/my-circles")
def my_circles(user_id: str = Query(...)):
    """获取用户已加入的圈子"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    rows = c.execute("""
        SELECT c.id,c.name,c.description,c.color,c.cover,c.tags,c.join_type,
               c.member_count,c.kb_count,c.creator_id,c.creator_name,c.created_at
        FROM sq_circles c
        JOIN sq_circle_members m ON c.id = m.circle_id
        WHERE m.user_id=?
        ORDER BY m.joined_at DESC
    """, (user_id,)).fetchall()
    conn.close()
    return [_row_to_circle(r) for r in rows]


# - -
@router.get("/my-kbs")
def my_kbs_for_share(user_id: str = Query(...)):
    """获取用户可分享的知识库列表（从广场已分享表查）"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    rows = c.execute("""
        SELECT id,kb_id,kb_name,description,tags,category,cover_color,
               author_id,author_name,circle_id,view_count,star_count,fork_count,
               is_public,created_at,updated_at
        FROM sq_shared_kb WHERE author_id=?
        ORDER BY created_at DESC
    """, (user_id,)).fetchall()
    conn.close()
    return [_row_to_kb(r) for r in rows]
