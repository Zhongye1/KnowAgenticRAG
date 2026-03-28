"""
db_config.py — 公共数据库配置模块
将原来散落在 4 个文件里的 DB_CONFIG / get_db_connection() 提取到此处统一管理。

修复的问题：
  1. DB_NAME 默认值从 'mysql' 改为 'rag_user_db'，避免未配置 .env 时连错数据库
  2. 所有模块统一从本文件 import，消除重复配置
"""

import os
import logging
import pymysql
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DB_CONFIG = {
    "host":    os.getenv("DB_HOST",    "127.0.0.1"),
    "port":    int(os.getenv("DB_PORT", 3306)),
    "user":    os.getenv("DB_USER",    "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    # rag_user_db mysql
    "database": os.getenv("DB_NAME", "rag_user_db"),
    "charset": os.getenv("DB_CHARSET", "utf8mb4"),
    "connect_timeout": 10,
}


def get_db_connection() -> pymysql.connections.Connection:
    """
    获取数据库连接（每次返回新连接）。
    调用方负责在 finally 块中关闭连接。
    """
    return pymysql.connect(**DB_CONFIG)
