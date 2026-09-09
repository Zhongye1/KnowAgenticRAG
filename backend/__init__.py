import sqlalchemy as sa

from .src import ENV_EXAMPLE_FILE_PATH as ENV_EXAMPLE_FILE_PATH
from .src import ENV_FILE_PATH as ENV_FILE_PATH
from .src import PLUGIN_DIR as PLUGIN_DIR
from .src.plugin.settings_source import PluginSettingsSource as PluginSettingsSource

'RAGF 服务端'

__version__ = '1.15.1'


def _register_model_globals() -> None:
    """导入所有模型并注册到 backend 模块命名空间"""
    from backend.src.utils.dynamic_import import get_all_models

    for model_obj in get_all_models():
        # 非 Table 的模型类必有 __name__，getattr 与属性访问行为一致，规避静态检查限制
        model_name = (
            model_obj.name if isinstance(model_obj, sa.Table) else getattr(model_obj, '__name__')  # ruff:ignore[get-attr-with-constant]
        )
        if model_name not in globals():
            globals()[model_name] = model_obj


_register_model_globals()
