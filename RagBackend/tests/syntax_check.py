"""
全量语法检查脚本 - 扫描 RagBackend 下所有 .py 文件
"""

import ast
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
errors = []
checked = 0

for p in root.rglob("*.py"):
    skip_dirs = ["__pycache__", ".venv", "venv", "site-packages", ".git"]
    if any(x in str(p) for x in skip_dirs):
        continue
    try:
        source = p.read_text(encoding="utf-8", errors="replace")
        ast.parse(source)
        checked += 1
    except SyntaxError as e:
        errors.append(f"SYNTAX ERROR {p.relative_to(root)}: line {e.lineno} - {e.msg}")

print(f"Checked {checked} files")
if errors:
    print("FAILURES:")
    for e in errors:
        print("  ", e)
    sys.exit(1)
else:
    print("ALL SYNTAX OK")
