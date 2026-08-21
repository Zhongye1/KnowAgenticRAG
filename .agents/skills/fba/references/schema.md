# Schema Reference

## Base Class Usage

All Schemas should inherit from `SchemaBase`:

```python
class UserSchemaBase(SchemaBase):
    """用户基础模型"""

    username: str
    email: str | None = None
```

## Field Definition

### Required Fields

It is **not recommended** to set the default value of required fields to `...`.

```python
username: str = Field(description='用户名')
```

### description Parameter

It is **recommended** to add a `description` parameter to all fields, which is very useful for API documentation:

```python
class CreateUserParam(SchemaBase):
    username: str = Field(description='用户名')
    email: str | None = Field(None, description='邮箱')
    status: int = Field(default=1, description='状态(0禁用 1启用)')
```

### Optional Fields

Update params typically have all fields as optional:

```python
class UpdateUserParam(SchemaBase):
    username: str | None = Field(None, description='用户名')
    email: str | None = Field(None, description='邮箱')
    status: int | None = Field(None, description='状态')
```

## Complete Example

```python
from datetime import datetime

from pydantic import Field

from backend.common.enums import StatusType
from backend.common.schema import SchemaBase


class ArticleSchemaBase(SchemaBase):
    """文章基础模型"""

    title: str = Field(description='标题')
    content: str = Field(description='内容')
    status: StatusType = Field(description='状态')


class CreateArticleParam(ArticleSchemaBase):
    """创建文章参数"""


class UpdateArticleParam(SchemaBase):
    """更新文章参数"""

    title: str | None = Field(None, description='标题')
    content: str | None = Field(None, description='内容')
    status: StatusType | None = Field(None, description='状态')


class DeleteArticleParam(SchemaBase):
    """批量删除文章参数"""

    ids: list[int] = Field(description='文章 ID 列表')


class GetArticleDetail(ArticleSchemaBase):
    """文章详情响应"""

    id: int = Field(description='文章ID')
    created_time: datetime = Field(description='创建时间')
    updated_time: datetime | None = Field(None, description='更新时间')


class GetArticleWithAuthorDetail(GetArticleDetail):
    """文章详情响应（含作者信息）"""

    author_name: str = Field(description='作者名称')
```

## Camel Case Response

See `references/api.md` for details.
