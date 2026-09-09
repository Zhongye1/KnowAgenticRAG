from collections.abc import Callable, Mapping
from typing import Any, cast

from sqlalchemy.ext.asyncio import AsyncSession

from backend.src.core.config import settings
from backend.src.plugin.core import check_plugin_installed
from backend.src.utils.serializers import select_list_serialize


def str_to_bool(value: str) -> bool:
    """将字符串转换为布尔值"""
    return value == 'true'


async def load_config(
    db: AsyncSession,
    config_type_attr: str,
    mapping: Mapping[str, Callable[[str], object]],
    status_key: str,
) -> None:
    """
    根据配置类型加载配置

    :param db: 数据库会话
    :param config_type_attr: 配置类型属性名
    :param mapping: 配置映射 {config_key: converter}
    :param status_key: 状态键
    :return:
    """
    if not check_plugin_installed('config'):
        return

    try:
        from backend.src.plugin.config.enums import ConfigType
        from backend.src.plugin.config.service.config_service import config_service
    except ImportError as e:
        raise ImportError('参数配置插件用法导入失败，请联系系统管理员') from e

    config_type = getattr(ConfigType, config_type_attr)
    dynamic_config = await config_service.get_all(db=db, type=config_type)
    if not dynamic_config:
        return

    # 非 ORM 模型分支当前实现中不会出现（Config 均为 SQLAlchemy 模型），仅作静态类型收窄
    config_list = (
        select_list_serialize(dynamic_config)
        if hasattr(dynamic_config[0], '__table__')
        else cast('list[dict[str, Any]]', dynamic_config)
    )
    configs = {dc['key']: dc['value'] for dc in config_list}
    if configs.get(status_key, '1') == '0':
        return

    for config_key, converter in mapping.items():
        if config_key in configs:
            setattr(settings, config_key, converter(configs[config_key]))


async def load_user_security_config(db: AsyncSession) -> None:
    """
    获取用户安全配置

    :param db: 数据库会话
    :return:
    """
    mapping = {
        'USER_LOCK_THRESHOLD': int,
        'USER_LOCK_SECONDS': int,
        'USER_PASSWORD_EXPIRY_DAYS': int,
        'USER_PASSWORD_REMINDER_DAYS': int,
        'USER_PASSWORD_HISTORY_CHECK_COUNT': int,
        'USER_PASSWORD_MIN_LENGTH': int,
        'USER_PASSWORD_MAX_LENGTH': int,
        'USER_PASSWORD_REQUIRE_SPECIAL_CHAR': str_to_bool,
    }
    await load_config(db, 'user_security', mapping, 'USER_SECURITY_CONFIG_STATUS')


async def load_login_config(db: AsyncSession) -> None:
    """
    获取登录配置

    :param db: 数据库会话
    :return:
    """
    mapping = {
        'LOGIN_CAPTCHA_ENABLED': str_to_bool,
    }
    await load_config(db, 'login', mapping, 'LOGIN_CONFIG_STATUS')
