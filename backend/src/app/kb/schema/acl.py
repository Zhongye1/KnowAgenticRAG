"""RAG ACL DTO（agent-layer spec ACL 设计 §3/§8）。"""

from pydantic import Field, field_validator

from backend.src.common.schema import SchemaBase

VISIBILITIES = frozenset({'public', 'restricted', 'private'})


class KBAclDetail(SchemaBase):
    """KB 级 ACL 视图"""

    kb_name: str = Field(description='知识库标识')
    group_ids: list[str] = Field(default_factory=list, description='已授权组ID列表')


class KBAclUpdateParam(SchemaBase):
    """KB 级 ACL 更新参数（全量替换语义）"""

    group_ids: list[str] = Field(default_factory=list, description='授权组ID列表（空=仅本人可见语义恢复默认）')

    @field_validator('group_ids', mode='after')
    @classmethod
    def _dedupe(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(item.strip() for item in value if item.strip()))


class DocAclDetail(SchemaBase):
    """文档级 ACL 视图"""

    document_id: str = Field(description='文档ID')
    kb_name: str = Field(description='知识库标识')
    visibility: str = Field(description='可见性（public/restricted/private）')
    owner_id: str | None = Field(default=None, description='文档所有者')
    group_ids: list[str] = Field(default_factory=list, description='已授权组ID列表')


class DocAclUpdateParam(SchemaBase):
    """文档级 ACL 更新参数（None=保持不变；group_ids 提供即全量替换）"""

    visibility: str | None = Field(None, description='可见性（public/restricted/private）')
    group_ids: list[str] | None = Field(None, description='授权组ID列表（None=不变，提供即全量替换）')

    @field_validator('visibility')
    @classmethod
    def _check_visibility(cls, value: str | None) -> str | None:
        if value is not None and value not in VISIBILITIES:
            raise ValueError(f'visibility 必须是 {sorted(VISIBILITIES)} 之一')
        return value

    @field_validator('group_ids', mode='after')
    @classmethod
    def _dedupe(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value
        return list(dict.fromkeys(item.strip() for item in value if item.strip()))
