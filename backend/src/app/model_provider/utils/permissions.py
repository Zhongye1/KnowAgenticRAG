"""模型供应商模块 RBAC 权限码（Admin 菜单 seed 同源）。

单一来源：HTTP 路由（``RequestPermission``）与 SQL seed（``sys_menu.perms``）
共用本模块常量。读操作（列表/详情）仅要求登录态——普通用户选择模型时需要
读取可用供应商；写操作（创建/更新/删除/连通性测试）要求功能权限。
"""

from __future__ import annotations

__all__ = [
    'MODEL_PROVIDER_ADD',
    'MODEL_PROVIDER_DEL',
    'MODEL_PROVIDER_EDIT',
]

MODEL_PROVIDER_ADD = 'sys:model-provider:add'  # 创建模型供应商
MODEL_PROVIDER_EDIT = 'sys:model-provider:edit'  # 更新模型供应商 / 连通性测试
MODEL_PROVIDER_DEL = 'sys:model-provider:del'  # 删除模型供应商
