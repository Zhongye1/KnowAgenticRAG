import os
import tempfile
from pathlib import Path


def get_legacy_storage_dir() -> Path:
    """读取仅供一次性迁移使用的历史广域存储目录。"""
    return Path(os.getenv("ARS_LEGACY_STORAGE_DIR", "legacy-saves"))


def get_runtime_dir() -> Path:
    """读取可丢弃日志与缓存使用的当前进程运行目录。"""
    configured = os.getenv("ARS_RUNTIME_DIR")
    if configured:
        return Path(configured)
    return Path(tempfile.gettempdir()) / f"ars-runtime-{os.getpid()}"


def get_skill_data_dir() -> Path:
    """读取共享与个人 Skill 持久源目录。"""
    configured = os.getenv("ARS_SKILL_DATA_DIR")
    return Path(configured) if configured else Path("skill-sources")


def get_skill_projection_dir() -> Path:
    """读取用户授权 Skill 只读投影目录。"""
    configured = os.getenv("ARS_SKILL_PROJECTION_DIR")
    return Path(configured) if configured else Path("skill-projections")


def get_user_data_dir() -> Path:
    """读取用户级实时文件持久目录。"""
    return Path(os.getenv("ARS_USER_DATA_DIR", "user-data"))


def __getattr__(name: str):
    """按需加载用户配置，避免轻量路径配置触发业务模型导入。"""
    if name in {"UserConfig", "UserConfigSchema"}:
        from .user import UserConfig, UserConfigSchema

        return {"UserConfig": UserConfig, "UserConfigSchema": UserConfigSchema}[name]
    raise AttributeError(name)


__all__ = [
    "UserConfig",
    "UserConfigSchema",
    "get_runtime_dir",
    "get_legacy_storage_dir",
    "get_skill_data_dir",
    "get_skill_projection_dir",
    "get_user_data_dir",
]
