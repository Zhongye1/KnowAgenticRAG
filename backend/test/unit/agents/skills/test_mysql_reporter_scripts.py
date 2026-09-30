from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

from ars.agents.skills.buildin import BUILTIN_SKILLS


def _mysql_reporter_dir() -> Path:
    for spec in BUILTIN_SKILLS:
        if spec.slug == "mysql-reporter":
            return spec.source_dir
    raise AssertionError("mysql-reporter builtin skill spec not found")


def _load_script(script_name: str) -> ModuleType:
    script_path = _mysql_reporter_dir() / "scripts" / script_name
    spec = importlib.util.spec_from_file_location(f"mysql_reporter_{script_path.stem}", script_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_mysql_reporter_query_security_validates_sql_and_timeout():
    query_script = _load_script("query.py")
    sql_cases = {
        "": False,
        "SELECT * FROM users": True,
        "show tables": True,
        "DESCRIBE users": True,
        "EXPLAIN SELECT * FROM users": True,
        "SELECT 1;": True,
        "DELETE FROM users": False,
        "SELECT * FROM users WHERE id = 1 OR 1=1": False,
        "SELECT * FROM users UNION SELECT password FROM admin": False,
        "SELECT 'DROP' AS keyword_text": True,
        "/* comment */ SELECT 1": True,
        "/* multi\nline */ SELECT 1": True,
        "SELECT * FROM users; DROP TABLE users": False,
        "SELECT * FROM users; CREATE TABLE audit_log(id INT)": False,
        "SELECT * FROM users; SET @unsafe = 1": False,
    }

    for sql, expected in sql_cases.items():
        assert query_script.MySQLSecurityChecker.validate_sql(sql) is expected

    timeout_cases = {
        None: False,
        0: False,
        1: True,
        60: True,
        600: True,
        601: False,
        "60": False,
    }

    for timeout, expected in timeout_cases.items():
        assert query_script.MySQLSecurityChecker.validate_timeout(timeout) is expected


def test_mysql_reporter_describe_table_name_security_validates_known_cases():
    describe_script = _load_script("describe_table.py")
    table_cases = {
        "": False,
        "users": True,
        "_audit_log": True,
        "user_2026": True,
        "1users": False,
        "user-name": False,
        "users;drop": False,
    }

    for table_name, expected in table_cases.items():
        assert describe_script.MySQLSecurityChecker.validate_table_name(table_name) is expected
