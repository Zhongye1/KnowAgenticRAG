# API Reference

## Route Structure

Routes in fba follow RESTful API conventions

```
backend
├── app
│   ├── xxx                           # Custom app (Contains sub-packages).
│   │   └── api
│   │       ├── v1
│   │       │   └── xxx               # Sub-package
│   │       │       ├── __init__.py   # Routes in the xxx.py file within this file are registered within the subpack.
│   │       │       ├── xxx.py
│   │       │       └── ...
│   │       ├── __init__.py
│   │       └── router.py             # Register the routes in the __init__.py files of all sub-packages within this file.
│   └── xxx                           # Custom app (No sub-packages are included).
│       └── api
│           ├── v1
│           │   ├── __init__.py       # Do nothing.
│           │   ├── xxx.py
│           │   └── ...
│           ├── __init__.py
│           └── router.py             # Register all routes from the xxx.py files within this file.
├── __init__.py
└── router.py                         # Register all routes in the router.py file under the app directory within this file.
```

### Route Import Rules

All API route parameters should be uniformly named `router`. When importing, always use `as` aliases to avoid conflicts:

```python
from backend.app.admin.api.v1.sys.user import router as user_router
```

### API Documentation Rules

- Add `summary` to every route.
- Use `description` only when it adds meaningful API behavior details.
- Keep route handlers thin: parse request data, declare dependencies, call Service, and return `response_base`.

### RESTful Route Conventions

```
GET    /api/v1/resources/all     # All (non-paginated)
GET    /api/v1/resources         # List (paginated)
GET    /api/v1/resources/{pk}    # Details
POST   /api/v1/resources         # Create
PUT    /api/v1/resources/{pk}    # Update
DELETE /api/v1/resources/{pk}    # Delete
DELETE /api/v1/resources         # Batch delete
```

## Database Transaction

### CurrentSession (Read-only Session)

Used for query operations:

```python
@router.get('/users')
async def get_all_users(db: CurrentSession) -> ResponseModel:
    data = await user_service.get_all(db=db)
    return response_base.success(data=data)
```

### CurrentSessionTransaction (Transaction Session)

Used for create/update/delete operations:

```python
@router.post('/users')
async def create_user(db: CurrentSessionTransaction, obj: CreateApiParam) -> ResponseModel:
    await user_service.create(db=db, obj=obj)
    return response_base.success()
```

### Manual Transaction (begin)

Used for scenarios that need to start a transaction at any point:

```python
async with async_db_session.begin() as db:
    ...
```

---

## Response Standards

### Response Models

**No data response**

```python
@router.post('/users')
async def create_user(db: CurrentSessionTransaction, obj: CreateApiParam) -> ResponseModel:
    await user_service.create(db=db, obj=obj)
    return response_base.success()
```

**With data response**

```python
@router.get('/{pk}')
async def get_user(db: CurrentSession, pk: int) -> ResponseSchemaModel[GetApiDetail]:
    data = await user_service.get(db=db, pk=pk)
    return response_base.success(data=data)
```

### Response Methods

| Method                         | Purpose                                | Default Response                                           |
|--------------------------------|----------------------------------------|------------------------------------------------------------|
| `response_base.success()`      | Success response                       | `{"code": 200, "msg": "Request successful", "data": null}` |
| `response_base.fail()`         | Failure response                       | `{"code": 400, "msg": "Request error", "data": null}`      |
| `response_base.fast_success()` | High-performance response (large JSON) | Same as success, but skips Pydantic validation             |

### Camel Case Response

To automatically convert response data to lowerCamelCase (e.g., `created_time` → `createdTime`), modify
`backend/common/schema.py`:

```python
from pydantic.alias_generators import to_camel


class SchemaBase(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
    )
```

After configuration, response data will be automatically converted.

## Pagination

Normal paginated list routes should depend on `DependsPagination` and return `ResponseSchemaModel[PageData[XxxDetail]]`.

```python
@router.get(
    '',
    summary='Get users paginated',
    dependencies=[DependsPagination],
)
async def get_users_paginated(db: CurrentSession) -> ResponseSchemaModel[PageData[GetUserDetail]]:
    page_data = await user_service.get_list(db=db)
    return response_base.success(data=page_data)
```

In the Service layer, build or fetch a SQLAlchemy `Select` from CRUD and pass it to `paging_data(db, select)`.

Cursor pagination uses `DependsCursorPagination` and `CursorPageData[XxxDetail]` for infinite-scroll or conversation-like lists.

## JWT Authentication

### API Authentication

```python
@router.get('/users', summary='获取 API 列表', dependencies=[DependsJwtAuth])
async def get_users(db: CurrentSession) -> ResponseModel:
    ...
```

### Token Authorization Methods

The built-in token authorization in fba follows [RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750):

- **Swagger Login**: Quick authorization method, used for debugging only
- **Captcha Login**: Login authorization implemented with the frontend

---

## RBAC Permissions

### Role-Menu Mode (Default)

```python
@router.post(
    '/users',
    summary='创建 API',
    dependencies=[
        Depends(RequestPermission('sys:user:add')),
        DependsRBAC,
    ],
)
async def create_user(db: CurrentSessionTransaction, obj: CreateApiParam) -> ResponseModel:
    ...
```

### Permission Identifier Format

`module:resource:action`, for example:

- `sys:user:add` - Add user
- `sys:user:edit` - Edit user
- `sys:user:del` - Delete user

## Rate Limiting

**Single rule**: max 60 requests per minute

```python
from pyrate_limiter import Duration, Rate

from backend.utils.limiter import RateLimiter


@app.get(
    "/example", 
    dependencies=[Depends(RateLimiter(Rate(5, Duration.MINUTE)))]
)
async def example():
    ...
```

**Multi-rule compound rate limiting**: 10 per second + 100 per minute

```python
from pyrate_limiter import Duration, Rate

from backend.utils.limiter import RateLimiter


@app.post(
    "/heavy", 
    dependencies=[
        Depends(
            RateLimiter(
                Rate(10, Duration.SECOND),
                Rate(100, Duration.MINUTE),
            )
        )
    ]
)
async def heavy_endpoint():
    ...
```

## I18n

### Usage Syntax

Chain-style access to get field values from the language pack

```python
msg = t('response.success')
```

### Language Pack Location

`backend/locale` directory, supports `.json` and `.yaml/.yml` files

### Dynamic Switching

Automatically retrieves the `Accept-Language` parameter from the request header
