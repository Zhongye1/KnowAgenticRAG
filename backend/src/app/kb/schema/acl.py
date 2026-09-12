"""RAG ACL DTO v2（kb-ownership-and-acl-v2 spec §4）。

条目化授权：主体 (principal_type, principal_id) + 权限级别 perm + effect + expires_at。
KB 级允许全部主体类型；文档级因 Milvus 镜像可表达性约束只接受 user/dept 的 allow 条目。
"""

from datetime import datetime

from pydantic import Field, field_validator, model_validator

from backend.src.common.schema import SchemaBase

VISIBILITIES = frozenset({'public', 'restricted', 'private'})

# 主体类型（spec §4.2；group 首版预留、写路径暂不放开）
PRINCIPAL_TYPES = frozenset({'user', 'role', 'dept', 'group'})
# 文档级主体子集：Milvus 标量镜像（owner_id/groups）只能表达 user/dept 的 allow 语义
DOC_PRINCIPAL_TYPES = frozenset({'user', 'dept'})
# 权限级别（spec §4.3，序数即大小：owner > manage > contribute > read）
PERM_ORDER: dict[str, int] = {'read': 0, 'contribute': 1, 'manage': 2, 'owner': 3}
PERMS = frozenset(PERM_ORDER)
EFFECTS = frozenset({'allow', 'deny'})


class AclEntryBase(SchemaBase):
    """ACL 条目公共字段"""

    principal_type: str = Field(default='dept', max_length=16, description='主体类型（user/role/dept/group）')
    principal_id: str = Field(max_length=64, description='主体 ID（sys_user.id / sys_role.id / sys_dept.id）')
    perm: str = Field(default='read', max_length=16, description='权限级别（owner/manage/contribute/read）')
    effect: str = Field(default='allow', max_length=8, description='allow/deny（deny 优先于一切 allow）')
    expires_at: datetime | None = Field(default=None, description='过期时间（NULL=永久）')

    @field_validator('principal_type')
    @classmethod
    def _check_principal_type(cls, value: str) -> str:
        if value not in PRINCIPAL_TYPES:
            raise ValueError(f'principal_type 必须是 {sorted(PRINCIPAL_TYPES)} 之一')
        return value

    @field_validator('principal_id')
    @classmethod
    def _strip_principal_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError('principal_id 不能为空')
        return value

    @field_validator('perm')
    @classmethod
    def _check_perm(cls, value: str) -> str:
        if value not in PERMS:
            raise ValueError(f'perm 必须是 {sorted(PERMS)} 之一')
        return value

    @field_validator('effect')
    @classmethod
    def _check_effect(cls, value: str) -> str:
        if value not in EFFECTS:
            raise ValueError(f'effect 必须是 {sorted(EFFECTS)} 之一')
        return value


class KBAclEntry(AclEntryBase):
    """KB 级 ACL 条目（全部主体类型可用）"""


class DocAclEntry(AclEntryBase):
    """文档级 ACL 条目（镜像可表达性约束：user/dept + allow + 永久）"""

    @field_validator('principal_type')
    @classmethod
    def _check_doc_principal_type(cls, value: str) -> str:
        if value not in DOC_PRINCIPAL_TYPES:
            raise ValueError(f'文档级 ACL 主体类型只支持 {sorted(DOC_PRINCIPAL_TYPES)}（Milvus 镜像可表达性约束）')
        return value

    @field_validator('perm')
    @classmethod
    def _check_doc_perm(cls, value: str) -> str:
        if value != 'read':
            raise ValueError('文档级 ACL 无级别语义，perm 恒为 read')
        return value

    @model_validator(mode='after')
    def _check_doc_effect_and_expiry(self) -> 'DocAclEntry':
        if self.effect != 'allow':
            raise ValueError('文档级 ACL 不支持 deny（deny 无法在 Milvus 召回内下推，只在 KB 级表达）')
        if self.expires_at is not None:
            raise ValueError('文档级 ACL 不支持 expires_at（临时授权只在 KB 级表达）')
        return self


class KBAclDetail(SchemaBase):
    """KB 级 ACL 视图"""

    kb_name: str = Field(description='知识库标识')
    entries: list[KBAclEntry] = Field(default_factory=list, description='授权条目列表')


class KBAclUpdateParam(SchemaBase):
    """KB 级 ACL 更新参数（entries 全量替换语义）"""

    entries: list[KBAclEntry] = Field(default_factory=list, description='授权条目（空=回收全部授权）')

    @model_validator(mode='after')
    def _dedupe(self) -> 'KBAclUpdateParam':
        seen: set[tuple[str, str]] = set()
        deduped: list[KBAclEntry] = []
        for entry in self.entries:
            key = (entry.principal_type, entry.principal_id)
            if key not in seen:
                seen.add(key)
                deduped.append(entry)
        self.entries = deduped
        return self


class DocAclDetail(SchemaBase):
    """文档级 ACL 视图"""

    document_id: str = Field(description='文档ID')
    kb_name: str = Field(description='知识库标识')
    visibility: str = Field(description='可见性（public/restricted/private）')
    owner_id: str | None = Field(default=None, description='文档所有者')
    entries: list[DocAclEntry] = Field(default_factory=list, description='授权条目列表')


class DocAclUpdateParam(SchemaBase):
    """文档级 ACL 更新参数（None=保持不变；entries 提供即全量替换）"""

    visibility: str | None = Field(default=None, description='可见性（public/restricted/private）')
    entries: list[DocAclEntry] | None = Field(default=None, description='授权条目（None=不变，提供即全量替换）')

    @field_validator('visibility')
    @classmethod
    def _check_visibility(cls, value: str | None) -> str | None:
        if value is not None and value not in VISIBILITIES:
            raise ValueError(f'visibility 必须是 {sorted(VISIBILITIES)} 之一')
        return value

    @model_validator(mode='after')
    def _dedupe(self) -> 'DocAclUpdateParam':
        if self.entries is None:
            return self
        seen: set[tuple[str, str]] = set()
        deduped: list[DocAclEntry] = []
        for entry in self.entries:
            key = (entry.principal_type, entry.principal_id)
            if key not in seen:
                seen.add(key)
                deduped.append(entry)
        self.entries = deduped
        return self
