"""
Agent 执行失败重试 + 步骤回滚 + 任务暂停/续跑
+ 工具链市场/第三方插件体系
"""

import os
import json
import sqlite3
import time
from datetime import datetime
from typing import List, Optional, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/agent-advanced")
DB_PATH = os.path.join(os.path.dirname(__file__), "agent_tasks.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS agent_tasks (
            id          TEXT PRIMARY KEY,
            user_id     TEXT,
            title       TEXT,
            goal        TEXT,
            status      TEXT DEFAULT 'pending',  -- pending|running|paused|done|failed
            steps       TEXT DEFAULT '[]',
            current_step INTEGER DEFAULT 0,
            error_count  INTEGER DEFAULT 0,
            max_retries  INTEGER DEFAULT 3,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            updated_at  TEXT DEFAULT (datetime('now','localtime')),
            completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS plugin_registry (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT UNIQUE NOT NULL,
            version     TEXT DEFAULT '1.0.0',
            description TEXT,
            author      TEXT,
            category    TEXT,
            endpoint    TEXT,   -- 第三方工具的 HTTP 端点
            schema      TEXT,   -- JSON Schema 参数定义
            enabled     INTEGER DEFAULT 1,
            installed_at TEXT DEFAULT (datetime('now','localtime'))
        );
        -- 内置插件
        INSERT OR IGNORE INTO plugin_registry (name, version, description, author, category, enabled) VALUES
            ('data_analysis', '2.0', '数据分析（pandas统计）', 'builtin', '数据分析', 1),
            ('python_execute', '1.0', 'Python代码执行沙箱', 'builtin', '数据分析', 1),
            ('chart_generate', '1.0', '图表生成（matplotlib）', 'builtin', '数据分析', 1),
            ('send_email',     '1.0', '邮件发送', 'builtin', '办公自动化', 1),
            ('file_read',      '1.0', '文件读取', 'builtin', '文件操作', 1),
            ('file_write',     '1.0', '文件写入', 'builtin', '文件操作', 1),
            ('export_pdf',     '1.0', 'PDF导出', 'builtin', '文档生成', 1),
            ('get_datetime',   '1.0', '日期时间工具', 'builtin', '时间工具', 1),
            ('translate',      '1.0', '文本翻译', 'builtin', '语言工具', 1),
            ('summarize',      '1.0', '文本摘要', 'builtin', '文本处理', 1),
            ('extract_keywords','1.0','关键词提取', 'builtin', '文本处理', 1),
            ('web_search',     '1.0', '联网搜索（DuckDuckGo）', 'builtin', '搜索', 1),
            ('kb_search',      '1.0', '知识库语义搜索', 'builtin', '知识管理', 1);
    """)
    conn.commit()
    conn.close()


init_db()


# - //Retry/-
class TaskStep:
    def __init__(
        self, step_id: int, tool_name: str, params: Dict, description: str = ""
    ):
        self.step_id = step_id
        self.tool_name = tool_name
        self.params = params
        self.description = description
        self.status = "pending"
        self.result = None
        self.error = None
        self.retry_count = 0
        self.started_at = None
        self.completed_at = None

    def to_dict(self):
        return {
            "step_id": self.step_id,
            "tool_name": self.tool_name,
            "params": self.params,
            "description": self.description,
            "status": self.status,
            "result": self.result,
            "error": self.error,
            "retry_count": self.retry_count,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }


class TaskExecutor:
    def __init__(self, task_id: str, max_retries: int = 3):
        self.task_id = task_id
        self.max_retries = max_retries

    def _get_task(self):
        conn = get_db()
        row = conn.execute(
            "SELECT * FROM agent_tasks WHERE id=?", (self.task_id,)
        ).fetchone()
        conn.close()
        return dict(row) if row else None

    def _save_steps(
        self,
        steps: List[Dict],
        current_step: int,
        status: str,
        error_count: int = 0,
        completed_at: str = None,
    ):
        conn = get_db()
        conn.execute(
            """
            UPDATE agent_tasks SET steps=?, current_step=?, status=?,
            error_count=?, updated_at=datetime('now','localtime')
            {}
            WHERE id=?
        """.format(", completed_at=?" if completed_at else ""),
            (
                [
                    json.dumps(steps, ensure_ascii=False),
                    current_step,
                    status,
                    error_count,
                ]
                + ([completed_at] if completed_at else [])
                + [self.task_id]
            ),
        )
        conn.commit()
        conn.close()

    def execute_step(self, step: Dict) -> Dict:
        """执行单步，内置重试"""
        from agent_tools.enterprise_tools import get_tool
        from agent_tools.web_search_tool import run_web_search

        tool_name = step["tool_name"]
        params = step.get("params", {})
        step["status"] = "running"
        step["started_at"] = datetime.now().isoformat()

        for attempt in range(self.max_retries):
            try:
                if tool_name == "web_search":
                    result = run_web_search(params.get("query", ""))
                else:
                    tool = get_tool(tool_name)
                    if tool:
                        result = tool.run(**params)
                    else:
                        result = f"[工具 {tool_name} 未找到]"
                step["status"] = "done"
                step["result"] = str(result)[:2000]
                step["completed_at"] = datetime.now().isoformat()
                return step
            except Exception as e:
                step["retry_count"] = attempt + 1
                step["error"] = str(e)
                if attempt < self.max_retries - 1:
                    time.sleep(1.5**attempt)
                else:
                    step["status"] = "failed"
                    step["completed_at"] = datetime.now().isoformat()
        return step

    def rollback_step(self, step: Dict) -> Dict:
        """标记步骤为已回滚"""
        step["status"] = "rolled_back"
        step["result"] = None
        return step

    def run(self, resume: bool = False):
        """执行或续跑任务"""
        task = self._get_task()
        if not task:
            return {"error": "任务不存在"}

        steps = json.loads(task.get("steps", "[]"))
        start_from = task.get("current_step", 0) if resume else 0
        error_count = 0

        for i, step in enumerate(steps):
            if i < start_from:
                continue

            task = self._get_task()
            if task["status"] == "paused":
                self._save_steps(steps, i, "paused", error_count)
                return {"status": "paused", "paused_at_step": i}

            step = self.execute_step(step)
            steps[i] = step

            if step["status"] == "failed":
                error_count += 1
                self._save_steps(steps, i, "running", error_count)
                # 3
                if error_count >= 3:
                    self._save_steps(
                        steps, i, "failed", error_count, datetime.now().isoformat()
                    )
                    return {"status": "failed", "failed_at_step": i}
            else:
                self._save_steps(steps, i + 1, "running", error_count)

        self._save_steps(
            steps, len(steps), "done", error_count, datetime.now().isoformat()
        )
        return {"status": "done", "steps": steps}


# ── API ─────────────────────────────────────────────────────
class TaskCreate(BaseModel):
    user_id: str
    title: str
    goal: str
    steps: List[Dict]  # [{tool_name, params, description}]
    max_retries: Optional[int] = 3


@router.post("/tasks/create")
def create_task(req: TaskCreate):
    import uuid

    task_id = str(uuid.uuid4())
    steps = [
        {
            "step_id": i,
            **s,
            "status": "pending",
            "result": None,
            "error": None,
            "retry_count": 0,
        }
        for i, s in enumerate(req.steps)
    ]
    conn = get_db()
    conn.execute(
        """
        INSERT INTO agent_tasks (id, user_id, title, goal, steps, max_retries)
        VALUES (?,?,?,?,?,?)
    """,
        (
            task_id,
            req.user_id,
            req.title,
            req.goal,
            json.dumps(steps, ensure_ascii=False),
            req.max_retries,
        ),
    )
    conn.commit()
    conn.close()
    return {"task_id": task_id}


@router.post("/tasks/{task_id}/run")
def run_task(task_id: str, resume: bool = False):
    executor = TaskExecutor(task_id)
    return executor.run(resume=resume)


@router.post("/tasks/{task_id}/pause")
def pause_task(task_id: str):
    conn = get_db()
    conn.execute("UPDATE agent_tasks SET status='paused' WHERE id=?", (task_id,))
    conn.commit()
    conn.close()
    return {"status": "paused"}


@router.post("/tasks/{task_id}/resume")
def resume_task(task_id: str):
    conn = get_db()
    conn.execute("UPDATE agent_tasks SET status='running' WHERE id=?", (task_id,))
    conn.commit()
    conn.close()
    executor = TaskExecutor(task_id)
    return executor.run(resume=True)


@router.post("/tasks/{task_id}/rollback/{step_id}")
def rollback_step(task_id: str, step_id: int):
    conn = get_db()
    task = conn.execute(
        "SELECT steps FROM agent_tasks WHERE id=?", (task_id,)
    ).fetchone()
    if not task:
        conn.close()
        raise HTTPException(404, "任务不存在")
    steps = json.loads(task["steps"])
    if step_id < len(steps):
        steps[step_id]["status"] = "rolled_back"
        steps[step_id]["result"] = None
        conn.execute(
            "UPDATE agent_tasks SET steps=?, current_step=? WHERE id=?",
            (json.dumps(steps, ensure_ascii=False), step_id, task_id),
        )
        conn.commit()
    conn.close()
    return {"status": "rolled_back", "step_id": step_id}


@router.get("/tasks/{task_id}")
def get_task(task_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM agent_tasks WHERE id=?", (task_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "任务不存在")
    d = dict(row)
    d["steps"] = json.loads(d.get("steps", "[]"))
    return d


@router.get("/tasks/user/{user_id}")
def list_user_tasks(user_id: str):
    conn = get_db()
    rows = conn.execute(
        """
        SELECT id, title, goal, status, current_step, created_at, updated_at
        FROM agent_tasks WHERE user_id=? ORDER BY updated_at DESC LIMIT 50
    """,
        (user_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# - -
@router.get("/plugins")
def list_plugins(category: Optional[str] = None):
    conn = get_db()
    q = "SELECT * FROM plugin_registry"
    params = ()
    if category:
        q += " WHERE category=?"
        params = (category,)
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


class PluginRegister(BaseModel):
    name: str
    version: str = "1.0.0"
    description: str
    author: str
    category: str
    endpoint: Optional[str] = None
    schema: Optional[Dict] = None


@router.post("/plugins/register")
def register_plugin(req: PluginRegister):
    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO plugin_registry (name, version, description, author, category, endpoint, schema)
            VALUES (?,?,?,?,?,?,?)
        """,
            (
                req.name,
                req.version,
                req.description,
                req.author,
                req.category,
                req.endpoint,
                json.dumps(req.schema or {}, ensure_ascii=False),
            ),
        )
        conn.commit()
        plugin_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.close()
        return {"status": "registered", "id": plugin_id}
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(400, "插件名称已存在")


@router.patch("/plugins/{plugin_id}/toggle")
def toggle_plugin(plugin_id: int, enabled: bool = True):
    conn = get_db()
    conn.execute(
        "UPDATE plugin_registry SET enabled=? WHERE id=?",
        (1 if enabled else 0, plugin_id),
    )
    conn.commit()
    conn.close()
    return {"status": "updated", "enabled": enabled}
