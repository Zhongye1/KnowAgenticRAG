"""
多数据源接入模块 - 支持 OSS / S3 / 数据库数据源配置与导入
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, Literal
import sqlite3
import time
import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)
router = APIRouter()

# ── 数据库 ─────────────────────────────────────────────────────
DS_DB_PATH = Path(__file__).parent.parent / "metadata" / "datasources.db"

def _get_conn():
    conn = sqlite3.connect(str(DS_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def ensure_datasource_table():
    try:
        with _get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS datasources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    config TEXT NOT NULL,
                    kb_id TEXT,
                    status TEXT DEFAULT 'idle',
                    last_sync REAL,
                    created_at REAL NOT NULL,
                    is_active INTEGER DEFAULT 1,
                    sync_count INTEGER DEFAULT 0,
                    last_error TEXT
                )
            """)
            conn.commit()
        logger.info("数据源表初始化完成")
    except Exception as e:
        logger.warning(f"数据源表初始化失败: {e}")


# ── Pydantic 模型 ──────────────────────────────────────────────
class OSSConfig(BaseModel):
    endpoint: str
    bucket: str
    access_key_id: str
    access_key_secret: str
    region: Optional[str] = None
    prefix: Optional[str] = None      # 只同步指定前缀下的文件

class S3Config(BaseModel):
    endpoint_url: Optional[str] = None    # 自定义端点（MinIO 等）
    bucket: str
    aws_access_key_id: str
    aws_secret_access_key: str
    region_name: str = "us-east-1"
    prefix: Optional[str] = None

class DatabaseConfig(BaseModel):
    db_type: Literal["mysql", "postgresql", "sqlite"]
    host: Optional[str] = None
    port: Optional[int] = None
    database: str
    username: Optional[str] = None
    password: Optional[str] = None
    query: str              # 用于提取文本数据的 SQL 查询
    text_column: str        # 文本内容列名
    id_column: str = "id"

class CreateDatasourceRequest(BaseModel):
    name: str
    type: Literal["oss", "s3", "mysql", "postgresql", "sqlite", "webdav"]
    config: dict
    kb_id: Optional[str] = None


# ── API 端点 ───────────────────────────────────────────────────
@router.get("/api/datasources/list")
async def list_datasources():
    """获取所有数据源配置"""
    try:
        with _get_conn() as conn:
            rows = conn.execute("SELECT * FROM datasources ORDER BY created_at DESC").fetchall()
        result = []
        for row in rows:
            d = dict(row)
            # 脱敏：隐藏密钥
            try:
                cfg = json.loads(d.get("config", "{}"))
                for sensitive_key in ["access_key_secret", "aws_secret_access_key", "password"]:
                    if sensitive_key in cfg:
                        cfg[sensitive_key] = "****"
                d["config"] = cfg
            except Exception:
                pass
            result.append(d)
        return {"datasources": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/datasources/create")
async def create_datasource(req: CreateDatasourceRequest):
    """创建新数据源配置"""
    try:
        config_str = json.dumps(req.config)
        with _get_conn() as conn:
            cursor = conn.execute("""
                INSERT INTO datasources (name, type, config, kb_id, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (req.name, req.type, config_str, req.kb_id, time.time()))
            conn.commit()
            ds_id = cursor.lastrowid
        return {"id": ds_id, "name": req.name, "type": req.type, "message": "数据源创建成功"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/datasources/{ds_id}")
async def delete_datasource(ds_id: int):
    """删除数据源配置"""
    try:
        with _get_conn() as conn:
            conn.execute("DELETE FROM datasources WHERE id = ?", (ds_id,))
            conn.commit()
        return {"message": "数据源已删除", "id": ds_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/datasources/{ds_id}/test")
async def test_datasource(ds_id: int):
    """测试数据源连通性"""
    try:
        with _get_conn() as conn:
            row = conn.execute("SELECT * FROM datasources WHERE id = ?", (ds_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="数据源不存在")
        
        ds = dict(row)
        ds_type = ds["type"]
        config = json.loads(ds.get("config", "{}"))
        
        # 根据类型测试连通性
        if ds_type == "oss":
            return await _test_oss_connection(config)
        elif ds_type == "s3":
            return await _test_s3_connection(config)
        elif ds_type in ("mysql", "postgresql"):
            return await _test_db_connection(ds_type, config)
        elif ds_type == "sqlite":
            db_path = config.get("database", "")
            if os.path.exists(db_path):
                return {"status": "ok", "message": f"SQLite 文件存在: {db_path}"}
            return {"status": "error", "message": f"SQLite 文件不存在: {db_path}"}
        else:
            return {"status": "unknown", "message": f"暂不支持测试 {ds_type} 类型"}
    except HTTPException:
        raise
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def _test_oss_connection(config: dict) -> dict:
    """测试阿里云 OSS 连通性"""
    try:
        import oss2
        auth = oss2.Auth(config["access_key_id"], config["access_key_secret"])
        bucket = oss2.Bucket(auth, config["endpoint"], config["bucket"])
        # 列出前3个对象即可验证连通性
        objects = list(oss2.ObjectIterator(bucket, max_keys=3))
        return {"status": "ok", "message": f"OSS 连通成功，共可访问对象若干", "sample_count": len(objects)}
    except ImportError:
        return {"status": "warning", "message": "oss2 库未安装，请运行: pip install oss2"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def _test_s3_connection(config: dict) -> dict:
    """测试 AWS S3 / MinIO 连通性"""
    try:
        import boto3
        kwargs = {
            "aws_access_key_id": config["aws_access_key_id"],
            "aws_secret_access_key": config["aws_secret_access_key"],
            "region_name": config.get("region_name", "us-east-1"),
        }
        if config.get("endpoint_url"):
            kwargs["endpoint_url"] = config["endpoint_url"]
        s3 = boto3.client("s3", **kwargs)
        s3.head_bucket(Bucket=config["bucket"])
        return {"status": "ok", "message": f"S3 Bucket '{config['bucket']}' 连通成功"}
    except ImportError:
        return {"status": "warning", "message": "boto3 库未安装，请运行: pip install boto3"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def _test_db_connection(db_type: str, config: dict) -> dict:
    """测试数据库连通性"""
    try:
        if db_type == "mysql":
            import pymysql
            conn = pymysql.connect(
                host=config.get("host", "localhost"),
                port=config.get("port", 3306),
                database=config["database"],
                user=config.get("username", "root"),
                password=config.get("password", ""),
                connect_timeout=5,
            )
            conn.close()
            return {"status": "ok", "message": "MySQL 连通成功"}
        elif db_type == "postgresql":
            import psycopg2
            conn = psycopg2.connect(
                host=config.get("host", "localhost"),
                port=config.get("port", 5432),
                dbname=config["database"],
                user=config.get("username"),
                password=config.get("password"),
                connect_timeout=5,
            )
            conn.close()
            return {"status": "ok", "message": "PostgreSQL 连通成功"}
    except ImportError as e:
        return {"status": "warning", "message": f"驱动库未安装: {e}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/api/datasources/{ds_id}/sync")
async def sync_datasource(ds_id: int):
    """触发数据源同步（异步任务占位，返回任务 ID）"""
    try:
        with _get_conn() as conn:
            row = conn.execute("SELECT * FROM datasources WHERE id = ?", (ds_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="数据源不存在")
            conn.execute(
                "UPDATE datasources SET status = 'syncing', sync_count = sync_count + 1 WHERE id = ?",
                (ds_id,)
            )
            conn.commit()
        # TODO: 接入 Celery 或 asyncio 后台任务
        return {
            "task_id": f"sync_{ds_id}_{int(time.time())}",
            "status": "pending",
            "message": "同步任务已提交，后台执行中（当前为占位实现，需接入任务队列）"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/datasources/types")
async def datasource_types():
    """获取支持的数据源类型说明"""
    return {
        "types": [
            {"id": "oss", "name": "阿里云 OSS", "description": "对象存储，需要 oss2 库", "status": "supported"},
            {"id": "s3", "name": "AWS S3 / MinIO", "description": "兼容 S3 协议的对象存储", "status": "supported"},
            {"id": "mysql", "name": "MySQL 数据库", "description": "从 MySQL 表中提取文本内容", "status": "supported"},
            {"id": "postgresql", "name": "PostgreSQL", "description": "从 PostgreSQL 表中提取文本", "status": "supported"},
            {"id": "sqlite", "name": "SQLite 文件", "description": "本地 SQLite 数据库文件", "status": "supported"},
            {"id": "webdav", "name": "WebDAV", "description": "WebDAV 协议文件服务（坚果云等）", "status": "planned"},
        ]
    }
