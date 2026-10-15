"""进程级运行能力配置。"""

import os


def lite_mode_enabled() -> bool:
    """返回当前进程是否运行在轻量能力模式。"""

    return os.environ.get("LITE_MODE", "").strip().lower() in {"true", "1"}


def knowledge_capability_enabled() -> bool:
    """返回当前进程是否拥有知识库、图谱与评估能力。"""

    return not lite_mode_enabled()
