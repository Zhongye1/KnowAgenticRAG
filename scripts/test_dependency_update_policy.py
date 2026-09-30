"""依赖更新与审计降噪策略的负向测试。"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from textwrap import dedent


ROOT = Path(__file__).resolve().parents[1]


def verify_policy(root: Path) -> list[str]:
    """验证依赖更新分组和审计触发边界。"""
    errors: list[str] = []
    dependabot = (root / ".github/dependabot.yml").read_text(encoding="utf-8")
    workflow = (root / ".github/workflows/dependency-audit.yml").read_text(
        encoding="utf-8"
    )

    update_entries = (
        ("uv", "/backend", "/backend"),
        ("uv", "/packages/ars-cli", "/packages/ars-cli"),
        ("npm", "/web", "/web"),
        ("npm", "/docs", "/docs"),
        ("docker", None, "docker"),
        ("docker-compose", None, "docker-compose"),
        ("github-actions", None, "GitHub Actions"),
    )
    for ecosystem, directory, label in update_entries:
        section = _dependabot_section(dependabot, ecosystem, directory)
        if not section:
            errors.append(f"{label} 缺少 Dependabot update entry")
            continue
        if "schedule:\n      interval: weekly" not in section:
            errors.append(f"{label} 必须保留 weekly schedule")
        if "open-pull-requests-limit: 0" not in section:
            errors.append(f"{label} 必须关闭常规版本 PR")
        for unused in ("groups:", "allow:", "ignore:", "cooldown:"):
            if unused in section:
                errors.append(f"{label} 关闭常规更新后不应保留：{unused}")

    required_paths = (
        '".github/workflows/dependency-audit.yml"',
        '"Makefile"',
        '"backend/pyproject.toml"',
        '"backend/package/pyproject.toml"',
        '"backend/uv.lock"',
        '"packages/ars-cli/pyproject.toml"',
        '"packages/ars-cli/uv.lock"',
        '"web/package.json"',
        '"web/pnpm-lock.yaml"',
        '"docs/package.json"',
        '"docs/pnpm-lock.yaml"',
        '"scripts/dependency-audit-fixtures/**"',
    )
    pull_request_paths = workflow.split("  pull_request:\n", 1)[-1].split(
        "  push:\n", 1
    )[0]
    push_paths = workflow.split("  push:\n", 1)[-1].split(
        "  workflow_dispatch:\n", 1
    )[0]
    for path in required_paths:
        if pull_request_paths.count(path) != 1:
            errors.append(f"dependency audit 的 PR paths 缺少：{path}")
        if push_paths.count(path) != 1:
            errors.append(f"dependency audit 的 push paths 缺少：{path}")

    expected_concurrency = dedent(
        """\
        concurrency:
          group: dependency-audit-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
          cancel-in-progress: true
        """
    )
    if expected_concurrency not in workflow:
        errors.append("dependency audit 必须取消同一分支的过期运行")

    return errors


def _dependabot_section(content: str, ecosystem: str, directory: str | None = None) -> str:
    marker = f"  - package-ecosystem: {ecosystem}\n"
    for section in content.split(marker)[1:]:
        section = marker + section.split("\n  - package-ecosystem:", 1)[0]
        if directory is None or f"    directory: {directory}\n" in section:
            return section
    return ""


class DependencyUpdatePolicyTest(unittest.TestCase):
    """证明策略缺失时 gate 会在正确原因上失败。"""

    def test_repository_policy_is_valid(self) -> None:
        self.assertEqual(verify_policy(ROOT), [])

    def test_docker_version_pr_limit_is_required(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            self._copy_policy_files(root)
            path = root / ".github/dependabot.yml"
            content = path.read_text(encoding="utf-8")
            docker_section = _dependabot_section(content, "docker")
            path.write_text(
                content.replace(
                    docker_section,
                    docker_section.replace(
                        "open-pull-requests-limit: 0",
                        "open-pull-requests-limit: 5",
                    ),
                    1,
                ),
                encoding="utf-8",
            )

            self.assertIn("docker 必须关闭常规版本 PR", verify_policy(root))

    def test_dependency_audit_paths_are_required(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            self._copy_policy_files(root)
            path = root / ".github/workflows/dependency-audit.yml"
            content = path.read_text(encoding="utf-8")
            path.write_text(
                content.replace('      - "web/pnpm-lock.yaml"\n', "", 1),
                encoding="utf-8",
            )

            self.assertIn(
                'dependency audit 的 PR paths 缺少："web/pnpm-lock.yaml"',
                verify_policy(root),
            )

    def test_closed_version_updates_do_not_keep_unused_rules(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            self._copy_policy_files(root)
            path = root / ".github/dependabot.yml"
            content = path.read_text(encoding="utf-8")
            path.write_text(
                content.replace(
                    "    open-pull-requests-limit: 0\n",
                    "    open-pull-requests-limit: 0\n    groups:\n      patch:\n        patterns: [\"*\"]\n",
                    1,
                ),
                encoding="utf-8",
            )

            self.assertIn(
                "/backend 关闭常规更新后不应保留：groups:",
                verify_policy(root),
            )

    def test_update_entries_require_a_schedule(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            self._copy_policy_files(root)
            path = root / ".github/dependabot.yml"
            content = path.read_text(encoding="utf-8")
            path.write_text(
                content.replace("    schedule:\n      interval: weekly\n", "", 1),
                encoding="utf-8",
            )

            self.assertIn(
                "/backend 必须保留 weekly schedule",
                verify_policy(root),
            )

    @staticmethod
    def _copy_policy_files(root: Path) -> None:
        for relative in (
            ".github/dependabot.yml",
            ".github/workflows/dependency-audit.yml",
        ):
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text((ROOT / relative).read_text(encoding="utf-8"), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
