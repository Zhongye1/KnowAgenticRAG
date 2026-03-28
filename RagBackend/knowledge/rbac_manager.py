"""
角色级/部门级细粒度权限管控模块
扩展原有三级权限（个人/共享/广场）→ 角色+部门+资源粒度
"""
import os
import sqlite3
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

router = APIRouter(prefix="/api/rbac")
DB_PATH = os.path.join(os.path.dirname(__file__), "rbac.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS departments (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            parent_id INTEGER DEFAULT NULL
        );
        CREATE TABLE IF NOT EXISTS roles (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT UNIQUE NOT NULL,
            description TEXT,
            permissions TEXT DEFAULT '[]'  -- JSON array of permission strings
        );
        CREATE TABLE IF NOT EXISTS user_roles (
            user_id     TEXT NOT NULL,
            role_id     INTEGER NOT NULL,
            dept_id     INTEGER,
            granted_by  TEXT,
            granted_at  TEXT DEFAULT (datetime('now','localtime')),
            PRIMARY KEY(user_id, role_id)
        );
        CREATE TABLE IF NOT EXISTS kb_permissions (
            kb_id       TEXT NOT NULL,
            subject_type TEXT NOT NULL,  -- 'user'|'role'|'dept'
            subject_id  TEXT NOT NULL,
            permission  TEXT NOT NULL,   -- 'read'|'write'|'admin'|'comment'|'share'
            granted_by  TEXT,
            granted_at  TEXT DEFAULT (datetime('now','localtime')),
            PRIMARY KEY(kb_id, subject_type, subject_id, permission)
        );
        -- 预置角色
        INSERT OR IGNORE INTO roles (name, description, permissions) VALUES
            ('super_admin', '超级管理员', '["*"]'),
            ('admin',       '管理员',     '["kb:*","user:read","audit:read"]'),
            ('editor',      '编辑者',     '["kb:write","kb:read","kb:comment"]'),
            ('viewer',      '查看者',     '["kb:read","kb:comment"]'),
            ('guest',       '访客',       '["kb:read"]');
    """)
    conn.commit()
    conn.close()


init_db()

PERMISSION_HIERARCHY = {
    "admin": ["read", "write", "comment", "share", "admin"],
    "write": ["read", "write", "comment"],
    "read":  ["read"],
    "comment": ["read", "comment"],
    "share": ["read", "share"],
}


# - -
class DeptCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None


@router.post("/dept/create")
def create_dept(req: DeptCreate):
    conn = get_db()
    conn.execute("INSERT INTO departments (name, parent_id) VALUES (?,?)",
                 (req.name, req.parent_id))
    conn.commit()
    conn.close()
    return {"status": "created", "name": req.name}


@router.get("/dept/list")
def list_depts():
    conn = get_db()
    rows = conn.execute("SELECT * FROM departments ORDER BY parent_id, name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


# - -
@router.get("/roles")
def list_roles():
    conn = get_db()
    rows = conn.execute("SELECT * FROM roles").fetchall()
    conn.close()
    return [dict(r) for r in rows]


class RoleAssign(BaseModel):
    user_id: str
    role_id: int
    dept_id: Optional[int] = None
    granted_by: Optional[str] = "system"


@router.post("/roles/assign")
def assign_role(req: RoleAssign):
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO user_roles (user_id, role_id, dept_id, granted_by)
        VALUES (?,?,?,?)
    """, (req.user_id, req.role_id, req.dept_id, req.granted_by))
    conn.commit()
    conn.close()
    return {"status": "assigned"}


@router.get("/users/{user_id}/roles")
def get_user_roles(user_id: str):
    conn = get_db()
    rows = conn.execute("""
        SELECT r.*, ur.dept_id, ur.granted_at
        FROM roles r JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = ?
    """, (user_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# - -
class KbPermGrant(BaseModel):
    kb_id: str
    subject_type: str   # user | role | dept
    subject_id: str
    permission: str     # read | write | admin | comment | share
    granted_by: Optional[str] = "system"


@router.post("/kb/grant")
def grant_kb_permission(req: KbPermGrant):
    conn = get_db()
    perms = PERMISSION_HIERARCHY.get(req.permission, [req.permission])
    for perm in perms:
        conn.execute("""
            INSERT OR REPLACE INTO kb_permissions
            (kb_id, subject_type, subject_id, permission, granted_by)
            VALUES (?,?,?,?,?)
        """, (req.kb_id, req.subject_type, req.subject_id, perm, req.granted_by))
    conn.commit()
    conn.close()
    return {"status": "granted", "permissions": perms}


@router.delete("/kb/{kb_id}/revoke")
def revoke_kb_permission(kb_id: str, subject_type: str, subject_id: str):
    conn = get_db()
    conn.execute("""
        DELETE FROM kb_permissions
        WHERE kb_id=? AND subject_type=? AND subject_id=?
    """, (kb_id, subject_type, subject_id))
    conn.commit()
    conn.close()
    return {"status": "revoked"}


@router.get("/kb/{kb_id}/permissions")
def list_kb_permissions(kb_id: str):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM kb_permissions WHERE kb_id=?", (kb_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def check_permission(user_id: str, kb_id: str, required_perm: str) -> bool:
    """检查用户对知识库是否有指定权限（供其他模块调用）"""
    conn = get_db()
    row = conn.execute("""
        SELECT 1 FROM kb_permissions
        WHERE kb_id=? AND subject_type='user' AND subject_id=? AND permission=?
    """, (kb_id, user_id, required_perm)).fetchone()
    if row:
        conn.close()
        return True
    row = conn.execute("""
        SELECT 1 FROM kb_permissions kp
        JOIN user_roles ur ON kp.subject_type='role' AND kp.subject_id=CAST(ur.role_id AS TEXT)
        WHERE kp.kb_id=? AND ur.user_id=? AND kp.permission=?
    """, (kb_id, user_id, required_perm)).fetchone()
    conn.close()
    return row is not None


@router.get("/check")
def check_perm_api(user_id: str, kb_id: str, permission: str):
    result = check_permission(user_id, kb_id, permission)
    return {"allowed": result}
