:::
编写 Service / CRUD 层时的命名、编码风格和架构参考，避免把业务逻辑下沉到 CRUD 或把查询细节散落到 API 层
:::

使用 sqlalchemy-crud-plus 作为数据库操作基类，自主构建的基于 SQLAlchemy 2.0 的高级异步 CRUD SDK，可适用于任何 FastAPI + SQLAlchemy 项目

## 函数命名
遵循以下命名规范：

* 获取/查询详情： `get()`
* 通过 xxx 获取/查询详情：`get_by_xxx()`
* 获取/查询列表表达式：`get_select()`
* 获取/查询列表：`get_list()`
* 获取/查询所有：`get_all()`
* 连接查询（join）：`get_with_join()`
* 关系查询（relationship）：`get_with_relation()`
* 子查询：`get_children()`
* 创建：`create()`
* 更新：`update()`
* 删除：`delete()`
