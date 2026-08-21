当进行前后端项目联调或服务器部署时，通常会遇到跨域问题，只需进入 `backend/src/core/conf.py` 文件，修改
`CORS_ALLOWED_ORIGINS` 配置即可，就可以轻松解决 CORS 相关问题

## 本地

```py
CORS_ALLOWED_ORIGINS: list[str] = [
        'http://localhost:5173',  # 前端访问地址，末尾不带 '/'
    ]
```

## 服务器

::: code-tabs
@tab HTTP

```py
# [!code word:http]
CORS_ALLOWED_ORIGINS: list[str] = [
      'http://服务器ip:端口号',  # 前端访问地址，末尾不带 '/'，当端口号为 80 时，不要添加端口号
  ]
```

@tab  HTTPS

```py
# [!code word:https]
CORS_ALLOWED_ORIGINS: list[str] = [
      'https://域名',  # 前端访问地址，末尾不带 '/'
  ]
```

:::

## 局域网

此方式取决于前端项目是否配置了局域网服务

```py
CORS_ALLOWED_ORIGINS: list[str] = ['*']
```
