
通用模型位于 `backend/src/common/model.py` 中

## 主键

通过手动定义的方式进行主键声明

### 自增 ID

```python
# 通用 Mapped 类型主键, 需手动添加，参考以下使用方式
# MappedBase -> id: Mapped[id_key]
# DataClassBase && Base -> id: Mapped[id_key] = mapped_column(init=False)
id_key = Annotated[
    int,
    mapped_column(
        BigInteger,
        primary_key=True,
        unique=True,
        index=True,
        autoincrement=True,
        sort_order=-999,
        comment='主键 ID',
    ),
]
```

### 雪花 ID

[**切换主键**](pk.md){.read-more}

## Mixin 类

[Mixin](https://en.wikipedia.org/wiki/Mixin) 是一种面向对象编程概念, 使结构变得更加清晰

### 操作人

用于集成操作人信息到数据库表

::: warning
在 fba 中，并没有默认集成操作人员信息，但是我们提供了非常简易的集成方式

[**操作人博客**](../../blog/operator.md){.read-more}
:::

### 日期时间

用于集成日期时间到数据库表，已集成在 [Base](#base-基类) 基类中

```python
class DateTimeMixin(MappedAsDataclass):
    """日期时间 Mixin 数据类"""

    created_time: Mapped[datetime] = mapped_column(
        TimeZone, init=False, default_factory=timezone.now, sort_order=999, comment='创建时间'
    )
    updated_time: Mapped[datetime | None] = mapped_column(
        TimeZone, init=False, onupdate=timezone.now, sort_order=999, comment='更新时间'
    )
```

### 逻辑删除

用于集成逻辑删除标记到数据库表，已集成在 [Base](#base-基类) 基类中

```python
class LogicalDeleteMixin(MappedAsDataclass):
    """逻辑删除 Mixin 数据类"""

    deleted: Mapped[int] = mapped_column(
        BigInteger,
        init=False,
        default=0,
        server_default='0',
        sort_order=999,
        comment='是否已删除（0：否；id：是）',
    )
    deleted_time: Mapped[datetime | None] = mapped_column(
        TimeZone,
        init=False,
        default=None,
        sort_order=999,
        comment='删除时间',
    )
```

::: warning
逻辑删除不只是给模型添加字段，还需要同步处理 CRUD 查询条件、删除操作、唯一约束、关联查询等内容

[**逻辑删除博客**](../../blog/logical-delete.md){.read-more}
:::

## 数据类基类

声明性数据类基类，它将带有数据类集成，允许使用更高级配置，==但未集成日期时间=={.note}

了解 [MappedAsDataclass](https://docs.sqlalchemy.org/en/20/orm/dataclasses.html#orm-declarative-native-dataclasses)

```python
class DataClassBase(MappedAsDataclass, MappedBase):

    __abstract__ = True
```

## Base 基类

声明性数据类基类，带有数据类、日期时间和逻辑删除集成

```python
class Base(DataClassBase, DateTimeMixin, LogicalDeleteMixin):

    __abstract__ = True
```

## 字符串类型

对于长文本，fba 提供了内置的 PostgreSQL 和 MySQL 兼容类型 `UniversalText`

对于常见文本，fba 通常使用以下长度单位：`32`、`64`、`128`、`256`、`512`
