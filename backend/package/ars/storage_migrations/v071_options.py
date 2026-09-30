"""把 v0.7.1 base.toml 一次性迁移到 PostgreSQL。"""

from pathlib import Path

import tomli
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ars.config.options import (
    SYSTEM_OPTIONS_MIGRATION_VERSION_PARAM,
    normalize_option_value,
    system_options,
)
from ars.storage.postgres.models_business import ConfigOption
from ars.utils.logging_config import logger

_MIGRATION_VERSION = 1


async def migrate_system_options(db: AsyncSession, *, legacy_config_file: Path) -> None:
    """只补充尚未落库的 v0.7.1 系统配置字段。"""
    statement = select(ConfigOption).where(ConfigOption.key == system_options.key).with_for_update()
    result = await db.execute(statement)
    record = result.scalar_one_or_none()
    if record is None:
        raise RuntimeError("系统配置项不存在")

    params = dict(record.params or {})
    if int(params.get(SYSTEM_OPTIONS_MIGRATION_VERSION_PARAM) or 0) >= _MIGRATION_VERSION:
        return

    if legacy_config_file.is_symlink():
        raise RuntimeError(f"历史系统配置不得是符号链接: {legacy_config_file}")
    if legacy_config_file.is_file():
        try:
            with legacy_config_file.open("rb") as file:
                raw = tomli.load(file)
        except (OSError, tomli.TOMLDecodeError) as exc:
            raise RuntimeError(f"读取历史系统配置失败: {legacy_config_file}") from exc
    else:
        raw = {}

    migrated = dict(record.value or {})
    fields_by_key = {field["key"]: field for field in system_options.fields}
    for key, value in raw.items():
        if key not in fields_by_key or key in migrated:
            continue
        try:
            migrated[key] = normalize_option_value(fields_by_key[key], value)
        except ValueError as exc:
            logger.warning(f"Skipped invalid legacy config field {key}: {exc}")

    record.value = migrated
    record.updated_by = "system-migration"
    params[SYSTEM_OPTIONS_MIGRATION_VERSION_PARAM] = _MIGRATION_VERSION
    record.params = params
    await db.flush()
