# Database Model Standards

## Model Base Class

- Explicitly specify table name (`__tablename__`)
- Primary key must be explicitly defined

```python
from sqlalchemy.orm import Mapped, mapped_column
from backend.common.model import Base, id_key


class MyModel(Base):
    """模型表"""

    __tablename__ = 'my_model'

    id: Mapped[id_key] = mapped_column(init=False)
    name: Mapped[str] = mapped_column(comment='名称')
    status: Mapped[int] = mapped_column(default=1, comment='状态')
```

## Field Types

```python
from datetime import datetime

import sqlalchemy as sa
from backend.common.model import TimeZone, UniversalText
```

**String (common lengths: 32, 64, 128, 256, 512)**

```python
name: Mapped[str] = mapped_column(sa.String(64), comment='名称')
```

**Nullable string**

```python
email: Mapped[str | None] = mapped_column(sa.String(256), default=None, comment='邮箱')
```

**Integer**

```python
status: Mapped[int] = mapped_column(default=1, comment='状态')
```

**Boolean**

```python
is_active: Mapped[bool] = mapped_column(default=True, comment='是否激活')
```

**Datetime (timezone compatible)**

```python
event_time: Mapped[datetime] = mapped_column(TimeZone, comment='事件时间')
```

**Long text (MySQL/PostgreSQL compatible)**

```python
content: Mapped[str] = mapped_column(UniversalText, comment='内容')
```

**Unique index**

```python
username: Mapped[str] = mapped_column(sa.String(64), unique=True, index=True, comment='用户名')
```

## Primary Key Modes

Configured via `DATABASE_PK_MODE`:

- **autoincrement**: Auto-increment ID (default)
- **snowflake**: Snowflake algorithm ID

> ⚠️ **Warning**: Do not arbitrarily switch primary key modes, otherwise it will cause fatal issues!

## Database Migration

**Generate migration script**

```bash
fba alembic revision --autogenerate -m "描述信息"
```

**Execute migration**

```bash
fba alembic upgrade head
```

**Rollback**

```bash
fba alembic downgrade -1
```

## Complete Example

```python
from datetime import datetime

import sqlalchemy as sa

from sqlalchemy.orm import Mapped, mapped_column

from backend.common.model import Base, id_key, TimeZone, UniversalText


class Article(Base):
    """文章表"""

    __tablename__ = 'sys_article'

    id: Mapped[id_key] = mapped_column(init=False)
    title: Mapped[str] = mapped_column(sa.String(256), comment='标题')
    content: Mapped[str] = mapped_column(UniversalText, comment='内容')
    author_id: Mapped[int] = mapped_column(sa.BigInteger, index=True, comment='作者ID')
    status: Mapped[int] = mapped_column(default=1, comment='状态(0草稿 1发布)')
    published_at: Mapped[datetime | None] = mapped_column(TimeZone, default=None, comment='发布时间')
    view_count: Mapped[int] = mapped_column(default=0, comment='浏览次数')
```
