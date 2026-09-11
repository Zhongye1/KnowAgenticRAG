"""模型供应商 DTO（ragf-design D4/D14）。"""

from datetime import datetime
from typing import Any, Literal

from pydantic import ConfigDict, Field

from backend.src.app.model_provider.model.provider import PROVIDER_ID_PATTERN
from backend.src.common.schema import SchemaBase

ProviderType = Literal['openai', 'dashscope']
ModelType = Literal['chat', 'embedding', 'rerank']


class ModelItemParam(SchemaBase):
    """provider 下已启用模型项"""

    model_config = ConfigDict(extra='forbid')

    id: str = Field(min_length=1, max_length=200, description='模型 id（spec 的后半段）')
    type: ModelType = Field(description='模型用途')
    display_name: str | None = Field(None, description='展示名称（缺省用 id）')
    dimension: int | None = Field(None, description='Embedding 维度')
    batch_size: int | None = Field(None, ge=1, description='Embedding 批大小（模型级覆盖）')
    extra: dict[str, Any] = Field(default_factory=dict, description='模型级扩展（如 rerank_protocol）')


class ModelProviderCreateParam(SchemaBase):
    """创建模型供应商参数"""

    provider_id: str = Field(pattern=PROVIDER_ID_PATTERN.pattern, max_length=100, description='供应商稳定标识')
    display_name: str = Field(min_length=1, max_length=128, description='展示名称')
    provider_type: ProviderType = Field('openai', description='适配类型')
    base_url: str = Field('', max_length=500, description='API 基础 URL')
    embedding_base_url: str | None = Field(None, max_length=500, description='Embedding 请求 URL')
    rerank_base_url: str | None = Field(None, max_length=500, description='Rerank 请求 URL')
    api_key: str | None = Field(None, description='API Key（为空回退 api_key_env 指定的环境变量）')
    api_key_env: str | None = Field(None, description='API Key 环境变量名')
    capabilities: list[str] = Field(default_factory=list, description='能力：chat/embedding/rerank')
    enabled_models: list[ModelItemParam] = Field(default_factory=list, description='已启用模型')
    headers_json: dict[str, Any] = Field(default_factory=dict, description='额外请求头')
    extra_json: dict[str, Any] = Field(default_factory=dict, description='扩展配置')
    is_enabled: bool = Field(True, description='是否启用')


class ModelProviderUpdateParam(SchemaBase):
    """更新模型供应商参数（全部可选，provider_id 不可改）"""

    display_name: str | None = None
    provider_type: ProviderType | None = None
    base_url: str | None = Field(None, max_length=500)
    embedding_base_url: str | None = Field(None, max_length=500)
    rerank_base_url: str | None = Field(None, max_length=500)
    api_key: str | None = None
    api_key_env: str | None = None
    capabilities: list[str] | None = None
    enabled_models: list[ModelItemParam] | None = None
    headers_json: dict[str, Any] | None = None
    extra_json: dict[str, Any] | None = None
    is_enabled: bool | None = None


class ModelProviderDetail(SchemaBase):
    """模型供应商详情（含已启用模型）"""

    model_config = ConfigDict(from_attributes=True)

    provider_id: str
    display_name: str
    provider_type: str
    base_url: str
    embedding_base_url: str | None = None
    rerank_base_url: str | None = None
    api_key_env: str | None = None
    api_key_set: bool = Field(description='是否可用凭据：api_key / api_key_env（不回显原文）')
    capabilities: list[str] = Field(default_factory=list)
    enabled_models: list[dict[str, Any]] = Field(default_factory=list)
    headers_json: dict[str, Any] = Field(default_factory=dict)
    extra_json: dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool = True
    is_builtin: bool = False
    created_time: datetime
    updated_time: datetime | None = None


class ProviderConnectivityParam(SchemaBase):
    """连通性测试参数"""

    spec: str = Field(description='模型 spec（provider_id:model_id）')


class ProviderConnectivityResult(SchemaBase):
    """连通性测试结果"""

    spec: str
    status: Literal['available', 'unavailable', 'error']
    message: str = ''
    dimension: int | None = None
