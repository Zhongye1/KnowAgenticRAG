# 注册与登录时序图

后端认证采用「MySQL 存身份 + Redis 存会话态」的双存储设计：注册只在 `sys_user` / `user_role` 落库、不发 token；登录把 refresh token 种进 httpOnly cookie、access token 放响应体，并把会话态写进 Redis；后续请求由中间件用 Bearer + Redis 缓存完成鉴权。

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant M as JwtAuthMiddleware
    participant R as Route (/auth/*)
    participant S as AuthService
    participant D as UserDAO
    participant DB as MySQL
    participant RD as Redis

    rect rgb(235,245,255)
    note over C,RD: 注册 POST /auth/register
    C->>R: POST /auth/register {username, password, email?}
    R->>S: register(db, obj)  [CurrentSessionTransaction]
    S->>D: get_by_username(username)
    D->>DB: SELECT sys_user WHERE username AND deleted=0
    DB-->>D: 用户 / 空
    S->>D: check_email(email)  (可选)
    D->>DB: SELECT sys_user WHERE email
    S->>D: add_by_register(obj)
    D->>DB: INSERT sys_user (bcrypt 哈希 + salt, is_staff=false)
    D->>DB: SELECT sys_role WHERE status=enable
    D->>DB: INSERT user_role(user_id, role_id)
    R->>S: get_userinfo(username)
    S->>D: get_join(关联 dept/role/menu)
    D->>DB: SELECT ... JOIN
    R-->>C: 200 {data: 用户信息}  （不发证、不种 cookie）
    end

    rect rgb(235,255,235)
    note over C,RD: 登录 POST /auth/login
    C->>R: POST /auth/login {username, password, captcha?}
    R->>S: login(db, response, obj)  [事务 + 限流 5/min]
    S->>RD: GET {LOGIN_CAPTCHA_REDIS_PREFIX}:uuid  (开验证码时)
    S->>D: user_verify(username, password)
    D->>DB: SELECT sys_user
    S->>S: password_verify(bcrypt) / check_status
    S->>D: update_login_time
    D->>DB: UPDATE sys_user
    S->>RD: SET TOKEN_REDIS_PREFIX:{uid}:{sid} + EXTRA_INFO
    S->>RD: SET refresh token
    S->>R: response.set_cookie(fba_refresh_token, httpOnly, 7d)
    S->>DB: INSERT sys_login_log  (BackgroundTasks)
    R-->>C: 200 {access_token, user}
    end

    rect rgb(255,245,235)
    note over C,RD: 后续请求鉴权
    C->>M: Authorization: Bearer <access_token>
    M->>RD: GET TOKEN_REDIS_PREFIX:{uid}:{sid}  (校验未吊销)
    M->>RD: GET JWT_USER_REDIS_PREFIX:{uid}  (用户缓存)
    alt 缓存未命中
        M->>D: get_current_user → get_join
        D->>DB: SELECT 用户 + 角色 + 菜单
        M->>RD: SET 用户 DTO 缓存
    end
    M->>R: request.user = GetUserInfoWithRelationDetail
    R-->>C: 业务数据
    end
```

## 涉及的数据存储

- **MySQL**：`sys_user`（身份/密码/状态）、`sys_role`、`user_role`（关联）、`sys_login_log`（登录日志）
- **Redis**：`TOKEN_REDIS_PREFIX`（token 吊销）、`TOKEN_EXTRA_INFO_REDIS_PREFIX`（token 附加信息）、`JWT_USER_REDIS_PREFIX`（用户 DTO 缓存）、`LOGIN_CAPTCHA_REDIS_PREFIX`（验证码）、登录失败计数
