import asyncio
import shutil
import tempfile
from pathlib import Path, PurePosixPath
from typing import Annotated

from langchain.tools import InjectedToolCallId
from langchain_core.messages import ToolMessage
from langgraph.prebuilt.tool_node import ToolRuntime
from langgraph.types import Command
from pydantic import BaseModel, Field

from ars.agents.backends.paths import VIRTUAL_PATH_PREFIX, VIRTUAL_PERSONAL_SKILLS_PATH
from ars.agents.backends.sandbox.download import download_sandbox_directory
from ars.agents.toolkits.registry import tool
from ars.storage.postgres.manager import pg_manager
from ars.utils.logging_config import logger

SANDBOX_PATH_HINT = "请使用当前 Project Workdir 下的目录，或 /home/gem/user-data/..."


class InstallSkillInput(BaseModel):
    source: str = Field(
        description="Skill 来源，支持两种格式:\n"
        "1. Sandbox 路径: 当前 Project Workdir 或 /home/gem/user-data/ 下的绝对路径\n"
        "2. Git 仓库: owner/repo 或完整 GitHub URL"
    )
    skill_names: list[str] | None = Field(
        default=None, description="Git 安装时指定要安装的 skill slug 列表（至少一个）。Sandbox 路径安装时忽略此参数。"
    )


def _prepare_skill_from_sandbox(
    sandbox_path: str,
    thread_id: str,
    uid: str,
    staging_root: Path,
    workdir_relative_path: str | None = None,
    workdir_path: str | None = None,
) -> Path:
    """从 Sandbox 路径准备 skill 目录，返回本地暂存目录。"""
    from ars.agents.backends.sandbox import ProvisionerSandboxBackend
    from ars.agents.skills.service import is_valid_skill_slug

    slug = PurePosixPath(sandbox_path.rstrip("/")).name
    if not is_valid_skill_slug(slug):
        raise ValueError(f"slug '{slug}' 不合法（仅允许小写字母、数字和连字符）")

    allowed = sandbox_path.startswith(f"{VIRTUAL_PATH_PREFIX.rstrip('/')}/")
    allowed = allowed or bool(workdir_path and sandbox_path.startswith(f"{workdir_path.rstrip('/')}/"))
    if not allowed:
        raise ValueError(f"不支持的沙盒路径: {sandbox_path}。{SANDBOX_PATH_HINT}")

    staging = staging_root / slug
    backend = ProvisionerSandboxBackend(
        thread_id=thread_id,
        uid=uid,
        workdir_path=workdir_relative_path,
        create_if_missing=False,
    )
    download_sandbox_directory(
        backend,
        sandbox_path,
        staging,
        empty_message=f"沙盒路径 {sandbox_path} 中未发现可下载文件",
    )
    if not (staging / "SKILL.md").exists():
        shutil.rmtree(staging, ignore_errors=True)
        raise ValueError(f"沙盒路径 {sandbox_path} 中未找到 SKILL.md")

    return staging


async def _run_install_task(
    source: str,
    runtime: ToolRuntime,
    tool_call_id: str,
    skill_names: list[str] | None = None,
) -> Command:
    """执行异步安装任务的核心逻辑。"""
    runtime_context = getattr(runtime, "context", None)
    if getattr(runtime_context, "is_subagent_runtime", False):
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content="错误：install_skill 只能在主智能体中使用，子智能体无法安装 Skill",
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )

    source = str(source or "").strip()
    uid = getattr(runtime_context, "uid", None)
    thread_id = getattr(runtime_context, "thread_id", None)

    logger.info(f"install_skill called with uid={uid}, thread_id={thread_id}, source={source}")

    if not uid or not thread_id:
        return Command(
            update={"messages": [ToolMessage(content="错误：无法获取当前会话信息", tool_call_id=tool_call_id)]}
        )
    if not source:
        return Command(
            update={"messages": [ToolMessage(content="错误：Skill 来源不能为空", tool_call_id=tool_call_id)]}
        )

    try:
        from ars.agents.skills.service import (
            enable_personal_skills_for_agent_config,
            install_personal_skill_dir,
        )

        installed_slugs: list[str] = []
        failed_items: list[dict] = []
        config_success = True

        if source.startswith("/"):
            with tempfile.TemporaryDirectory(prefix=".skill-install-") as tmp:
                source_dir = await asyncio.to_thread(
                    _prepare_skill_from_sandbox,
                    source,
                    thread_id,
                    uid,
                    Path(tmp),
                    getattr(runtime_context, "workdir_relative_path", None),
                    getattr(runtime_context, "workdir_path", None),
                )
                item = await install_personal_skill_dir(uid, source_dir)
                installed_slugs = [item.slug]
        else:
            if not skill_names:
                return Command(
                    update={
                        "messages": [
                            ToolMessage(
                                content="错误：从 Git 安装时必须通过 skill_names 指定技能名称",
                                tool_call_id=tool_call_id,
                            )
                        ]
                    }
                )

            from ars.agents.skills.remote_install import prepare_remote_skills_batch

            preparation = await prepare_remote_skills_batch(source=source, skills=skill_names)
            try:
                for result in preparation.results:
                    if not result.get("success"):
                        failed_items.append(result)
                        continue
                    try:
                        item = await install_personal_skill_dir(uid, result["source_dir"])
                        installed_slugs.append(item.slug)
                    except Exception as e:
                        failed_items.append({"slug": result["slug"], "success": False, "error": str(e)})

            finally:
                await preparation.cleanup()

        if installed_slugs:
            async with pg_manager.get_async_session_context() as db:
                config_success = await enable_personal_skills_for_agent_config(
                    db, thread_id=thread_id, uid=uid, skill_slugs=installed_slugs
                )

        lines = []
        if installed_slugs:
            lines.append(f"已安装 Skill: {', '.join(installed_slugs)}")
            for slug in installed_slugs:
                lines.append(f"Skill 路径: {VIRTUAL_PERSONAL_SKILLS_PATH}/{slug}/SKILL.md")
        if failed_items:
            for item in failed_items:
                lines.append(f"安装失败 ({item['slug']}): {item.get('error', '未知错误')}")
        if not config_success:
            lines.append("Skill 已安装，但当前 Agent 配置未更新，请手动启用")
        if not installed_slugs and not failed_items:
            lines.append("未发现需要安装的 Skill")

        return Command(
            update={
                "messages": [ToolMessage(content="\n".join(lines), tool_call_id=tool_call_id)],
            }
        )

    except Exception as e:
        logger.exception("install_skill 异常")
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=f"安装异常：{str(e)}",
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )


@tool(
    category="buildin",
    tags=["skill", "安装"],
    display_name="安装技能",
    args_schema=InstallSkillInput,
)
async def install_skill(
    source: str,
    skill_names: list[str] | None = None,
    runtime: ToolRuntime = None,
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """安装新的 Skill 到当前用户私有空间，并返回可直接读取的 Skill 路径。"""
    return await _run_install_task(source, runtime, tool_call_id, skill_names)
