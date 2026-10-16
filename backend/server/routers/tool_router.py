from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ars.agents.toolkits.service import get_tool_metadata
from server.utils.auth_middleware import get_required_user
from ars.storage.postgres.models_business import User

tools = APIRouter(prefix="/system/tools", tags=["tools"])


class ToolArgItem(BaseModel):
    """工具单个入参的描述。"""

    name: str
    type: str
    description: str


class ToolItem(BaseModel):
    """工具元数据条目；字段对齐 `get_tool_metadata` 装配出的形状。

    `args` 是拍平后的说明（名称/类型/描述），够渲染一行；`args_schema` 是工具自身声明的完整
    JSON Schema，调用方据此判断必填、枚举与嵌套结构。
    """

    slug: str
    name: str
    description: str
    metadata: dict[str, Any]
    args: list[ToolArgItem]
    args_schema: dict[str, Any]
    category: str
    tags: list[str]
    config_guide: str


class ToolListResponse(BaseModel):
    """工具列表响应。"""

    success: bool
    data: list[ToolItem]


class ToolOptionItem(BaseModel):
    """工具下拉框选项。"""

    label: str
    value: str


class ToolOptionsResponse(BaseModel):
    """工具选项响应。"""

    success: bool
    data: list[ToolOptionItem]


@tools.get("", response_model=ToolListResponse, response_model_exclude_unset=True)
async def list_tools(
    category: str = None,
    user: User = Depends(get_required_user),
):
    """获取工具列表"""
    return {"success": True, "data": get_tool_metadata(category)}


@tools.get("/options", response_model=ToolOptionsResponse, response_model_exclude_unset=True)
async def get_tool_options(
    user: User = Depends(get_required_user),
):
    """获取工具选项（前端下拉框用）"""
    all_tools = get_tool_metadata()
    return {"success": True, "data": [{"label": t["name"], "value": t["slug"]} for t in all_tools]}
