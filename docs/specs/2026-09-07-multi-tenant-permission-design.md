---
title: 多租户权限管理体系设计（RBAC × ACL × 召回内过滤）
description: Admin RBAC 管动作权限（复用不改动），RAG ACL 管数据权限（KB 级 + 文档级），Scope 查询期 join 后下推 Milvus 召回内部过滤；含本期实现落点与遗留项
status: 已实现（遗留项见 §10）
date: 2026-09-07
---

# 多租户权限管理体系设计（Spec）

## 0. 文档信息

| 项 | 内容 |
| --- | --- |
| 状态 | 已实现（遗留项见 §10） |
| 日期 | 2026-09-07 |
| 范围 | 两层权限模型、权限码体系、Scope 构建、召回内过滤、ACL 治理与变更传播、SQL seed |
| 前置依赖 | Admin RBAC（已实现）、KB/Ingest/Retrieval/Chat/MCP（已实现） |
| 联动文档 | [2026-09-06-rag-access-control-design.md](./2026-09-06-rag-access-control-design.md)（原始 ACL 设计）、[2026-09-05-agent-layer-and-mcp-design.md](./2026-09-05-agent-layer-and-mcp-design.md)（MCP 鉴权 D22/D30–D33） |
| 实现提交 | `4cb7c9d`（组展开）/ `aa06267`（摄取镜像）/ `58a5ed2`（ACL API+传播）/ `1a12750`（RBAC 接线） |

## 1. 目标架构

```
┌────────────────────────────────────────────────────────────────────┐
│ Admin 模块（不改动）                                                │
│  User ─(user_role)─ Role ─(role_menu)─ Menu.perms ── 动作权限        │
│  sys_dept.parent_id 部门树 ────────────────── 组身份来源             │
└────────────────────────────┬───────────────────────────────────────┘
                             │ 引用（组 ID / 权限码命名），不反向写
┌────────────────────────────┴───────────────────────────────────────┐
│ RAG 模块                                                            │
│  第一层 动作权限：rag:kb:list/search/read/chat/ingest/manage        │
│         路由层 RequestPermission + DependsRBAC；MCP 工具面 scp 同源  │
│  第二层 数据权限：KB 级 rag_kb_acl + 文档级 rag_doc_acl             │
│         + documents.visibility/owner_id                             │
│  租户硬边界：X-Plugin-Namespace → resolve_namespace（只选不越）      │
└────────────────────────────┬───────────────────────────────────────┘
                             │ 查询期 join 成 Scope
┌────────────────────────────┴───────────────────────────────────────┐
│ 召回内过滤（Milvus expr，不是召回后过滤）                            │
│  namespace == "<ns>" and                                            │
│  (visibility == "public" or owner_id == "<uid>"                     │
│   or array_contains_any(groups, [...]))                             │
│  kb_name 过滤由 search_ragf_kb 注入；kb 级 ACL 在服务层求交          │
└─────────────────────────────────────────────────────────────────────┘
```

三条铁律（与原始 ACL 设计一致，全部落地）：

1. **过滤发生在召回内部**——dense/sparse 两路 `AnnSearchRequest.expr` 均携带权限条件，候选池只含授权 chunk；
2. **过滤条件由服务端构造**——`build_retrieval_scope` 只吃服务端身份，客户端可传的只有 `kb_names`（必须与 `allowed_kbs` 求交）；
3. **kb_name 必须与授权范围求交**——不在 `allowed_kbs` 内 → HTTP 403 / MCP `PERMISSION_DENIED`。

## 2. 权限码体系（单一来源）

权限码常量唯一来源：`backend/src/app/kb/utils/permissions.py`。三处消费方共用（D30：MCP 不发明第二套权限模型）：

| 权限码 | 语义 | HTTP 路由 | MCP 工具 |
| --- | --- | --- | --- |
| `rag:kb:list` | KB 列表/详情/统计、摄取状态 | `GET /knowledge_bases*`、`GET /documents`、`GET .../status`、KB ACL 读 | `list_knowledge_bases` |
| `rag:kb:search` | 同步检索 | `POST /knowledge_bases/{kb}/search` | `search_knowledge` |
| `rag:kb:read` | 文档详情/下载/分块浏览、文档 ACL 读 | `GET /documents/{id}`、`GET /documents/{id}/download`、`GET /{id}/chunks` | `read_document_chunks`、`get_document` |
| `rag:kb:chat` | 问答（同步 / SSE，带引用） | `POST /knowledge_bases/{kb}/chat[/stream]` | `answer_with_citations` |
| `rag:kb:ingest` | 上传/替换文件/重摄取 | ingest 上传、`PUT /documents/{id}/file`、`POST .../rebuild`、`POST /documents` | —（MCP 只读） |
| `rag:kb:manage` | KB/文档管理 + ACL 配置（含设 public） | KB/文档写路由、ACL 写路由 | —（MCP 只读） |

注册链路：

- **SQL seed**：`init_test_data.sql` 的 `sys_menu` 51–58 行（RAG 目录/菜单 + 6 个按钮码），并绑定测试角色（角色 1）；`admin` 超管天然绕过 RBAC。
- **HTTP**：路由 `dependencies=[DependsJwtAuth, Depends(RequestPermission('rag:kb:*')), DependsRBAC]`，**RequestPermission 必须先于 DependsRBAC**（fba 约束：先设 `ctx.permission` 再校验）。
- **MCP**：`mcp/schemas.py` 的 `PERM_*` 从 kb 域常量 re-export；`tools/list` 按调用方 `scp` 动态过滤（缩小 LLM 可见工具面 = 注入防线，D33）。

## 3. 数据权限模型

### 3.1 表结构（DB 为 source-of-truth）

```sql
-- KB 级：哪些组可以访问该 KB
rag_kb_acl (id, kb_name, plugin_namespace, group_id, created_by, created_time)
  UNIQUE (plugin_namespace, kb_name, group_id)

-- 文档级：KB 内哪些文档对哪些组可见（归一化行，每行一个组）
rag_doc_acl (id, document_id, kb_name, plugin_namespace, group_id, created_by, created_time)
  UNIQUE (plugin_namespace, kb_name, document_id, group_id)

-- documents 表扩展（幂等迁移补列，见 §4.4）
documents.visibility VARCHAR(16) NOT NULL DEFAULT 'restricted'   -- public/restricted/private
documents.owner_id   VARCHAR(64) NULL                            -- private/owner 可见性依据
```

- `group_id` 引用 Admin `sys_dept.id`（组 = 部门），只读引用、不反向写；
- 模型：`backend/src/app/kb/model/acl.py`（对齐 KB 域约定：`MappedBase` + `TimeZone` 手工时间列）；`rag_kb_acl`/`rag_doc_acl` 注册进 `kb/model/__init__.py`，`create_all` 直建。

### 3.2 Milvus 镜像字段（检索过滤全靠它）

`ragf_text_{dim}` 模板集合显式标量字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `namespace` | VARCHAR(64)，**partition key** | 租户剪枝；分区键由 Milvus 自管理，不建索引 |
| `visibility` | VARCHAR(16) | INVERTED 索引 `idx_visibility` |
| `owner_id` | VARCHAR(64) | INVERTED 索引 `idx_owner_id` |
| `groups` | ARRAY&lt;VARCHAR&gt;(32) | INVERTED 索引 `idx_groups`；容量对齐 `MAX_DOC_GROUPS=32` |

四个 ACL 字段已纳入**严格 schema 指纹**（`_RAGF_TEMPLATE_FIELD_TYPES`）：不匹配的集合走升级护栏——非空 legacy 拒绝重建（需人工确认 drop 或重摄取），空 legacy 自动按新 schema 重建。

## 4. 查询链路（Scope 构建 → 召回内过滤）

### 4.1 Scope 构建（服务端，客户端不可传入过滤语义）

```python
# backend/src/app/retrieval/service/scope.py
build_retrieval_scope(db, user=UserContext(user_id, namespace, dept_id), namespace, kb_names=None)
  1. namespace 校验：user.namespace != namespace → 403（header 只能"选"不能"越"）
  2. dept_id 补全：MCP 路径没有 dept_id → 查 sys_user 补全
  3. 组展开 _expand_user_groups：[user_id] + [直属部门] + [祖先部门链]
     （沿 sys_dept.parent_id 向上 while 遍历，visited 集防循环，深度上限 20）
  4. allowed_kbs：rag_kb_acl 按 (namespace, groups) 查询；
     该 namespace 下无 ACL 记录 → 返回全部 KB（向后兼容 = 未配 ACL 全可见）
  5. kb_names 求交：requested - allowed 非空 → 403（防 IDOR）
```

HTTP 与 MCP 的身份接入：

| 入口 | 身份来源 | 接入点 |
| --- | --- | --- |
| REST（search/chat） | `request.user`（`GetUserInfoWithRelationDetail`，含 `id`/`dept_id`） | `kb/deps.get_retrieval_scope` 依赖（`CurrentScope`），**每轮 query 重新构建**，不在会话创建时固化 |
| MCP（5 工具） | `UserContext(sub/tenant/scp)`（多凭证中间件归一） | `mcp/service._build_scope` → 同一个 `build_retrieval_scope`；dept_id 查 DB 补全 |

### 4.2 Milvus 表达式

`to_milvus_expr(scope)` 生成：

```text
namespace == "<ns>" and
(visibility == "public" or owner_id == "<uid>" or array_contains_any(groups, ["g1","g2"]))
```

- `kb_name` 过滤**不在** scope 表达式内——由 `search_ragf_kb()` 统一注入（每调用单 KB，`_and_expr` 组合）；
- ID 白名单校验 `^[A-Za-z0-9_-]+$` + 数量上限 200（防表达式注入）；
- `allowed_kbs` 为空 → 拒绝表达式 `namespace == "__no_access__"`（空结果，不是报错）。

### 4.3 组装与注入

`retrieval_service._recall_kbs`：`expr = compose_retrieval_expr(doc_ids, version_id) AND to_milvus_expr(scope)`，dense/sparse 两路 `AnnSearchRequest.expr` 同带 → CrossEncoder 精排时候选已全部授权。chat（`astream/acomplete_multi`）与 MCP 全链路透传 scope。

### 4.4 既有库迁移（幂等 DDL）

`create_all` 不改已存在的表。启动期 `ragf_schema_migrations.ensure_ragf_column_migrations()` 幂等补列：

```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) DEFAULT 'restricted' NOT NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner_id VARCHAR(64);
```

PG 集成测试 fixture 同步执行相同 DDL（测试库独立引擎）。

## 5. ACL 治理

### 5.1 入库打标（默认最保守）

上传时（`document_service.upload`）从 `request.user` 捕获身份：

- `owner_id = str(user.id)`；
- `visibility = 'restricted'`（模型列默认）；
- 默认授权组 = 上传者**直属部门**（`rag_doc_acl` 一行）。

> 原 spec §8.1 的"可管理组校验"（上传者 groups ⊆ manageable）本期未实现拦截——ACL 管理 API 整体挂 `rag:kb:manage`，授予该码即视为可信管理员（见 §10 遗留项）。

### 5.2 管理 API（`rag:kb:manage` 写权限）

| 方法 | 路径 | 语义 |
| --- | --- | --- |
| GET | `/api/v1/knowledge_bases/{kb_name}/acl` | KB 已授权组列表 |
| PUT | `/api/v1/knowledge_bases/{kb_name}/acl` | 全量替换授权组（查询期语义，无 Milvus 传播） |
| GET | `/api/v1/documents/{document_id}/acl` | visibility + owner + 授权组 |
| PUT | `/api/v1/documents/{document_id}/acl` | visibility / group_ids（None=不变，提供即全量替换）+ **Milvus 传播** |

### 5.3 变更传播（§8.2：不需要重嵌入）

`update_document_acl` → DB 更新（documents 行 + rag_doc_acl 全量替换）→ `update_ragf_document_acl()`：

- 按主键 upsert：回读该文档全部 chunk 的 `chunk_id/embedding/content/version_id/chunk_index` **及 ACL 四字段**，仅改需要变更的标量后 `client.upsert`；
- embedding 原样复用（不重嵌入）；**content 必须回读**——BM25 Function 从 content 服务端重建稀疏向量，缺 content 会清空 BM25 路；
- 未显式给值的字段按现值保留（None 语义 = 不变）；
- 传播失败不回滚 DB（source-of-truth 已更新，可重试/重建收敛），MCP/检索下次查询仍以 DB + Milvus 现值为准。

### 5.4 删除联动清理

| 删除对象 | 清理 |
| --- | --- |
| 文档（`document_service.delete`） | `rag_doc_acl` by document_id（counts['doc_acl']） |
| KB（`kb_service.delete`） | `rag_kb_acl` + `rag_doc_acl` by kb_name（counts['kb_acl']/['doc_acl']） |

## 6. 多租户（namespace 硬边界）

- `X-Plugin-Namespace` → `resolve_namespace()`：只允许选择实例 namespace（`PLUGIN_NAMESPACE`，默认 `core`），`ALLOW_NAMESPACE_OVERRIDE` 仅测试用；
- 存储隔离：`plugin_namespace` 是 `knowledge_bases/documents/rag_kb_acl/rag_doc_acl` 的列 + `rag_kb_acl` 查询维度 + Milvus `namespace` 分区键 + scope 表达式第一条件；
- MCP 侧：租户以服务端解析的 namespace 为准，JWT `tenant` claim 只做一致性交叉校验（不一致 → 401 拒绝，防 claim 覆盖穿越）；JWT 需 Redis 会话存活（与 fba 同源键，撤销即时生效、refresh token 不可用作 MCP 凭证），PAT 通道免会话。

## 7. 各面语义一致性（MCP / Chat / REST）

| 面搜索入口 | KB 存在性 | KB 级 ACL | 文档级 ACL |
| --- | --- | --- | --- |
| REST search/chat | `knowledge_base_dao.get` → 404 | `CurrentScope`（build 时求交，越界 403） | scope expr 召回内过滤 |
| MCP search/answer | `_ensure_kb` 逐库 → `KB_NOT_FOUND`（跨租户不可见不泄漏） | `_build_scope` + 工具层求交 → `PERMISSION_DENIED` | 同左 |
| read_document_chunks / get_document | `_ensure_kb` → `KB_NOT_FOUND` | —（KB 级求交由存在性覆盖） | **待办**：文档级可见性校验（§10） |

> MCP `_build_scope` 不向 `build_retrieval_scope` 传 `kb_names`（HTTP 403 语义不进工具面），求交在工具层完成并映射 `PERMISSION_DENIED`。

## 8. 测试与验证

| 层 | 用例 | 结果 |
| --- | --- | --- |
| 单元 | scope 表达式（白名单/无组/无用户/拒绝表达式）、ACL DTO 校验、路由权限接线（含依赖顺序 + MCP 同源） | 绿（201 passed 全仓） |
| 真实 Milvus 集成 | schema 指纹就绪、跨 KB 不可见、**召回内 ACL 过滤**（vector+hybrid 双路，无权组不可见）、**ACL 传播 upsert**（restricted→public 命中切换 + content 原样保留）、升级护栏（非空 legacy 拒重建/空 legacy 重建/幂等不丢数据） | 7/7 绿 |
| 真实 PG 集成 | filters/多 KB/跨租户不可见 + ACL 列迁移 | 9/9 绿 |

已知预存失败（与本期无关）：`admin/tests/api_v1/test_auth.py::test_logout`（登录插件路由 404，改动前即失败）。

## 9. 坑清单（本期实际踩到/规避的）

| # | 坑 | 处理 |
| --- | --- | --- |
| 1 | 字段名错位：scope 表达式写 `kb_id/doc_id`，实际集合字段是 `kb_name/document_id` | `to_milvus_expr` 只含 namespace + 文档级 ACL；kb_name 由 `search_ragf_kb` 注入 |
| 2 | ACL 传播 upsert 不回读 ACL 字段 → namespace 被抹成空串、文档"消失" | query `output_fields` 带全部 ACL 字段，未给值按现值保留 |
| 3 | ACL 传播 upsert 不回读 content → BM25 稀疏向量被清空 | content 必须回读 |
| 4 | `create_all` 不给既有表补列 → 真实 PG 集成测试 `column "visibility" does not exist` | 幂等 DDL 迁移（启动期 + 测试 fixture） |
| 5 | MCP `_build_scope` 在无 db 会话/无部门表环境崩溃 | `scope_builder` 可注入；MCP 不传 kb_names（HTTPException 不进工具面） |
| 6 | scope 在会话创建时固化 | `CurrentScope` 依赖每轮 query 重建 |
| 7 | MCP 权限码与 HTTP RBAC 两套定义漂移 | 单一来源 `kb/utils/permissions.py`，MCP re-export + 同源测试 |
| 8 | legacy Milvus 集合无 ACL 字段，scoped 检索 expr 报错 | ACL 四字段纳入严格指纹 → 升级护栏显式拒绝/重建（dev 环境 e2e 残留已人工 drop） |

## 10. 遗留项（按信号启动）

| 项 | 说明 | 启动信号 |
| --- | --- | --- |
| 组展开缓存 | `_expand_user_groups` 每请求查 `sys_dept` 祖先链（2 次/查询）；设计目标 30–60s TTL | 部署规模上来（部门树深/查询 QPS 高）再加 Redis 缓存 |
| 文档级 ACL 的 MCP 续读校验 | `read_document_chunks`/`get_document` 只做了 KB 存在性，未查 `rag_doc_acl`/visibility（命中片段经 search 已过滤，但直接传 document_id 续读绕过文档级 ACL） | MCP 面对外开放给不可信角色时**必须**补 |
| 入库打标的可管理组校验 | 原 spec §8.1"上传者 groups ⊆ manageable"未实现；当前 ACL 管理整体 `rag:kb:manage` 门禁 | 出现"普通用户可带 ACL 语义上传"需求时 |
| 设 public 细粒度校验 | 原 spec"设 public 需 manage"已由路由门禁覆盖；服务层未单独校验（同码） | 权限码拆分（public 独立码）时 |
| 既有文档 backfill | 迁移前摄取的向量行 ACL 字段为空（restricted+无组）→ scoped 检索不可见；需重摄取或批量 upsert 回填 | 生产数据升级时执行一次 |
| JWT `scp` 与菜单权限贯通 | MCP `scp` 目前来自 claim 或 `RAGF_MCP_DEFAULT_SCOPES`；后续可从 `auth_service.get_codes()`（menu.perms）投影生成 | Keycloak/OAuth 落地（D31–D33 演进）批次 |

## 11. 相关文档

- [2026-09-06-rag-access-control-design.md](./2026-09-06-rag-access-control-design.md) — ACL 原始设计（本 spec 的实现基线）
- [2026-09-05-agent-layer-and-mcp-design.md](./2026-09-05-agent-layer-and-mcp-design.md) — MCP 多凭证鉴权 D22/D30–D33
- [2026-08-21-agentic-rag-系统设计.md](./2026-08-21-agentic-rag-系统设计.md) — RAG 核心设计
- [2026-09-06-e2e-test-spec.md](./2026-09-06-e2e-test-spec.md) — E2E 测试规范
