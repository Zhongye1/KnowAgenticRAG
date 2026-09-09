"""RAG 模块 RBAC 权限码（agent-layer spec ACL 设计 §2.1；Admin 菜单 seed 同源）。

单一来源：HTTP 路由（``RequestPermission``）、MCP 工具面（``scp`` 权限点，
D30 不发明第二套权限模型）与 SQL seed（``sys_menu.perms``）共用本模块常量。
"""

from __future__ import annotations

__all__ = [
    'RAG_KB_CHAT',
    'RAG_KB_INGEST',
    'RAG_KB_LIST',
    'RAG_KB_MANAGE',
    'RAG_KB_READ',
    'RAG_KB_READ_SCOPES',
    'RAG_KB_SEARCH',
]

# 读动作
RAG_KB_LIST = 'rag:kb:list'  # KB 列表/详情/统计
RAG_KB_SEARCH = 'rag:kb:search'  # 同步检索
RAG_KB_READ = 'rag:kb:read'  # 文档片段/详情/下载（MCP read_document_chunks/get_document）
RAG_KB_CHAT = 'rag:kb:chat'  # 问答（SSE/带引用）

# 写动作
RAG_KB_INGEST = 'rag:kb:ingest'  # 上传/替换/重摄取
RAG_KB_MANAGE = 'rag:kb:manage'  # KB/文档管理 + ACL 配置 + 设 public

# MCP 只读工具面默认权限点集合（D30）
RAG_KB_READ_SCOPES = frozenset({RAG_KB_LIST, RAG_KB_SEARCH, RAG_KB_READ, RAG_KB_CHAT})
