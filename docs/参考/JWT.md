编写了 JWT 授权中间件，使其可以在每次请求发起时，能够实现自动授权，并且还使用 Redis 和 Rust
库对用户信息进行缓存和解析，使其性能影响尽可能降到最低

## 接口鉴权

在文件 `backend/common/security/jwt.py` 中，包含以下代码

```python
# JWT dependency injection
DependsJwtAuth = Depends(HTTPBearer())
```

通过在接口函数中添加此依赖实现 JWT 快速校验，它可以帮助检查请求头中是否包含 Bearer Token，使用方式参考如下：

```python{1}
@router.get('/hello', summary='你好', dependencies=[DependsJwtAuth])
async def hello():
    ...
```

## Token

内置 token 授权方式遵循 [rfc6750](https://datatracker.ietf.org/doc/html/rfc6750)

## Swagger 登录

这是一种快捷的授权方式，仅用于调试目的，在服务启动后，进入 Swagger 文档，可通过此调试接口快速获取 token（无需验证码）

## 验证码登录

可以通过此方式获取 token，在大多数情况下，这更适用于配合前端实现登录授权

使用 [fast\_captcha](https://github.com/wu-clan/fast-captcha) 生成 base64 验证码，然后通过接口进行数据返回；您可以通过在线
base64 转图片或配合前端项目将其转为图片进行预览

### 授权流程

```sequence 验证码登录逻辑
actor 客户端
客户端 ->> 路由: GET<br/>/api/v1/auth/captcha
路由 ->> 频率限制器: 校验请求频率
频率限制器 -->> 路由: 允许
路由 ->> fast_captcha: 生成随机验证码
fast_captcha ->> Redis: 缓存验证码
客户端 ->> 路由: POST<br/>/api/v1/auth/login
路由 ->> 频率限制器: 校验请求频率
频率限制器 -->> 路由: 允许
路由 ->> 用户名: 校验用户名是否在系统中存在
用户名 -->> 路由: 通过
路由 ->> 验证码: 校验验证码（缓存和图片内容）
验证码 -->> 路由: 通过
路由 ->> Token: 生成 Token
Token -->> 客户端: 成功
```
