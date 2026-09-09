# Naming Conventions

## File and Directory Naming

All lowercase, separated by underscores.

- `crud_user.py`
- `user_service.py`

## Class Naming

All PascalCase:

```python
class UserService:
    ...


class CRUDUser:
    ...


class User:
    ...
```

## Schema Naming And Definition Order

Following these naming conventions:

| Type                   | Naming Pattern               | Example                     |
|------------------------|------------------------------|-----------------------------|
| Base Schema            | `XxxSchemaBase(SchemaBase)`  | `UserSchemaBase`            |
| API param              | `XxxParam()`                 | `UserParam`                 |
| Create param           | `CreateXxxParam()`           | `CreateUserParam`           |
| Update param           | `UpdateXxxParam()`           | `UpdateUserParam`           |
| Batch delete param     | `DeleteXxxParam()`           | `DeleteUserParam`           |
| Get details            | `GetXxxDetail()`             | `GetUserDetail`             |
| Get details (join)     | `GetXxxWithJoinDetail()`     | `GetUserWithJoinDetail`     |
| Get details (relation) | `GetXxxWithRelationDetail()` | `GetUserWithRelationDetail` |
| Get tree               | `GetXxxTree()`               | `GetMenuTree`               |

## API Function Naming And Definition Order

Lowercase with underscores, paginated lists use `_paginated` suffix:

| Operation      | Naming Pattern       | Example               |
|----------------|----------------------|-----------------------|
| Get all        | `get_all_xxxs`       | `get_all_users`       |
| Paginated list | `get_xxxs_paginated` | `get_users_paginated` |
| Get details    | `get_xxx`            | `get_user`            |
| Create         | `create_xxx`         | `create_user`         |
| Update         | `update_xxx`         | `update_user`         |
| Delete         | `delete_xxx`         | `delete_user`         |
| Batch delete   | `delete_xxxs`        | `delete_users`        |

## Service Method Naming And Definition Order

Following these naming conventions:

| Method       | Purpose              |
|--------------|----------------------|
| `get_all()`  | Get all              |
| `get()`      | Get details          |
| `get_list()` | Get list (paginated) |
| `create()`   | Create               |
| `update()`   | Update               |
| `delete()`   | Delete               |

## CRUD Method Naming And Definition Order

Following these naming conventions:

| Method                | Purpose                       |
|-----------------------|-------------------------------|
| `get()`               | Get/query details             |
| `get_by_xxx()`        | Get/query details by xxx      |
| `get_select()`        | Get/query list expression     |
| `get_list()`          | Get/query list                |
| `get_all()`           | Get/query all                 |
| `get_with_join()`     | Join query (join)             |
| `get_with_relation()` | Relation query (relationship) |
| `get_children()`      | Sub-query                     |
| `create()`            | Create                        |
| `update()`            | Update                        |
| `delete()`            | Delete                        |
