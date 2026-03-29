"""
db_config.py — Unified database configuration and connection management.

Provides:
  - get_db_connection()  : returns a raw pymysql connection (callers manage lifecycle)
  - db_cursor()          : context manager — the RECOMMENDED way to use the DB.
                           Handles connect, commit/rollback, and close automatically.
                           On connection failure, raises HTTP 503 instead of crashing.

Usage (in any route or function):
    from RAGF_User_Management.db_config import db_cursor

    with db_cursor() as cur:
        cur.execute("SELECT id FROM user WHERE email = %s", (email,))
        row = cur.fetchone()
"""

import os
import logging
from contextlib import contextmanager

import pymysql
from fastapi import HTTPException
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── Build config from environment ────────────────────────────────────────────
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "rag_user_db"),
    "charset": os.getenv("DB_CHARSET", "utf8mb4"),
    "connect_timeout": 10,
    "autocommit": False,
}


def get_db_connection() -> pymysql.connections.Connection:
    """
    Return a new pymysql connection.
    Caller is responsible for closing it in a finally block.
    Prefer using db_cursor() instead.
    """
    try:
        return pymysql.connect(**DB_CONFIG)
    except pymysql.OperationalError as e:
        logger.error(f"Database connection failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=(
                "Cannot connect to the database. "
                "Make sure MySQL is running and the .env file has the correct DB_PASSWORD."
            ),
        )


@contextmanager
def db_cursor():
    """
    Context manager for safe database access.

    - Connects to the database (raises HTTP 503 on failure instead of crashing).
    - Yields a cursor for use inside the `with` block.
    - Commits on success, rolls back on any exception, and always closes the connection.

    Example:
        with db_cursor() as cur:
            cur.execute("SELECT id FROM user WHERE email = %s", (email,))
            row = cur.fetchone()

    Re-raises HTTPException as-is so FastAPI can return the correct status code.
    Any other exception is logged and re-raised (FastAPI's global handler returns 500).
    """
    conn = None
    cur = None
    try:
        conn = get_db_connection()  # raises HTTP 503 if MySQL is unreachable
        cur = conn.cursor()
        yield cur
        conn.commit()
    except HTTPException:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        raise
    except Exception as exc:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        logger.error(f"Database error: {exc}")
        raise
    finally:
        if cur:
            try:
                cur.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass
