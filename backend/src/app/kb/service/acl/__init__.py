"""ACL 领域服务（kb-ownership-and-acl-v2 spec §5.3）。

- entries.py：ACL 条目读写的领域语义（写路径 + Milvus 传播 + 审计追加）
- resolver.py：统一求值函数（Phase 2 落地）
- principals.py：主体展开（Phase 2 落地）
- scope.py：检索范围构建（Phase 3 自 retrieval 下沉）
"""
