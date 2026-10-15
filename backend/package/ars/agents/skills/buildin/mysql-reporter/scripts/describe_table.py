# /// script
# dependencies = [
#   "pymysql>=1.1.0",
# ]
# ///

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from typing import Any

import pymysql
from pymysql import MySQLError
from pymysql.cursors import DictCursor


class MySQLConnectionError(Exception):
    """MySQL 连接异常"""


class MySQLSecurityChecker:
    """MySQL 安全检查器"""

    @classmethod
    def validate_table_name(cls, table_name: str) -> bool:
        """验证表名的安全性"""
        if not table_name:
            return False

        return bool(re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", table_name))


def load_mysql_config() -> dict[str, Any]:
    config: dict[str, Any] = {
        "host": os.getenv("MYSQL_HOST"),
        "user": os.getenv("MYSQL_USER"),
        "password": os.getenv("MYSQL_PASSWORD"),
        "database": os.getenv("MYSQL_DATABASE"),
        "port": int(os.getenv("MYSQL_PORT") or "3306"),
        "charset": "utf8mb4",
        "description": os.getenv("MYSQL_DATABASE_DESCRIPTION") or "默认 MySQL 数据库",
    }

    required_keys = ["host", "user", "password", "database"]
    for key in required_keys:
        if not config[key]:
            raise MySQLConnectionError(
                f"MySQL configuration missing required key: {key}, please check your environment variables."
            )

    return config


def create_connection(config: dict[str, Any]) -> pymysql.Connection:
    max_retries = 3
    for attempt in range(max_retries):
        try:
            return pymysql.connect(
                host=config["host"],
                user=config["user"],
                password=config["password"],
                database=config["database"],
                port=config["port"],
                charset=config.get("charset", "utf8mb4"),
                cursorclass=DictCursor,
                connect_timeout=10,
                read_timeout=60,
                write_timeout=30,
                autocommit=True,
            )
        except MySQLError as exc:
            if attempt < max_retries - 1:
                time.sleep(2**attempt)
                continue
            raise ConnectionError(f"MySQL connection failed: {exc}") from exc

    raise ConnectionError("MySQL connection failed")


def describe_table(table_name: str) -> str:
    if not MySQLSecurityChecker.validate_table_name(table_name):
        raise ValueError("表名包含非法字符，请检查表名")

    config = load_mysql_config()
    connection = create_connection(config)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"DESCRIBE `{table_name}`")
            columns = cursor.fetchall()

            if not columns:
                return f"表 {table_name} 不存在或没有字段"

            column_comments: dict[str, str] = {}
            try:
                cursor.execute(
                    """
                    SELECT COLUMN_NAME, COLUMN_COMMENT
                    FROM information_schema.COLUMNS
                    WHERE TABLE_NAME = %s AND TABLE_SCHEMA = %s
                    """,
                    (table_name, config["database"]),
                )
                comment_rows = cursor.fetchall()
                for row in comment_rows:
                    column_name = row.get("COLUMN_NAME")
                    if column_name:
                        column_comments[column_name] = row.get("COLUMN_COMMENT") or ""
            except Exception:
                pass

            result = f"表 `{table_name}` 的结构:\n\n"
            result += "字段名\t\t类型\t\tNULL\t键\t默认值\t\t额外\t备注\n"
            result += "-" * 80 + "\n"

            for col in columns:
                field = col["Field"] or ""
                type_str = col["Type"] or ""
                null_str = col["Null"] or ""
                key_str = col["Key"] or ""
                default_str = col.get("Default") or ""
                extra_str = col.get("Extra") or ""
                comment_str = column_comments.get(field, "")

                result += (
                    f"{field:<16}\t{type_str:<16}\t{null_str:<8}\t{key_str:<4}\t"
                    f"{default_str:<16}\t{extra_str:<16}\t{comment_str}\n"
                )

            try:
                cursor.execute(f"SHOW INDEX FROM `{table_name}`")
                indexes = cursor.fetchall()

                if indexes:
                    result += "\n索引信息:\n"
                    index_dict: dict[str, list[str]] = {}
                    for idx in indexes:
                        key_name = idx["Key_name"]
                        if key_name not in index_dict:
                            index_dict[key_name] = []
                        index_dict[key_name].append(idx["Column_name"])

                    for key_name, index_columns in index_dict.items():
                        result += f"- {key_name}: {', '.join(index_columns)}\n"
            except Exception:
                pass

        return result
    finally:
        connection.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="描述 MySQL 表结构")
    parser.add_argument("--table", required=True, help="要查询结构的表名")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        print(describe_table(args.table))
        return 0
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"获取表 {args.table} 结构失败: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
