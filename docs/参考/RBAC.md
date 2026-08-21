通过自定义依赖组件，实现了 RBAC 的轻松集成，它可以通过 FastAPI Depends 轻松集成

::: caution
自 v1.2.0 开始，默认 RBAC 已更换为【[角色菜单](#角色菜单)】，【[Casbin-RBAC](#casbin)】将作为外置插件进行分发
:::

## 角色菜单

要想实现此 RBAC 鉴权，需要进行以下配置

::: steps

1. 添加接口依赖

   只有在接口中添加以下依赖时，才能自动调用此鉴权方式

   ```py{5-6}
   @router.post(
       '',
       summary='xxx',
       dependencies=[
           Depends(RequestPermission('sys:api:add')),  # 通常为 xxx:xxx:xxx
           DependsRBAC,
       ],
   )
   ```

2. 在系统菜单中添加权限标识

   我们在接口依赖中可以看到 `sys:api:add` 之类的值，这些值正是对应着菜单中的权限标识字段，只有它们完全一致，并且用户拥有对应的菜单时，才可以获得相应的操作权限

:::

## Casbin

此方案是 Go 语言中比较流行的解决方案，它非常灵活，可以通过模型定义多种控制规则

要想实现此 RBAC 鉴权，请先 [获取插件](../../marketplace.md)，然后执行以下操作

::: steps

1. 安装插件

2. 启用鉴权

   修改 `backend/core/conf.py` 文件中的 `RBAC_ROLE_MENU_MODE` 为 `False`

:::

## 解耦

在实际项目开发中，不可能同时存在多种 RBAC 解决方案，您可以通过以下方式删除【角色菜单】集成

* 删除 `backend/common/security/permission.py` 文件中的 `RequestPermission` 类及所有类调用
* 删除 `backend/core/conf.py` 文件中的 `RBAC_ROLE_MENU_MODE` 和 `RBAC_ROLE_MENU_EXCLUDE`
* 删除 `backend/common/security/rbac.py` 文件中 `rbac_verify` 方法里面的 `if settings.RBAC_ROLE_MENU_MODE:`
  条件及相关代码
* 删除菜单 `perms` 列及其相关的 schema 字段和 SQL 脚本
* 删除菜单 `type` 列中的按钮类型及其按钮类型相关的代码逻辑和 SQL 脚本
