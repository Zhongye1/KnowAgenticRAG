"""Preview Owner 的静态依赖方向。"""

from __future__ import annotations

import ast
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[3] / "package" / "ars"


def _imports(relative_path: str) -> set[str]:
    tree = ast.parse((PACKAGE_ROOT / relative_path).read_text(encoding="utf-8"))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def test_common_filepreview_does_not_import_domain_storage_or_http() -> None:
    imports = _imports("utils/filepreview.py")

    assert not any(
        module.startswith(("ars.workspace", "ars.knowledge", "ars.storage", "fastapi", "starlette"))
        for module in imports
    )


def test_knowledge_and_artifact_do_not_import_workspace_preview() -> None:
    for relative_path in ("knowledge/base.py", "knowledge/preview.py", "services/artifact_service.py"):
        assert "ars.workspace.preview" not in _imports(relative_path)
