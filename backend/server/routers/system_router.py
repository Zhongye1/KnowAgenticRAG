import os
from pathlib import Path
from typing import Any

import aiofiles
import yaml
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession
from ars import get_version
from ars.config.options import invalidate_option_cache, system_options, update_option_value
from ars.config.runtime import knowledge_capability_enabled
from ars.services.readiness_service import get_readiness
from ars.storage.postgres.models_business import User
from ars.utils.logging_config import LOG_FILE, logger

from server.utils.auth_middleware import get_admin_user, get_db, get_required_user

system = APIRouter(prefix="/system", tags=["system"])


class HealthResponse(BaseModel):
    """API 进程 liveness。"""

    status: str
    message: str
    version: str


class ReadinessCheckItem(BaseModel):
    """单个就绪探针结果；失败时才有 `code`。"""

    status: str
    code: str | None = None


class ReadinessComponentItem(BaseModel):
    """启动组件事实；异常时才有 `code`。"""

    status: str
    required: bool
    code: str | None = None


class ReadinessResponse(BaseModel):
    """接流量就绪事实，`status` 为 ready/not_ready，后者以 503 返回。"""

    status: str
    degraded: bool
    checks: dict[str, ReadinessCheckItem]
    components: dict[str, ReadinessComponentItem]
    version: str


class DiscoveryFeatureFlags(BaseModel):
    """能力发现中的功能开关。"""

    knowledge: bool


class DiscoveryCliCapabilities(BaseModel):
    """CLI 客户端可用的能力声明。"""

    min_cli_version: str
    browser_login: bool
    api_key_auth: bool
    remote_config: bool
    kb_upload: bool
    kb_list: bool
    kb_files: bool
    kb_query: bool
    kb_open: bool
    kb_find: bool


class DiscoveryCapabilities(BaseModel):
    """能力发现的能力分组。"""

    features: DiscoveryFeatureFlags
    cli: DiscoveryCliCapabilities


class DiscoveryEndpoints(BaseModel):
    """能力发现暴露的关键端点。"""

    health: str
    readiness: str
    auth_me: str
    cli_auth_sessions: str
    cli_auth_authorize: str


class DiscoveryResponse(BaseModel):
    """系统能力发现响应（公开接口）。"""

    name: str
    version: str
    api_prefix: str
    capabilities: DiscoveryCapabilities
    endpoints: DiscoveryEndpoints


class SystemConfigFieldItem(BaseModel):
    """`_serialize_system_config` 里 `_config_items` 的单字段描述。"""

    des: str
    default: Any
    type: str
    exclude: bool


class SystemConfigResponse(BaseModel):
    """系统配置响应：字段值键集合由 `system_options.fields` 动态决定。

    配置项随版本演进，顶层键无法静态枚举，因此用 `extra="allow"` 原样透传动态键；
    `_config_items` 以下划线开头，不能直接作字段名，用别名映射到 `config_items`。
    """

    model_config = ConfigDict(extra="allow")
    config_items: dict[str, SystemConfigFieldItem] = Field(alias="_config_items")


class SystemLogResponse(BaseModel):
    """API 进程日志读取结果。"""

    log: str
    message: str
    log_file: str
    scope: str


class InfoResponse(BaseModel):
    """系统信息配置（公开接口）。"""

    success: bool
    data: dict[str, Any]


class InfoReloadResponse(BaseModel):
    """信息配置重新加载结果。"""

    success: bool
    message: str
    data: dict[str, Any]


class ConfigOptionSensitiveStateItem(BaseModel):
    """敏感配置字段的来源与脱敏预览。"""

    source: str
    configured: bool
    preview: str | None


class ConfigOptionItem(BaseModel):
    """通用配置项的表单定义与值。"""

    key: str
    name: str
    description: str
    params: dict[str, Any]
    value: dict[str, Any]
    sensitive_configured: dict[str, bool]
    sensitive_state: dict[str, ConfigOptionSensitiveStateItem]


class ConfigOptionsResponse(BaseModel):
    """通用配置项列表。"""

    options: list[ConfigOptionItem]


class ConfigOptionResponse(BaseModel):
    """单个通用配置项保存结果。"""

    option: ConfigOptionItem


class OcrEngineItem(BaseModel):
    """一种 OCR 方法及其静态元数据。"""

    engine_id: str
    service_name: str
    display_name: str
    supported_extensions: list[str]


class OcrOptionsResponse(BaseModel):
    """OCR 方法列表与默认项。"""

    default_engine: str
    engines: list[OcrEngineItem]


class OcrHealthItem(BaseModel):
    """单个 OCR 方法的健康检查结果。"""

    status: str
    message: str
    details: dict[str, Any]


class OcrHealthResponse(BaseModel):
    """全部 OCR 方法的健康检查结果。"""

    health: dict[str, OcrHealthItem]


# =============================================================================
# === 健康检查分组 ===
# =============================================================================


@system.get("/health", response_model=HealthResponse, response_model_exclude_unset=True)
async def health_check():
    """返回 API 进程 liveness，不代表依赖或业务链路就绪。"""
    return {"status": "ok", "message": "进程正常运行", "version": get_version()}


@system.get(
    "/ready",
    response_model=ReadinessResponse,
    response_model_exclude_unset=True,
    responses={503: {"model": ReadinessResponse, "description": "未就绪，status=not_ready"}},
)
async def readiness_check(request: Request):
    """验证 API 接流量所需的启动状态与核心依赖。"""

    result = await get_readiness(
        startup_complete=bool(getattr(request.app.state, "startup_complete", False)),
        startup_components=getattr(request.app.state, "startup_components", None),
    )
    result["version"] = get_version()
    return JSONResponse(status_code=200 if result["status"] == "ready" else 503, content=result)


@system.get("/discovery", response_model=DiscoveryResponse, response_model_exclude_unset=True)
async def discovery():
    """系统能力发现接口（公开接口）"""
    knowledge_enabled = knowledge_capability_enabled()
    return {
        "name": "ARS",
        "version": get_version(),
        "api_prefix": "/api",
        "capabilities": {
            "features": {"knowledge": knowledge_enabled},
            "cli": {
                "min_cli_version": "0.1.0",
                "browser_login": True,
                "api_key_auth": True,
                "remote_config": True,
                "kb_upload": knowledge_enabled,
                "kb_list": knowledge_enabled,
                "kb_files": knowledge_enabled,
                "kb_query": knowledge_enabled,
                "kb_open": knowledge_enabled,
                "kb_find": knowledge_enabled,
            },
        },
        "endpoints": {
            "health": "/api/system/health",
            "readiness": "/api/system/ready",
            "auth_me": "/api/auth/me",
            "cli_auth_sessions": "/api/auth/cli/sessions",
            "cli_auth_authorize": "/auth/cli/authorize",
        },
    }


# =============================================================================
# === 配置管理分组 ===
# =============================================================================


def _serialize_system_config(values: dict) -> dict:
    fields = {
        field["key"]: {
            "des": field["label"],
            "default": field.get("default"),
            "type": field.get("type", "string"),
            "exclude": False,
        }
        for field in system_options.fields
    }
    return {**values, "_config_items": fields}


@system.get("/config", response_model=SystemConfigResponse, response_model_exclude_unset=True)
async def get_config(
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    """获取系统配置"""
    return _serialize_system_config(await system_options.get(db))


@system.post("/config", response_model=SystemConfigResponse, response_model_exclude_unset=True)
async def update_config_single(
    key=Body(...),
    value=Body(...),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """更新单个配置项"""
    if not isinstance(key, str) or key not in {field["key"] for field in system_options.fields}:
        raise HTTPException(status_code=400, detail=f"未知配置项: {key}")
    try:
        await update_option_value(db, system_options.key, {key: value}, current_user.username)
        await db.commit()
        await invalidate_option_cache(system_options.key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _serialize_system_config(await system_options.get(db))


@system.post("/config/update", response_model=SystemConfigResponse, response_model_exclude_unset=True)
async def update_config_batch(
    items: dict = Body(...),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """批量更新配置项"""
    try:
        await update_option_value(db, system_options.key, items, current_user.username)
        await db.commit()
        await invalidate_option_cache(system_options.key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _serialize_system_config(await system_options.get(db))


@system.get("/logs", response_model=SystemLogResponse, response_model_exclude_unset=True)
async def get_system_logs(levels: str | None = None, current_user: User = Depends(get_admin_user)):
    """获取当前 API 进程日志。

    Args:
        levels: 可选的日志级别过滤，多个级别用逗号分隔，如 "INFO,ERROR,DEBUG,WARNING"
    """
    try:
        # 解析日志级别过滤条件
        level_filter = None
        if levels:
            level_filter = set(level.strip().upper() for level in levels.split(",") if level.strip())

        #  修复 GBK 编码报错：强制 utf-8 读取，忽略错误
        async with aiofiles.open(LOG_FILE, encoding="utf-8", errors="ignore") as f:
            # 读取最后1000行
            lines = []
            async for line in f:
                filtered_line = line.rstrip("\n\r")
                # 如果指定了日志级别过滤，则按级别过滤
                if level_filter:
                    # 日志格式: 2025-03-10 08:26:37,269 - INFO - module - message
                    # 提取日志级别
                    parts = filtered_line.split(" - ")
                    if len(parts) >= 2 and parts[1].strip() in level_filter:
                        lines.append(filtered_line + "\n")
                    # 继续读取以保持行数统计准确
                    if len(lines) > 1000:
                        lines.pop(0)
                else:
                    lines.append(filtered_line + "\n")
                    if len(lines) > 1000:
                        lines.pop(0)

        log = "".join(lines)
        return {"log": log, "message": "success", "log_file": LOG_FILE, "scope": "api"}
    except Exception as e:
        logger.error(f"获取系统日志失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取系统日志失败: {str(e)}")


# =============================================================================
# === 信息管理分组 ===
# =============================================================================


async def load_info_config():
    """加载信息配置文件"""
    try:
        # 配置文件路径
        brand_file_path = os.environ.get("ARS_BRAND_FILE_PATH", "package/ars/config/static/info.local.yaml")
        config_path = Path(brand_file_path)

        # 检查文件是否存在
        if not config_path.exists():
            logger.debug(f"The config file {config_path} does not exist, using default config")
            config_path = Path("package/ars/config/static/info.template.yaml")

        # 异步读取配置文件
        async with aiofiles.open(config_path, encoding="utf-8") as file:
            content = await file.read()

        # 注入版本号占位符
        content = content.replace("{{ARS_VERSION}}", get_version())

        config = yaml.safe_load(content)

        return config

    except Exception as e:
        logger.error(f"Failed to load info config: {e}")
        return {}


@system.get("/info", response_model=InfoResponse, response_model_exclude_unset=True)
async def get_info_config():
    """获取系统信息配置（公开接口，无需认证）"""
    try:
        config = await load_info_config()
        return {"success": True, "data": config}
    except Exception as e:
        logger.error(f"获取信息配置失败: {e}")
        raise HTTPException(status_code=500, detail="获取信息配置失败")


@system.post("/info/reload", response_model=InfoReloadResponse, response_model_exclude_unset=True)
async def reload_info_config(current_user: User = Depends(get_admin_user)):
    """重新加载信息配置"""
    try:
        config = await load_info_config()
        return {"success": True, "message": "配置重新加载成功", "data": config}
    except Exception as e:
        logger.error(f"重新加载信息配置失败: {e}")
        raise HTTPException(status_code=500, detail="重新加载信息配置失败")


# =============================================================================
# === 通用配置项与 OCR 分组 ===
# =============================================================================


class ConfigOptionValuePayload(BaseModel):
    """管理员可更新的通用配置值。"""

    value: dict


@system.get("/config/options", response_model=ConfigOptionsResponse, response_model_exclude_unset=True)
async def get_config_options(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """返回系统定义的通用配置表单和值。"""

    from ars.config.options import list_options, serialize_option

    return {"options": [serialize_option(record) for record in await list_options(db)]}


@system.put("/config/options/{key}", response_model=ConfigOptionResponse, response_model_exclude_unset=True)
async def put_config_option(
    key: str,
    payload: ConfigOptionValuePayload,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """保存一个通用配置项的 JSON 值。"""

    from ars.config.options import serialize_option, update_option_value

    try:
        record = await update_option_value(db, key, payload.value, current_user.username)
        if record is None:
            raise HTTPException(status_code=404, detail=f"配置项不存在: {key}")
        await db.commit()
        await invalidate_option_cache(key)
        await db.refresh(record)
        return {"option": serialize_option(record)}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@system.get("/ocr/options", response_model=OcrOptionsResponse, response_model_exclude_unset=True)
async def get_ocr_engine_options(
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    """返回所有代码支持的 OCR 方法和默认项。"""

    from ars.services.ocr_service import get_ocr_options

    return await get_ocr_options(db)


@system.get("/ocr/health", response_model=OcrHealthResponse, response_model_exclude_unset=True)
async def get_ocr_health(
    current_user: User = Depends(get_required_user),
    db: AsyncSession = Depends(get_db),
):
    """供登录用户使用当前有效配置检查全部 OCR 方法。"""

    from ars.services.ocr_service import check_all_ocr_health

    return {"health": await check_all_ocr_health(db)}
