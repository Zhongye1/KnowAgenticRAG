"""
多数据源接入模块 - 支持 OSS / S3 / 数据库数据源配置与导入
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
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

# - -
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


# - Pydantic -
class OSSConfig(BaseModel):
    endpoint: str
    bucket: str
    access_key_id: str
    access_key_secret: str
    region: Optional[str] = None
    prefix: Optional[str] = None

class S3Config(BaseModel):
    endpoint_url: Optional[str] = None    # MinIO
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
    query: str              # SQL
    text_column: str
    id_column: str = "id"

class CreateDatasourceRequest(BaseModel):
    name: str
    type: Literal["oss", "s3", "mysql", "postgresql", "sqlite", "webdav"]
    config: dict
    kb_id: Optional[str] = None


# - API -
@router.get("/api/datasources/list")
async def list_datasources():
    """获取所有数据源配置"""
    try:
        with _get_conn() as conn:
            rows = conn.execute("SELECT * FROM datasources ORDER BY created_at DESC").fetchall()
        result = []
        for row in rows:
            d = dict(row)
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
        # 3
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
async def sync_datasource(ds_id: int, background_tasks: BackgroundTasks):
    """触发数据源同步（OSS/S3 下载文件到知识库目录，数据库提取文本）"""
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

        ds = dict(row)
        ds_type = ds["type"]
        config = json.loads(ds.get("config", "{}"))
        kb_id = ds.get("kb_id")

        background_tasks.add_task(_do_datasource_sync, ds_id, ds_type, config, kb_id)

        return {
            "task_id": f"sync_{ds_id}_{int(time.time())}",
            "status": "syncing",
            "message": "同步任务已提交，后台执行中"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _do_datasource_sync(ds_id: int, ds_type: str, config: dict, kb_id: Optional[str]):
    """实际执行数据源同步的后台任务"""
    target_dir = Path(__file__).parent.parent / "local-KLB-files" / (kb_id or "_datasource_import") / ds_type
    target_dir.mkdir(parents=True, exist_ok=True)

    try:
        if ds_type == "oss":
            result = await _sync_oss(config, target_dir)
        elif ds_type == "s3":
            result = await _sync_s3(config, target_dir)
        elif ds_type in ("mysql", "postgresql", "sqlite"):
            result = await _sync_database(ds_type, config, target_dir)
        else:
            result = {"status": "skipped", "message": f"暂不支持同步类型: {ds_type}"}

        with _get_conn() as conn:
            conn.execute(
                "UPDATE datasources SET status = 'idle', last_sync = ?, last_error = NULL WHERE id = ?",
                (time.time(), ds_id)
            )
            conn.commit()
        logger.info(f"[DatasourceSync] id={ds_id} 同步完成: {result}")

    except Exception as e:
        logger.error(f"[DatasourceSync] id={ds_id} 同步失败: {e}", exc_info=True)
        with _get_conn() as conn:
            conn.execute(
                "UPDATE datasources SET status = 'error', last_error = ? WHERE id = ?",
                (str(e)[:500], ds_id)
            )
            conn.commit()


async def _sync_oss(config: dict, target_dir: Path) -> dict:
    """从阿里云 OSS 下载文件"""
    try:
        import oss2
        auth = oss2.Auth(config["access_key_id"], config["access_key_secret"])
        bucket = oss2.Bucket(auth, config["endpoint"], config["bucket"])
        prefix = config.get("prefix", "")
        downloaded = 0
        for obj in oss2.ObjectIterator(bucket, prefix=prefix):
            key = obj.key
            if key.endswith("/"):
                continue
            dest = target_dir / key.lstrip("/")
            dest.parent.mkdir(parents=True, exist_ok=True)
            bucket.get_object_to_file(key, str(dest))
            downloaded += 1
        return {"status": "ok", "downloaded": downloaded}
    except ImportError:
        return {"status": "warning", "message": "oss2 未安装: pip install oss2"}


async def _sync_s3(config: dict, target_dir: Path) -> dict:
    """从 S3/MinIO 下载文件"""
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
        bucket = config["bucket"]
        prefix = config.get("prefix", "")
        paginator = s3.get_paginator("list_objects_v2")
        downloaded = 0
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                dest = target_dir / key.lstrip("/")
                dest.parent.mkdir(parents=True, exist_ok=True)
                s3.download_file(bucket, key, str(dest))
                downloaded += 1
        return {"status": "ok", "downloaded": downloaded}
    except ImportError:
        return {"status": "warning", "message": "boto3 未安装: pip install boto3"}


async def _sync_database(db_type: str, config: dict, target_dir: Path) -> dict:
    """从数据库提取文本并写入 .txt 文件"""
    rows_written = 0
    query = config.get("query", "SELECT * FROM documents LIMIT 1000")
    text_column = config.get("text_column", "content")
    id_column = config.get("id_column", "id")

    try:
        if db_type == "sqlite":
            import sqlite3
            conn = sqlite3.connect(config["database"])
            cursor = conn.execute(query)
            rows = cursor.fetchall()
            columns = [d[0] for d in cursor.description]
            conn.close()
        elif db_type == "mysql":
            import pymysql
            conn = pymysql.connect(
                host=config.get("host", "localhost"), port=config.get("port", 3306),
                database=config["database"], user=config.get("username", "root"),
                password=config.get("password", ""), charset="utf8mb4",
            )
            cursor = conn.cursor()
            cursor.execute(query)
            columns = [d[0] for d in cursor.description]
            rows = cursor.fetchall()
            conn.close()
        elif db_type == "postgresql":
            import psycopg2
            conn = psycopg2.connect(
                host=config.get("host"), port=config.get("port", 5432),
                dbname=config["database"], user=config.get("username"),
                password=config.get("password"),
            )
            cursor = conn.cursor()
            cursor.execute(query)
            columns = [d[0] for d in cursor.description]
            rows = cursor.fetchall()
            conn.close()
        else:
            return {"status": "skipped"}

        # .txt
        text_idx = columns.index(text_column) if text_column in columns else 0
        id_idx = columns.index(id_column) if id_column in columns else None

        for i, row in enumerate(rows):
            row_id = row[id_idx] if id_idx is not None else i
            text = str(row[text_idx] or "").strip()
            if text:
                dest = target_dir / f"row_{row_id}.txt"
                dest.write_text(text, encoding="utf-8")
                rows_written += 1

        return {"status": "ok", "rows_written": rows_written}

    except ImportError as e:
        return {"status": "warning", "message": f"驱动库未安装: {e}"}


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
