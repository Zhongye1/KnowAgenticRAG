"""AgentRun 运行清单与执行指纹。

在 worker 取得执行所有权后、真正构造 LangGraph 执行上下文前，从数据库
解析本次运行实际采用的运行资产，生成只含稳定标识与非敏感摘要的 manifest，
并以规范化 JSON 的 SHA-256 作为指纹。manifest 由 AgentRun 行拥有，
write-once 固化后不得改写；历史 Run 保持 NULL 表示 unknown。
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from typing import Any

from ars.agents.buildin import agent_manager
from ars.agents.context import normalize_agent_context_config
from ars.agents.skills.runtime import resolve_runtime_skills_for_context
from ars.agents.skills.service import PERSONAL_SKILL_SOURCE_TYPE
from ars.repositories.agent_repository import AgentRepository
from ars.storage.postgres.models_business import AgentRun, Skill, User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

MANIFEST_SCHEMA_VERSION = 1
# 直接进入 manifest 的关键 limit 字段；未列出的 context 字段只以 config_digest 形式存在。
MANIFEST_LIMIT_FIELDS = (
    "max_execution_steps",
    "model_retry_times",
    "summary_threshold",
    "summary_keep_messages",
    "summary_tool_result_token_limit",
    "summary_l2_trigger_ratio",
)


@dataclass(frozen=True)
class RunManifestBuildResult:
    """同时返回持久化清单与本次执行复用的内存快照。"""

    manifest: dict
    normalized_context: dict
    skill_runtime_snapshot: dict[str, Any]


def canonical_json(payload: Any) -> str:
    """键排序 + 紧凑分隔符的确定性序列化，保证字段顺序不影响指纹。"""
    return json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"), default=str)


def compute_manifest_fingerprint(manifest: dict) -> str:
    """计算运行清单的 SHA-256 指纹。"""
    return hashlib.sha256(canonical_json(manifest).encode("utf-8")).hexdigest()


def compute_config_digest(normalized_context: dict) -> str:
    """对完整规范化 context 计算 SHA-256 摘要；prompt 等内容只以摘要形式进入 manifest。"""
    return hashlib.sha256(canonical_json(normalized_context or {}).encode("utf-8")).hexdigest()


def _resource_keys(value: Any) -> list[str]:
    """提取资源字段中的字符串键；非列表或非字符串项忽略，避免不可序列化值进入 manifest。"""
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def build_manifest_payload(
    *,
    run_type: str,
    agent_slug: str,
    backend_id: str | None,
    model_spec: str | None,
    tool_approval_mode: str | None,
    normalized_context: dict,
    skill_entries: list[dict],
    code_revision: str | None,
    limits: dict,
) -> dict:
    """从已解析的执行资产组装 manifest；直接字段仅限稳定标识、摘要与关键 limit。

    limits 由调用方传入实际生效值（含 schema 默认值），不在此处解析。
    """
    return {
        "manifest_version": MANIFEST_SCHEMA_VERSION,
        "run_type": run_type,
        "agent": {
            "slug": agent_slug,
            "backend_id": backend_id,
        },
        "model": {
            "spec": model_spec if isinstance(model_spec, str) and model_spec else None,
        },
        "tool_approval_mode": tool_approval_mode,
        "resources": {
            "tools": _resource_keys(normalized_context.get("tools")),
            "mcps": _resource_keys(normalized_context.get("mcps")),
            "skills": skill_entries,
        },
        "limits": limits,
        "config_digest": compute_config_digest(normalized_context),
        "code_revision": code_revision or "unresolved",
    }


async def resolve_skill_entries(
    db: AsyncSession,
    skill_slugs: list[str],
    *,
    preload_content_hashes: dict[str, str] | None = None,
    personal_skill_slugs: set[str] | None = None,
) -> list[dict]:
    """按执行时数据库状态读取 Skill 稳定标识；缺失信息显式为 None，不伪造版本。"""
    preload_hashes = preload_content_hashes or {}
    personal_slugs = personal_skill_slugs or set()
    entries: list[dict] = []
    for slug in skill_slugs:
        row = (await db.execute(select(Skill.version, Skill.content_hash).where(Skill.slug == slug))).first()
        is_personal = slug in personal_slugs
        entry = {
            "slug": slug,
            "version": None if is_personal else (row.version if row else None),
            "content_hash": None if is_personal else (row.content_hash if row else None),
        }
        if slug in preload_hashes:
            entry["preload_content_hash"] = preload_hashes[slug]
        entries.append(entry)
    return entries


def _manifest_skill_scope(normalized_context: dict, runtime_scope: dict) -> tuple[list[str], dict[str, str], set[str]]:
    """合并配置 Skill 与预加载闭包，并标识真实个人来源。"""
    slugs = list(
        dict.fromkeys(
            [
                *_resource_keys(normalized_context.get("skills")),
                *_resource_keys(runtime_scope.get("preloaded_skills")),
            ]
        )
    )
    contents = runtime_scope.get("preloaded_skill_contents")
    hashes = (
        {
            slug: hashlib.sha256(content.encode("utf-8")).hexdigest()
            for slug, content in contents.items()
            if slug in slugs and isinstance(content, str)
        }
        if isinstance(contents, dict)
        else {}
    )
    source_scopes = runtime_scope.get("runtime_skill_source_scopes")
    personal_slugs = (
        {slug for slug in slugs if source_scopes.get(slug) == PERSONAL_SKILL_SOURCE_TYPE}
        if isinstance(source_scopes, dict)
        else set()
    )
    return slugs, hashes, personal_slugs


def resolve_code_revision() -> str | None:
    """读取部署环境提供的代码 revision；缺失时由 build_manifest_payload 显式记为 unresolved。"""
    revision = os.getenv("ARS_CODE_REVISION", "").strip()
    return revision or None


async def build_run_manifest_result(*, run: AgentRun, user: User, db: AsyncSession) -> RunManifestBuildResult:
    """在执行边界构建 manifest 与不可分叉的运行时快照。"""
    agent_item = await AgentRepository(db).get_visible_by_slug(
        slug=run.agent_slug,
        user=user,
        kind="subagent" if run.run_type == "subagent" else "main",
    )
    backend = agent_manager.get_agent(agent_item.backend_id) if agent_item else None
    normalized_context: dict = {}
    if agent_item and backend:
        normalized_context = await normalize_agent_context_config(
            (agent_item.config_json or {}).get("context", {}),
            db=db,
            user=user,
            context_schema=backend.context_schema,
        )

    runtime_skill_snapshot: dict[str, Any] = {}
    skill_slugs = _resource_keys(normalized_context.get("skills"))
    preload_hashes: dict[str, str] = {}
    personal_slugs: set[str] = set()
    if backend:
        context_instance = backend.context_schema()
        context_instance.update_from_dict(dict(normalized_context))
        runtime_skill_snapshot = await resolve_runtime_skills_for_context(context_instance, db=db, user=user)
        skill_slugs, preload_hashes, personal_slugs = _manifest_skill_scope(normalized_context, runtime_skill_snapshot)

    payload = run.input_payload if isinstance(run.input_payload, dict) else {}
    effective_limits = _effective_limits(backend, normalized_context)
    manifest = build_manifest_payload(
        run_type=run.run_type,
        agent_slug=run.agent_slug,
        backend_id=agent_item.backend_id if agent_item else None,
        model_spec=payload.get("model_spec"),
        tool_approval_mode=payload.get("tool_approval_mode"),
        normalized_context=normalized_context,
        limits=effective_limits,
        skill_entries=await resolve_skill_entries(
            db,
            skill_slugs,
            preload_content_hashes=preload_hashes,
            personal_skill_slugs=personal_slugs,
        ),
        code_revision=resolve_code_revision(),
    )
    return RunManifestBuildResult(
        manifest=manifest,
        normalized_context=normalized_context,
        skill_runtime_snapshot=runtime_skill_snapshot,
    )


async def build_run_manifest(*, run: AgentRun, user: User, db: AsyncSession) -> dict:
    """构建只含稳定标识和摘要的持久化运行清单。"""
    return (await build_run_manifest_result(run=run, user=user, db=db)).manifest


def _effective_limits(backend, normalized_context: dict) -> dict:
    """用 schema 实例解析实际生效的 limit；未显式配置时取类默认值而不是 null。"""
    if backend is None:
        return {field: normalized_context.get(field) for field in MANIFEST_LIMIT_FIELDS}
    context_instance = backend.context_schema()
    context_instance.update_from_dict(dict(normalized_context))
    return {field: getattr(context_instance, field, None) for field in MANIFEST_LIMIT_FIELDS}
