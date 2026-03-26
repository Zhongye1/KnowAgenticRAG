"""
user_model_config.py
用户自定义模型配置 API
- GET  /api/user-model-config       获取当前模型配置（优先读用户配置，回落到环境变量/默认值）
- POST /api/user-model-config       保存用户模型配置
- GET  /api/user-model-config/local-models  获取本地 Ollama 已安装模型列表
- POST /api/user-model-config/test  测试当前配置是否可连通
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
import os
import json
import requests
from pathlib import Path

router = APIRouter()

# 配置文件保存路径（与 models_config.json 同目录）
_CONFIG_PATH = Path(__file__).parent.parent / "models_config.json"

# ── 数据模型 ──────────────────────────────────────────────────

class UserModelConfig(BaseModel):
    llm_model: str = "qwen2:0.5b"
    ollama_base_url: str = "http://localhost:11434"
    timeout: int = 120           # Ollama 请求超时（秒）
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    kg_model: Optional[str] = None   # 知识图谱模型，为空则复用 llm_model


class TestConfigRequest(BaseModel):
    ollama_base_url: str = "http://localhost:11434"
    llm_model: str = "qwen2:0.5b"
    timeout: int = 10


# ── 工具函数 ──────────────────────────────────────────────────

def _read_config_file() -> dict:
    """读取 models_config.json，不存在则返回空字典"""
    try:
        if _CONFIG_PATH.exists():
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"[UserModelConfig] 读取配置文件失败: {e}")
    return {}


def _write_config_file(data: dict) -> None:
    """写入 models_config.json"""
    _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_effective_config() -> UserModelConfig:
    """
    获取生效的模型配置（优先级：文件 > 环境变量 > 默认值）
    供其他模块调用。
    """
    file_cfg = _read_config_file()
    return UserModelConfig(
        llm_model=file_cfg.get("llm_model") or os.getenv("MODEL", "qwen2:0.5b"),
        ollama_base_url=file_cfg.get("ollama_base_url") or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        timeout=int(file_cfg.get("timeout") or os.getenv("OLLAMA_TIMEOUT", "120")),
        embedding_model=file_cfg.get("embedding_model") or os.getenv(
            "EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
        ),
        kg_model=file_cfg.get("kg_model") or os.getenv("KG_MODEL") or None,
    )


# ── 路由 ──────────────────────────────────────────────────────

@router.get("/api/user-model-config")
async def get_user_model_config():
    """获取当前生效的模型配置"""
    cfg = get_effective_config()
    return {
        "status": "ok",
        "config": cfg.dict(),
        "source": "file" if _read_config_file() else "env_or_default",
    }


@router.post("/api/user-model-config")
async def save_user_model_config(cfg: UserModelConfig):
    """保存用户模型配置到 models_config.json"""
    try:
        data = cfg.dict()
        _write_config_file(data)
        return {"status": "ok", "message": "配置已保存", "config": data}
    except Exception as e:
        return {"status": "error", "message": f"保存失败: {e}"}


@router.get("/api/user-model-config/local-models")
async def get_local_models(base_url: str = "http://localhost:11434"):
    """
    查询本地 Ollama 已安装的模型列表
    直接调用 Ollama /api/tags 接口
    """
    try:
        resp = requests.get(f"{base_url}/api/tags", timeout=8)
        resp.raise_for_status()
        data = resp.json()
        models = [m.get("name", "") for m in data.get("models", [])]
        return {"status": "ok", "models": models, "base_url": base_url}
    except requests.exceptions.ConnectionError:
        return {
            "status": "error",
            "message": f"无法连接 Ollama（{base_url}），请确认服务已启动",
            "models": [],
        }
    except Exception as e:
        return {"status": "error", "message": str(e), "models": []}


@router.post("/api/user-model-config/test")
async def test_model_config(req: TestConfigRequest):
    """
    测试模型配置连通性：
    1. 检查 Ollama 服务是否可达
    2. 检查指定模型是否已安装
    """
    result = {"ollama_reachable": False, "model_installed": False, "message": ""}

    try:
        tags_resp = requests.get(f"{req.ollama_base_url}/api/tags", timeout=req.timeout)
        tags_resp.raise_for_status()
        result["ollama_reachable"] = True

        installed = [m.get("name", "") for m in tags_resp.json().get("models", [])]
        # 精确匹配或前缀匹配（qwen2:0.5b 匹配 qwen2:0.5b）
        result["model_installed"] = req.llm_model in installed or any(
            m.startswith(req.llm_model.split(":")[0]) for m in installed
        )
        result["installed_models"] = installed

        if not result["model_installed"]:
            result["message"] = (
                f"模型 {req.llm_model!r} 未安装。"
                f"已安装: {', '.join(installed) or '（无）'}。"
                f"请运行: ollama pull {req.llm_model}"
            )
        else:
            result["message"] = f"连接正常，模型 {req.llm_model!r} 已就绪"

    except requests.exceptions.ConnectionError:
        result["message"] = f"无法连接 Ollama（{req.ollama_base_url}），请确认服务已启动"
    except requests.exceptions.Timeout:
        result["message"] = f"连接超时（{req.timeout}s），请检查 Ollama 地址"
    except Exception as e:
        result["message"] = f"测试失败: {e}"

    return result
