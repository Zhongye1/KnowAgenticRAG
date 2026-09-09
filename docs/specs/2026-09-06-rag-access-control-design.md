---
title: RAG 数据权限设计（ACL + Scope + 召回内过滤）
description: RBAC管动作权限（复用Admin），文档ACL管数据权限（RAG新增），两者在查询时join成检索范围，下推到向量库召回本身
status: 待实现
date: 2026-09-06
---

# RAG 数据权限设计（Spec）

## 0. 文档信息

| 项 | 内容 |
| --- | --- |
| 状态 | 待实现 |
| 日期 | 2026-09-06 |
| 范围 | 动作权限 × 数据权限两层模型、Scope构建、Milvus召回内过滤、ACL治理 |
| 前置依赖 | Admin RBAC（已实现）、KB模块（已实现）、Milvus检索（已实现） |
| 联动文档 | [2026-08-21-agentic-rag-系统设计.md](./2026-08-21-agentic-rag-系统设计.md)、[2026-09-05-agent-layer-and-mcp-design.md](./2026-09-05-agent-layer-and-mcp-design.md) |

## 1. 背景与目标

### 1.1 背景

当前系统存在两种权限需求：
- **动作权限**：用户能否执行 search/ingest/manage 操作
- **数据权限**：用户能看见哪些 KB、哪些文档

Admin 模块已实现完整的 RBAC（用户-角色-权限码），但只管"能不能做动作"，不管"能看见哪些数据"。RAG 场景下，不同组的用户可能访问同一个 KB，但只能看到自己有权限的文档。

### 1.2 目标

1. 建立两级数据权限模型（KB级 + 文档级）
2. 权限过滤发生在向量库召回内部（不是召回后过滤）
3. 过滤条件由服务端构造（客户端不可传入过滤语义）
4. kb_id 必须与授权范围求交（防 IDOR）
5. Agent/MCP/Chat 全程只见已授权内容

### 1.3 核心原则

> RBAC 管"能不能做动作"（Admin 已有，原样复用），文档 ACL 管"能看见哪些数据"（RAG 新增），两者在查询时被服务端 join 成一个"检索范围"，以过滤表达式下推到 Milvus/ES 的召回本身。

三条铁律：
1. **过滤发生在召回内部**（不是召回后过滤）
2. **过滤条件由服务端构造**（不是客户端传入）
3. **kb_id 必须与授权范围求交**（不是拿来就用）

## 2. 权限模型

### 2.1 两层权限架构

| 层 | 管什么 | 载体 | 变更位置 |
|---|---|---|---|
| **动作权限** | 能否 search/ingest/manage | Admin RBAC 码：`rag:kb:search` / `rag:kb:ingest` / `rag:kb:manage` | Admin 菜单配置（RAG 只注册权限码数据） |
| **粗数据权限** | 哪些 KB 可见 | KB 级 ACL：`kb_id → 组列表` | RAG 自己的表，KB owner 维护 |
| **细数据权限** | KB 内哪些文档可见 | 文档级 ACL：`visibility + groups[]` | RAG 自己的表，入库时打标 + 事后可改 |

### 2.2 文档可见性三档

| visibility | 语义 | 适用场景 |
|------------|------|---------|
| `public` | namespace 内所有人可见 | 公共知识库、官方文档 |
| `restricted` | 仅 `groups[]` 列出的组可见 | 部门专属文档、项目文档 |
| `private` | 仅 owner 可见 | 个人草稿、敏感文档 |

> **namespace 是硬边界**：跨 namespace 不通，`X-Plugin-Namespace` 头只能选择，不能穿越。

## 3. 数据结构

### 3.1 RAG 模块自有表（引用 Admin 组 ID，只读不反向写）

```sql
-- KB 级 ACL
CREATE TABLE rag_kb_acl (
    kb_id       VARCHAR(64) NOT NULL,
    group_id    VARCHAR(64) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (kb_id, group_id)
);

-- 文档级 ACL（归一化行，每行一个组）
CREATE TABLE rag_doc_acl (
    doc_id      VARCHAR(64) NOT NULL,
    group_id    VARCHAR(64) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (doc_id, group_id)
);

-- documents 表扩展字段
ALTER TABLE documents ADD COLUMN visibility VARCHAR(16) DEFAULT 'restricted';
ALTER TABLE documents ADD COLUMN owner_id VARCHAR(64);
```

### 3.2 Milvus 标量字段镜像

```python
schema.add_field("namespace",    DataType.VARCHAR, max_length=64, is_partition_key=True)
schema.add_field("kb_id",        DataType.VARCHAR, max_length=64)
schema.add_field("doc_id",       DataType.VARCHAR, max_length=64)
schema.add_field("doc_version",  DataType.INT64)
schema.add_field("visibility",   DataType.VARCHAR, max_length=16)
schema.add_field("groups",       DataType.ARRAY, element_type=DataType.VARCHAR, max_capacity=32)
schema.add_field("owner_id",     DataType.VARCHAR, max_length=64)

# 标量索引
collection.create_index("kb_id",    {"index_type": "INVERTED"})
collection.create_index("visibility", {"index_type": "INVERTED"})
collection.create_index("owner_id", {"index_type": "INVERTED"})
collection.create_index("groups",   {"index_type": "INVERTED"})
```

> **ACL 字段是 DB 为准、Milvus 为镜像**——和"Milvus 只是可重放索引层"一致。

## 4. Scope 构建

### 4.1 依赖链

```python
async def build_retrieval_scope(
    user: UserCtx = Depends(depends_jwt),
    _: None = Depends(depends_rbac("rag:kb:search")),
    namespace: str = Header(...),
) -> Scope:
    # 1. namespace 校验
    if namespace not in user.namespaces:
        raise HTTPException(403, detail="namespace not allowed")
    
    # 2. 展开用户组（本人 + 部门 + 祖先部门 + 交叉组）
    groups = await group_expander.expand(user)  # 缓存 30~60s
    
    # 3. KB 级 ACL
    allowed_kbs = await kb_acl.allowed_kbs(namespace, groups)  # 缓存
    
    return Scope(
        namespace=namespace,
        user_id=user.sub,
        groups=groups,
        allowed_kbs=allowed_kbs,
    )
```

### 4.2 Scope 对象

```python
@dataclass(frozen=True)
class Scope:
    namespace: str          # 租户域
    user_id: str            # 用户ID
    groups: list[str]       # 用户所属组（已展开）
    allowed_kbs: list[str]  # 可访问的 KB 列表
```

### 4.3 Scope → Milvus 表达式

```python
def to_milvus_expr(s: Scope) -> str:
    """生成 Milvus 过滤表达式（ID 白名单校验防注入）。"""
    # 白名单校验：只允许 [A-Za-z0-9_-]+
    _validate_ids(s.allowed_kbs)
    _validate_ids(s.groups)
    _validate_id(s.user_id)
    
    kbs = ",".join(f'"{k}"' for k in s.allowed_kbs)
    groups = ",".join(f'"{g}"' for g in s.groups)
    
    return (
        f'namespace == "{s.namespace}" and '
        f'kb_id in [{kbs}] and '
        f'(visibility == "public" or '
        f'owner_id == "{s.user_id}" or '
        f'array_contains_any(groups, [{groups}]))'
    )
```

## 5. Query 链路

### 5.1 检索流程

```
请求进入
  │
  ▼
DependsJwtAuth → 解析用户身份 (sub, namespaces)
  │
  ▼
DependsRBAC("rag:kb:search") → 校验动作权限
  │
  ▼
build_retrieval_scope() → 构建检索范围
  ├── 展开用户组（缓存 30-60s）
  ├── 查询 allowed_kbs（缓存）
  └── 返回 Scope
  │
  ▼
to_milvus_expr(scope) → 生成过滤表达式
  │
  ▼
Milvus hybrid_search(expr=expr)
  ├── dense 路：ANN + expr 过滤
  └── sparse 路：BM25 + expr 过滤
  │
  ▼
CrossEncoder rerank → 重排（候选已全部授权）
  │
  ▼
返回结果（用户全程无感知权限过滤）
```

### 5.2 检索代码

```python
expr = to_milvus_expr(scope)

# 两路召回都带过滤
results = client.hybrid_search(
    reqs=[
        AnnSearchRequest(
            data=[q_dense],
            anns_field="dense",
            param={"metric_type": "IP", "params": {"ef": 64}},
            expr=expr,  # dense 带过滤
            limit=50,
        ),
        AnnSearchRequest(
            data=[query_text],
            anns_field="sparse",
            param={"metric_type": "BM25"},
            expr=expr,  # BM25 同样带过滤
            limit=50,
        ),
    ],
    ranker=RRFRanker(60),
    limit=20,  # → CrossEncoder（候选已全部授权）
)
```

### 5.3 ES 双写路（如果启用）

```json
{
  "bool": {
    "filter": [
      {"term": {"namespace": "core"}},
      {"terms": {"kb_id": ["kb1", "kb2"]}},
      {
        "should": [
          {"term": {"visibility": "public"}},
          {"term": {"owner_id": "user123"}},
          {"terms": {"groups": ["group1", "group2"]}}
        ],
        "minimum_should_match": 1
      }
    ]
  }
}
```

## 6. MCP 集成

MCP 侧完全一致：多凭证中间件解析出的 `UserContext` 走同一个 `build_retrieval_scope`。

```python
# MCP 工具调用
@mcp_tool("search_knowledge")
async def search_knowledge(
    scope: Scope = Depends(build_retrieval_scope),  # 同一个 scope
    query: str = ...,
    kb_names: list[str] = ...,
):
    # kb_names 与 scope.allowed_kbs 求交
    allowed = set(kb_names) & set(scope.allowed_kbs)
    if not allowed:
        raise ToolError(code="PERMISSION_DENIED", msg="无权访问这些KB")
    
    # 检索
    return await retrieval_service.search_multi(
        kb_names=list(allowed),
        query_text=query,
        scope=scope,  # scope 下推到 Milvus
    )
```

> **外部 CLI 的 PAT scope 天然更窄（只读）**，权限语义无差别。

## 7. 为什么必须"召回内过滤"

### 7.1 后过滤的问题

```
错误做法：
  Milvus 召回 top50 → 过滤掉无权的 → 可能剩 0 条
  → 用户看到"知识库没有相关内容"
  → 实际是"你看不见"，但用户无法区分

正确做法：
  Milvus 召回时 expr 已包含权限条件
  → 候选池本身只含授权 chunk
  → 结果一定有数据（如果用户有权限的文档存在）
```

### 7.2 安全性

| 风险 | 后过滤 | 召回内过滤 |
|------|--------|-----------|
| 权限泄漏 | 前端可能展示无权内容 | Milvus 层面不存在无权数据 |
| Prompt Injection | Agent 可能被诱导传宽条件 | scope 服务端构造，不可信输入无法影响 |
| IDOR | kb_id 直接使用 | kb_id 与 allowed_kbs 求交 |

### 7.3 性能

- **namespace 用 partition key**：先按租户剪枝
- **kb_id + visibility + groups 建索引**：过滤高效
- **HNSW 退化风险**：过滤选择性过高时（某组只有几十条文档），Milvus 2.5+ 的迭代过滤检索有优化
- **真出现退化**：按组分区 / 独立 collection，按需评估

## 8. ACL 治理

### 8.1 入库打标规则

```python
# ingestion API 校验，不信任请求里的任意 groups
def validate_acl上传者设置(
    visibility: str,
    groups: list[str],
    uploader: UserCtx,
    kb: KnowledgeBase,
) -> tuple[str, list[str]]:
    """校验并归一化 ACL 设置。"""
    # 默认：restricted + 上传者所在组（最保守）
    if visibility is None:
        visibility = "restricted"
        groups = uploader.groups[:1]  # 取第一个组
    
    # 上传者可设的 groups 必须 ⊆ 自己可管理的组
    manageable = await get_manageable_groups(uploader)
    if not set(groups).issubset(set(manageable)):
        raise HTTPException(403, detail="groups 超出可管理范围")
    
    # 设 public 需要 rag:kb:manage 权限
    if visibility == "public":
        if not has_perm(uploader, "rag:kb:manage"):
            raise HTTPException(403, detail="设 public 需要 rag:kb:manage 权限")
    
    return visibility, groups
```

### 8.2 ACL 变更传播

```
改文档 ACL
  │
  ▼
更新 DB (rag_doc_acl + documents.visibility)
  │
  ▼
Milvus 按主键 upsert 同一批 chunk
  ├── 向量从 source-of-truth 复用（不需要重嵌入）
  └── 标量字段更新
  │
  ▼
Bounded 一致性下秒级生效
```

> **不需要重嵌入**：ACL 变更只改标量字段，向量不变。

### 8.3 组员变动

```
组员变动（增/删/调岗）
  │
  ▼
只影响查询时的 scope 展开
  ├── 靠 30~60s 缓存 TTL 收敛
  └── 不动索引
```

> **部门树调整**：用不可变组 ID + 查询期展开，天然跟随。

## 9. Chat 模块注意事项

```python
# ❌ 错误：会话创建时固化 scope
session = create_session(user, scope)  # scope 被固化
# 后续查询用固化 scope → 权限回收在一个会话里不生效

# ✅ 正确：每轮 query 重新解析 scope
async def chat(kb_name: str, query: str, session_id: str):
    scope = await build_retrieval_scope()  # 每轮重新构建
    # 权限回收在下一个 query 立即生效
```

## 10. 坑清单

| # | 坑 | 后果 | 对策 |
|---|-----|------|------|
| 1 | 召回后过滤 | top50 全被滤光，用户误以为知识库为空 | 过滤必须在召回内部 |
| 2 | filter 拼接用户输入 | 注入攻击 | ID 白名单校验不可省 |
| 3 | X-Plugin-Namespace 直接信 header | 租户穿越 | 校验 namespace ∈ user.namespaces |
| 4 | 上传者随意设 public | 提权外泄 | 设 public 需 rag:kb:manage 权限 |
| 5 | kb_id 不与 allowed_kbs 求交 | IDOR | 强制求交，不在集合内 403 |
| 6 | 改 ACL 触发全量重嵌入 | 浪费资源 | upsert 标量字段即可 |
| 7 | scope 在会话创建时固化 | 权限回收失效 | 每轮 query 重新解析 |
| 8 | groups 数组不做标量索引 | 过滤性检索慢 | 建 INVERTED 索引 |
| 9 | Admin 与 RAG 各建一套"组" | 概念分裂 | 引用同一套部门/组 ID |

## 11. 验收标准

### 11.1 功能验收

1. **A组用户只能看到A组文档**：以A组身份 query B组文档的关键词，top 结果中无 B 组 chunk
2. **public 文档所有人可见**：设为 public 的文档，任何组都可检索到
3. **private 文档仅 owner 可见**：其他用户（包括同组）不可见
4. **权限回收即时生效**：移除用户组权限后，下一个 query 立即不可见

### 11.2 安全验收（Golden Set 泄漏回归）

```python
# tests/e2e/test_acl_leak.py
def test_group_a_cannot_see_group_b_docs():
    """A组用户查询B组文档关键词，断言无B组chunk。"""
    # 1. 以A组用户登录
    # 2. 搜索B组文档的专有关键词
    # 3. 断言 results 中无 B 组 document_id
    # 4. 断言 Milvus 候选层就无 B 组 chunk
```

### 11.3 监控信号

```
某用户连续 query 命中 has_answer=false
但同 query 换其他组有结果
→ 疑似"可见性边界"问题的信号
→ 触发告警
```

## 12. 实现计划

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 1 | 数据模型（rag_kb_acl / rag_doc_acl）+ Milvus schema 扩展 | 1 天 |
| Phase 2 | Scope 构建 + to_milvus_expr + 检索集成 | 2 天 |
| Phase 3 | ACL 治理（入库校验 + 变更传播） | 1 天 |
| Phase 4 | MCP 集成 + 测试 | 1 天 |
| **总计** | | **5 天** |

## 13. 相关文档

- [2026-08-21-agentic-rag-系统设计.md](./2026-08-21-agentic-rag-系统设计.md) — RAG 核心设计
- [2026-09-05-agent-layer-and-mcp-design.md](./2026-09-05-agent-layer-and-mcp-design.md) — MCP 鉴权设计
- [2026-09-02-frontend-backend-architecture-spec.md](./2026-09-02-frontend-backend-architecture-spec.md) — 现有架构
- [E2E 测试规范](./2026-09-06-e2e-test-spec.md) — 测试覆盖
