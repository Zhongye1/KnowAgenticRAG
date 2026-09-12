---
title: 知识库角色与 ACL v2 设计（Owner 资源化 + 统一求值 + 默认拒绝）
description: 把现有"组名单式"KB/文档 ACL 升级为带主体类型与权限级别的资源级 ACL，定义 Owner/Manager/Contributor/Reader 角色、单一求值函数 resolve_kb_perm、默认拒绝语义与三端接口归类
status: 待评审
date: 2026-09-12
---

# 知识库角色与 ACL v2 设计（Spec）

## 0. 文档信息

| 项       | 内容                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 状态     | 待评审，未实现                                                                                                                                                                       |
| 日期     | 2026-09-12                                                                                                                                                                           |
| 范围     | 角色定义、ACL 数据结构 v2、求值规则、读链路过滤、授权审计、三端接口归类；含现状差距清单与分阶段落地                                                                                  |
| 前置依赖 | Admin RBAC（已实现）、KB 模块（已实现）、检索 Scope + Milvus 召回内过滤（已实现）                                                                                                    |
| 上游设计 | [2026-09-06-rag-access-control-design.md](./2026-09-06-rag-access-control-design.md)、[2026-09-07-multi-tenant-permission-design.md](./2026-09-07-multi-tenant-permission-design.md) |
| 联动文档 | [2026-09-05-agent-layer-and-mcp-design.md](./2026-09-05-agent-layer-and-mcp-design.md)、[2026-09-12-agentic-rag-落地改造清单.md](./2026-09-12-agentic-rag-落地改造清单.md)           |

> 行号与"现状"结论均为 2026-09-12 撰写时对 HEAD 的实测快照；实现漂移时以代码为准。

## 1. 背景与目标

### 1.1 背景

现有 ACL（`2026-09-06-rag-access-control-design.md`）解决的是**数据权限是否存在**：KB 级 ACL 决定"哪些组能进这个库"，文档级 ACL 决定"进库后能看见哪些文档"，两层都在 Milvus 召回内下推。这部分地基已经落地且方向正确。

但它把权限建模成**有无成员资格**：`rag_kb_acl` 每行是 `(namespace, kb_name, group_id)`，主体只有"组"一种，级别只有"有/无"。由此暴露出三个产品级缺口：

1. **没有 Owner 概念**。知识库没有归属人，建库、删库、授权都是全局功能权限 `rag:kb:manage`，谁有码谁能管任意库。
2. **建库权与授权权没有分离**。授权动作（改 ACL）与内容管理动作共用同一权限码，违反职责分离（SoD）。
3. **默认语义是"放行"**。当命名空间下没有任何 ACL 记录时，检索直接返回全部 KB，与"无授权即不可见"相反。

同时路由层存在一处与产品意图不符的实现：KB 列表/详情没有任何用户级过滤，任何持 `rag:kb:list` 的用户都能看到实例内全部知识库的名称与元数据。

### 1.2 目标

1. 定义**三层角色**：平台超管 / 组织管理员（全局角色）与 KB Owner / Manager / Contributor / Reader（资源级权限）。
2. 把 ACL 从"组名单"升级为 v2：支持主体类型（user/role/dept/group）、权限级别（owner > manage > contribute > read）、显式 deny、`expires_at` 临时授权。
3. 收敛出**唯一求值函数** `resolve_kb_perm(user, kb) -> Perm | None`，KB 列表 / 详情 / 检索 / 问答 / Agent / 管理 / ACL 七类入口统一调用。
4. 确立 **default deny**：无授权记录即不可见；公开库由 `knowledge_bases.is_public` 显式表达，不再依赖"ACL 表为空"的隐式回退。
5. 文档 ACL 只做**收窄**：文档可见集 ⊆ KB 可见集，禁止通过文档 ACL 引入 KB 之外的主体。
6. 授权变更可追溯、不可静默丢失。

### 1.3 非目标

- 不引入 ABAC / 策略引擎，仍是 RBAC + 资源 ACL 两层。
- 不做跨实例（跨 `plugin_namespace`）授权；`plugin_namespace` 仍是部署级硬边界。
- 不做字段级脱敏（数据范围第三层的敏感场景），仅保留演进位（见 §6.3）。
- 不改 Model Provider 的 system 级定位（`backend/src/app/model_provider/model/provider.py:3`）。

## 2. 现状与差距

### 2.1 已实现且保留

| 能力                                       | 位置                                                                                                   | 结论                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------- |
| 三层读库过滤中的功能权限                   | `backend/src/app/kb/utils/permissions.py:21-32`                                                        | 保留                 |
| `kb_names` 与授权范围求交（防 IDOR）       | `backend/src/app/retrieval/service/retrieval_service.py:295-300`、`retrieval/service/scope.py:148-158` | 保留，改为走求值函数 |
| 召回路内过滤、非召回后过滤                 | `retrieval/service/retrieval_service.py:691-698`、`database/milvus_kb_ops.py:572`                      | 保留                 |
| 文档级 Milvus 标量镜像 + 变更按主键 upsert | `kb/service/acl_service.py:94-110`                                                                     | 保留，补对账（§7.3） |
| Agent 每轮工具调用重新求交、不复用快照     | `agent/graph/tools.py:60-62,124,134`                                                                   | 保留                 |

### 2.2 差距清单（实测）

| #   | 差距                                  | 证据                                                                      | 影响                                                          |
| --- | ------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| G1  | ACL 表为空时返回该命名空间**全部 KB** | `retrieval/service/scope.py:215-251`（`acl_count == 0` 分支）             | 违反 default deny；且"写进第一行 ACL"会让全实例可见性整体翻转 |
| G2  | KB 无 `owner_id` / `is_public`        | `kb/model/knowledge_base.py:25-47`（无这两个字段）                        | Owner 无处落地；公开库无载体                                  |
| G3  | 主体只有组一种，无权限级别            | `kb/model/acl.py:29-61`                                                   | 无法表达"对 A 库是 Manager、对 B 库是 Reader"                 |
| G4  | 建库权与授权权共用 `rag:kb:manage`    | `kb/api/v1/knowledge_bases.py:57`、`kb/api/v1/acls.py:26,45,67`           | SoD 失效：有码即可改任意库 ACL                                |
| G5  | 无 `expires_at`                       | `kb/model/acl.py` 全表                                                    | 临时授权不可行                                                |
| G6  | 无 deny、无 user 优先                 | `retrieval/service/scope.py:182-191`（`[user_id] + 部门祖先链` 平级集合） | "部门开库、排除某人"不可表达                                  |
| G7  | KB 列表/详情无 ACL 过滤               | `kb/service/kb_service.py:34-58`、`kb/crud/crud_knowledge_base.py:33-34`  | 库名与元数据对全体登录用户可见（探测面）                      |
| G8  | ACL 读接口只需 `rag:kb:list`          | `kb/api/v1/acls.py:27,36`                                                 | 任意能列库者可见任意库授权名单                                |
| G9  | ACL 表无历史（delete + insert）       | `kb/crud/crud_acl.py:46,100`、`kb/service/acl_service.py:94-110`          | 变更历史丢失，`created_by` 只剩最后一次                       |
| G10 | 审计日志可删除                        | `admin/api/v1/log/opera_log.py:36,51`                                     | 与"授权日志不可删除"冲突                                      |
| G11 | Milvus 传播 best-effort、无对账       | `kb/service/acl_service.py:94-110`                                        | DB 与索引可能长期不一致                                       |

## 3. 角色模型

### 3.1 三层角色

| 层     | 角色                                      | 载体                             | 边界                                                                             |
| ------ | ----------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| 平台层 | 平台超管                                  | Admin 全局角色（`is_superuser`） | 管 model-providers、schedulers、日志审计、实例配置；**不默认获得业务库内容权限** |
| 组织层 | 组织管理员                                | Admin 全局角色 + 数据范围        | 管本组织用户/角色/部门；可建库并成为 Owner；不能改平台级配置                     |
| 资源层 | KB Owner / Manager / Contributor / Reader | **ACL 记录**（非 `sys_roles`）   | 权限只在单个 KB 上成立                                                           |

### 3.2 能力边界

| 角色                | 建库               | 授权               | 读库                 | 文档管理 | 说明                                              |
| ------------------- | ------------------ | ------------------ | -------------------- | -------- | ------------------------------------------------- |
| 平台超管            | ✅                 | ✅（全部库）       | ✅                   | ✅       | 审计与运维视角，不参与日常内容运营                |
| 组织管理员          | ✅                 | ✅（本组织）       | ✅                   | ✅       | 本组织范围内；建库后成为该库 Owner                |
| Owner               | ✅（自己创建的库） | ✅（自己拥有的库） | ✅                   | ✅       | 可转授、可删库；**只有 Owner 能改 ACL**           |
| Manager             | ❌                 | ❌                 | ✅                   | ✅       | 上传/摄取/重建/改元数据；**不能改 ACL、不能删库** |
| Contributor（可选） | ❌                 | ❌                 | ✅                   | 部分     | 只能上传 + 触发摄取，不能删文档/重建              |
| Reader              | ❌                 | ❌                 | ✅                   | ❌       | 检索/问答/下载（若放开）                          |
| Guest               | ❌                 | ❌                 | ✅（仅 `is_public`） | ❌       | 匿名/受限账号，由 `is_public` 表达                |

### 3.3 关键设计决策

1. **建库权与授权权分离**：能建库（组织管理员、Owner）≠ 能授权（仅 Owner）。授权动作只能由资源所有者发起。
2. **Owner 是资源级记录，不是全局角色**：Owner 不写进 `sys_roles`，而是 KB 上的一条 ACL 记录（`owner_id` + `principal_type=user, perm=owner`）。同一用户可以是 KB-A 的 Owner、KB-B 的 Reader。
3. **Contributor 是可选拆分**：现有接口粒度已支持（上传与摄取分离、rebuild 独立端点），组织小时可只保留 Manager。

### 3.4 与现有权限码的映射

| 能力               | 现有权限码              | 目标模型                                           |
| ------------------ | ----------------------- | -------------------------------------------------- |
| 列库               | `RAG_KB_LIST`           | 功能权限保留 + 逐库 `resolve_kb_perm >= read` 过滤 |
| 检索               | `RAG_KB_SEARCH`         | 功能权限保留 + 逐库 `>= read`                      |
| 读文档/片段        | `RAG_KB_READ`           | 功能权限保留 + 逐库 `>= read`                      |
| 问答               | `RAG_KB_CHAT`           | 功能权限保留 + 逐库 `>= read`                      |
| Agent              | `RAG_KB_AGENT`          | 功能权限保留 + 逐库 `>= read`                      |
| 上传/摄取/重建     | `RAG_KB_INGEST`         | 功能权限保留 + 逐库 `>= contribute`                |
| 文档删改/设 public | `RAG_KB_MANAGE`         | 功能权限保留 + 逐库 `>= manage`                    |
| 建库               | `RAG_KB_MANAGE`（现状） | **新增 `rag:kb:create`**，建库后自动写 Owner       |
| 改 ACL             | `RAG_KB_MANAGE`（现状） | **新增 `rag:kb:acl`**，且必须逐库 `== owner`       |

> 功能权限（能不能做这类动作）与资源权限（能不能对**这个**库做）是 AND 关系，二者都要过。

## 4. ACL 模型 v2

### 4.1 数据结构

```sql
-- KB 级 ACL（v2：主体 + 级别 + 显式 allow/deny + 有效期）
ALTER TABLE rag_kb_acl ADD COLUMN principal_type VARCHAR(16) NOT NULL DEFAULT 'dept';
ALTER TABLE rag_kb_acl RENAME COLUMN group_id TO principal_id;
ALTER TABLE rag_kb_acl ADD COLUMN perm        VARCHAR(16) NOT NULL DEFAULT 'read';
ALTER TABLE rag_kb_acl ADD COLUMN effect      VARCHAR(8)  NOT NULL DEFAULT 'allow';
ALTER TABLE rag_kb_acl ADD COLUMN expires_at  TIMESTAMPTZ NULL;
ALTER TABLE rag_kb_acl ADD COLUMN updated_time TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- 唯一键从 (namespace, kb_name, group_id) 改为 (namespace, kb_name, principal_type, principal_id)

-- KB 归属与公开开关
ALTER TABLE knowledge_bases ADD COLUMN owner_id VARCHAR(64) NULL;
ALTER TABLE knowledge_bases ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;

-- 授权变更审计（append-only，只增不改不删）
CREATE TABLE rag_acl_audit (
    id              BIGSERIAL PRIMARY KEY,
    plugin_namespace VARCHAR(64) NOT NULL,
    kb_name         VARCHAR(64) NOT NULL,
    document_id     VARCHAR(64) NULL,
    action          VARCHAR(32) NOT NULL,   -- kb_acl_update / doc_acl_update / kb_transfer / ...
    principal_type  VARCHAR(16) NULL,
    principal_id    VARCHAR(64) NULL,
    perm            VARCHAR(16) NULL,
    effect          VARCHAR(8)  NULL,
    before_json     JSONB NULL,
    after_json      JSONB NULL,
    operator_id     VARCHAR(64) NULL,
    created_time    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`rag_doc_acl` 同步升级为 `principal_type + principal_id + perm + effect + expires_at`；`documents.visibility` 语义收窄见 §4.5。

### 4.2 主体类型

| type    | id 来源       | 示例         | 说明                           |
| ------- | ------------- | ------------ | ------------------------------ |
| `user`  | `sys_user.id` | `u_123`      | 直接授权，优先级最高           |
| `role`  | `sys_role.id` | `kb-manager` | 按全局角色授权                 |
| `dept`  | `sys_dept.id` | `dept_hr`    | 部门成员动态生效，调岗自动失权 |
| `group` | 预留命名组    | `g_audit`    | 首版可只读兼容，不开放写入     |

### 4.3 权限级别

`owner > manage > contribute > read`，高级包含低级。存储为枚举，比较用**序数**而非字符串。

### 4.4 求值规则

```
resolve_kb_perm(user_ctx, kb) -> Perm | None

1. 展开用户主体集合 P
   P = {user:uid} ∪ {role:r | r ∈ user.roles} ∪ {dept:d | d ∈ dept_id ∪ 祖先链} ∪ {group:g}
2. 取 KB 的 ACL 条目 + kb.owner_id + kb.is_public
3. 丢弃 expires_at <= now 的条目
4. deny 优先：P 命中任一 effect=deny 条目 → 返回 None（显式拒绝高于一切，包括 user 直接 allow）
5. allow 取最高级：命中条目按 perm 序数取最大
6. user 直接授权优先：若 P 中 user 主体命中，则其 perm 覆盖 role/dept/group 的结果
7. 若 kb.owner_id == user.id → OWNER（仍受第 4 步 deny 约束）
8. 若 kb.is_public → 至少 READ（仍受第 4 步 deny 约束）
9. 以上皆无 → None（不可见）
```

> 第 4 步口径需评审确认：本文按"显式 deny 高于一切"实现，即"部门被 deny、个人被 allow"仍判不可见。若产品希望"个人 allow 可覆盖部门 deny"，需改为"user allow > deny > 间接 allow"，该变更只影响本函数一行分支。

### 4.5 public 语义

- **KB 公开** = `knowledge_bases.is_public = true`，等价于"给匿名主体发 read"，由求值函数第 8 步表达，不再依赖"ACL 表为空"。
- **文档公开** = `documents.visibility = 'public'`，语义限定为"**KB 内**公开"：只能让已通过 KB 层求值的用户看到，**不能**让 KB 层 `None` 的用户看到。
- `restricted` / `private` 语义维持上游 spec（`2026-09-06-rag-access-control-design.md` §2.2）。
- 文档默认 `visibility` 必须显式定为 `restricted`（继承 KB 组成员），不得默认 `public`。

### 4.6 文档 ACL 只收窄

强制不变量（写死在求值函数与写接口，而非靠约定）：

```
effective(doc) = resolve_kb_perm(user, kb)  -- 必须 >= READ
                 AND doc_visible(user, doc)

doc_visible(user, doc) = 在 kb 可见前提下成立的文档级判定
                       ∧ 文档 ACL 引用的 principal 集合 ⊆ 该 KB ACL 可表达的主体集合
```

即：文档 ACL 可以限制"某部门看不到某份文件"，但不能让 KB 层无权者获得访问。

## 5. 统一求值函数

### 5.1 接口

```python
# backend/src/app/kb/service/acl/resolver.py

class Perm(StrEnum):
    READ = 'read'
    CONTRIBUTE = 'contribute'
    MANAGE = 'manage'
    OWNER = 'owner'

@dataclass(frozen=True)
class Principal:
    type: Literal['user', 'role', 'dept', 'group']
    id: str

@dataclass(frozen=True)
class AclEntry:
    principal: Principal
    perm: Perm
    effect: Literal['allow', 'deny'] = 'allow'
    expires_at: datetime | None = None

async def resolve_kb_perm(db: AsyncSession, *, user: UserContext, kb_name: str) -> Perm | None:
    """返回用户在该 KB 上的最高有效权限；None = 不可见。"""

async def resolve_visible_kbs(db: AsyncSession, *, user: UserContext, kb_names: list[str]) -> list[str]:
    """批量求值，供 KB 列表过滤使用（禁止 N 次单点查询）。"""
```

要求：

- **纯函数语义**：求值不写库、不依赖请求上下文，只吃 `UserContext + kb_name`，便于单测与复用（HTTP / MCP / Agent 同一入口）。
- **批量接口必需**：KB 列表不能逐库调 `resolve_kb_perm`（N+1）。
- **一次请求只构建一次 `UserContext`**，但**每次求值都重新读 ACL**；ACL 缓存 TTL 不得超过 30–60s（对齐 D32）。

### 5.2 调用点矩阵

| 入口                                               | 要求                         | 未通过时的响应          | 现状                         |
| -------------------------------------------------- | ---------------------------- | ----------------------- | ---------------------------- |
| `GET /knowledge_bases`                             | 列表内逐库 `>= read`         | 库不出现                | 无过滤（G7）                 |
| `GET /knowledge_bases/{kb}`                        | `>= read`                    | **404**（不泄露存在性） | 无过滤（G7）                 |
| `POST /knowledge_bases`                            | 功能码 `rag:kb:create`       | 403                     | 仅 `rag:kb:manage`（G4）     |
| `PATCH/DELETE /knowledge_bases/{kb}`               | `== owner`                   | 404                     | 仅全局 `rag:kb:manage`       |
| `GET /knowledge_bases/{kb}/acl`                    | `>= manage`                  | 404                     | 仅 `rag:kb:list`（G8）       |
| `PUT /knowledge_bases/{kb}/acl`                    | `== owner` + `rag:kb:acl`    | 404                     | 仅全局 `rag:kb:manage`（G4） |
| `POST /documents`（上传）                          | `>= contribute`              | 404                     | 全局 `rag:kb:ingest`         |
| `.../documents/{id}/ingest`、`rebuild`             | `>= contribute`              | 404                     | 全局 `rag:kb:ingest`         |
| `PATCH/DELETE /documents/{id}`                     | `>= manage`                  | 404                     | 全局 `rag:kb:manage`         |
| `PUT /documents/{id}/acl`                          | `>= manage`                  | 404                     | 全局 `rag:kb:manage`         |
| `POST /rag/search`、`/search/stream`               | 对 `kb_names` 逐库 `>= read` | 含无权库 → 403          | `allowed_kbs` 求交           |
| `POST /{kb}/chat`、`/chat/stream`                  | `>= read`                    | 404                     | 同上                         |
| `POST /{kb}/agent`、`/agent/stream`                | `>= read`                    | 404                     | 同上                         |
| MCP `search_knowledge` / `read_document_chunks` 等 | 同检索/读                    | 工具级错误码            | 同上                         |

> 404/403 口径：**单资源显式访问（详情/管理/ACL/问答）统一 404**，避免"存在但无权"的存在性预言机；**批量检索传入无权 `kb_names` 保留 403**，因为这是显式越权尝试、403 有诊断价值且已有测试覆盖。

### 5.3 模块落点与依赖方向

目标结构（同时消除 `kb → retrieval` 的存量债务）：

```
backend/src/app/kb/service/acl/
├── principals.py    # 主体展开：user/role/dept(含祖先链)/group → principal 集合
├── resolver.py      # resolve_kb_perm / resolve_visible_kbs（唯一求值点）
├── entries.py       # ACL 条目读写（CRUD 之上的一层领域语义）
└── scope.py         # UserContext / Scope / build_retrieval_scope()
```

- 数据权限的**所有者是 kb 域**（表也在 kb 域），求值函数随之下沉到 kb；`retrieval` / `chat` / `agent` / `mcp` 经既有豁免方向 `下游 → kb` 消费。
- `retrieval/service/scope.py` 只保留 `to_milvus_expr()`（Milvus 表达式属检索关注点），`Scope` 从 kb 域导入。
- `kb/deps.py` 改为依赖 kb 自身的 scope 构建，**删除 `backend/pyproject.toml` 中 `backend.src.app.kb.** -> backend.src.app.retrieval.**` 的债务豁免**。
- 主体展开需要 `sys_dept`（部门祖先链）：沿用现有做法（`retrieval/service/scope.py:194-213` 的只读 SQL），但集中到 `principals.py` 一处，禁止各域各写一份。
- `role` 主体展开复用 JWT 已加载的 `request.user.roles`，不额外查询 Admin；新增跨域读取如不可避免，须在 `pyproject.toml` 显式登记豁免并注明决策编号（对齐现有 `common.security -> admin` 的处理方式）。

## 6. 读链路三层过滤

### 6.1 目标链路

```
用户提问
  → ① 功能权限：RBAC 码（RequestPermission + DependsRBAC）
  → ② 资源权限：resolve_kb_perm / resolve_visible_kbs → 可见 kb 集合
  → ③ 查询下推：Milvus filter = namespace AND kb_name AND doc_acl
  → LLM 仅基于过滤后的 chunk 作答
```

### 6.2 不变量

1. 过滤发生在**召回内部**，不是召回后剪枝。
2. 过滤条件由**服务端构造**，客户端只能选 `kb_names`，不能传过滤语义。
3. `kb_names` 必须与资源权限求交；不在集合内不得进入召回。
4. Agent 每轮工具调用**重新求交**，不复用首轮快照。
5. `citation` / `sources` / 图片 URL 在展示前**再求一次权限**，防止引用侧泄露无权文档标题（现有引用来自已过滤命中，属回归防线而非新增能力）。

### 6.3 数据范围（第三层，演进位）

`sys/data-rules` / `sys/data-scopes` 解决"进库后看到什么"（字段脱敏、分级可见）。本期不实现，但求值函数的返回结构预留 `data_scope` 扩展位；实现方式二选一（摄取期分副本 / 检索期按规则裁剪输出），由敏感度决定。

## 7. 授权与审计

### 7.1 授权流程约束

- 建库成功 → 同一事务写 `owner_id` + `principal_type=user, perm=owner`。
- ACL 写接口必须校验 `resolve_kb_perm(...) == OWNER`，而非只校验功能码。
- 设 `is_public` 属 `>= manage` 且必须留审计（现状要求 `rag:kb:manage`，见 `2026-09-06-rag-access-control-design.md` §8.1）。
- 所有权转移（Owner 离职）由组织管理员发起，写审计并保留原记录。

### 7.2 审计要求

| 事件                                                 | 载体                                                                                         | 不可删除             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------- |
| 授权变更（加/减主体、改级别、设 public、所有权转移） | `rag_acl_audit` append-only                                                                  | ✅                   |
| API 级操作记录（谁在何时调了哪个端点）               | `sys_opera_log`（现有中间件 `middleware/logs_middleware.py:100-120` 已记录路径参数与请求体） | 需禁止删除资源类事件 |
| 检索读取记录（谁检索了什么，不记结果内容）           | 现有指标/追踪（`ragf.retrieval.*`）                                                          | 按需扩展             |

`rag_acl_audit` 只增不改不删；`admin/api/v1/log/opera_log.py:36,51` 的 DELETE 接口需按 `title/path` 白名单排除 ACL 与 KB 资源类事件（或改为逻辑删除）。

### 7.3 一致性

- DB 是 source-of-truth，Milvus 是镜像（对齐上游 spec）。
- 文档级变更后按主键 upsert 标量字段；失败不回滚 DB，但**必须**写对账任务（`tasks/`，可挂 `beat`），周期性比对 `documents.visibility/owner_id + rag_doc_acl` 与 Milvus 标量并修复。
- ACL 巡检任务同时清理 `expires_at` 已过期条目并输出审计。

## 8. 落地阶段

> 项目未上线，无存量数据包袱；迁移可一次性完成，无需双写兼容期。

| 阶段            | 内容                                                                                                                                                                      | 出口条件                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Phase 1         | 数据模型迁移：`rag_kb_acl`/`rag_doc_acl` v2、`knowledge_bases.owner_id/is_public`、`rag_acl_audit`；KB 创建写 Owner                                                       | 迁移脚本 + 回滚脚本；建库即 Owner 的集成测试 |
| Phase 2         | 求值函数 `resolve_kb_perm` / `resolve_visible_kbs` + 单测（含 deny / 过期 / user 优先 / 祖先部门）；接线但**保持旧行为**（影子比对打点，记录差异）                        | 求值函数单测全绿；影子模式差异率可解释       |
| Phase 3         | 切换语义：移除 `_resolve_allowed_kbs` 的"表空=全放开"（G1），KB 列表/详情/检索/问答/Agent/MCP 全部走求值函数；`GET/PUT .../acl` 与建库拆出 `rag:kb:create` / `rag:kb:acl` | 验收 §9.1 全部通过；G1/G3/G4/G6/G7/G8 关闭   |
| Phase 4         | 审计与一致性：`rag_acl_audit` 落库、opera 日志删除保护、Milvus 对账任务                                                                                                   | G9/G10/G11 关闭；对账任务可重放              |
| Phase 5（可选） | `expires_at` 授权 UI、`group` 主体、数据范围脱敏                                                                                                                          | 按业务信号启动                               |

> Phase 3 是唯一的行为破坏点，必须放在 Phase 1/2 之后：`is_public` 与 Owner 记录先就位，默认拒绝才不会把全部库变成不可见。

## 9. 验收标准

### 9.1 功能验收

1. **默认拒绝**：无任何 ACL 记录的库，除 Owner 外对所有人不可见（列表不出现、详情 404、检索搜不到）。
2. **Owner 唯一授权权**：Manager 调 `PUT /knowledge_bases/{kb}/acl` → 404；Owner 同请求成功。
3. **资源级多角色**：用户 A 对 KB1 为 Owner、对 KB2 为 Reader；对 KB1 可改 ACL，对 KB2 改 ACL → 404。
4. **级别包含**：`manage` 能调用 `contribute` 能力（上传/摄取），`contribute` 不能删文档。
5. **显式 deny 生效**：用户所属部门有 `read`，个人被 `deny` → 不可见；部门被 `deny`、个人被 `allow` → 按 §4.4 口径不可见（评审确认）。
6. **过期即失效**：`expires_at` 到点后下一次求值即不可见（无需后台任务）。
7. **公开库**：`is_public=true` 的库对任意持检索功能码的用户可读；改回 false 立即失效。
8. **文档 ACL 只收窄**：给用户授予 KB 外文档的 ACL，不产生任何跨 KB 可见性。
9. **部门调岗自动失权**：用户从一个部门调到另一个部门，原部门授权立即不生效（无需清理授权清单）。
10. **回收即时生效**：移除授权后，下一个请求即不可见（含同一会话的后续轮次）。

### 9.2 安全回归

- Golden Set 泄漏回归：以 A 组身份检索 B 组专有关键词，Milvus 候选层与最终结果均无 B 组 chunk（延续上游 spec §11.2）。
- 存在性探测：无权 KB 的列表/详情/ACL/问答返回一致形态的 404，不泄露库名。
- 授权审计：删除接口无法删除 `rag_acl_audit` 与资源类 opera 事件。

### 9.3 一致性验收

- 修改文档 ACL 后，对账任务能检出并修复人为制造的 Milvus 漂移。
- 授权变更在 30–60s（缓存 TTL）内全链路生效。

## 10. 坑清单

| #   | 坑                                         | 后果                                    | 对策                                                  |
| --- | ------------------------------------------ | --------------------------------------- | ----------------------------------------------------- |
| 1   | "ACL 表为空 = 全放开"的隐式回退（现状 G1） | 首次配 ACL 时全实例可见性翻转，且不报错 | 移除回退；`is_public` 显式表达公开                    |
| 2   | 把 Owner 做成全局角色                      | 全员 Owner 等于没有权限                 | Owner 只存在 ACL 记录                                 |
| 3   | 建库权与授权权同码                         | 运营可私自授权敏感库                    | `rag:kb:create` / `rag:kb:acl` 分离 + `== owner` 校验 |
| 4   | 召回后过滤                                 | top-k 被滤空，用户误判库为空            | 过滤下推到召回内                                      |
| 5   | 文档 ACL 放大权限                          | 通过文档 ACL 越出 KB 边界               | 求值函数强制 `doc ⊆ kb`（§4.6）                       |
| 6   | 403 暴露库存在性                           | 探测面                                  | 单资源统一 404                                        |
| 7   | ACL 缓存过长                               | 权限回收延迟                            | TTL ≤ 30–60s；写后主动失效                            |
| 8   | 逐库调单点求值                             | 列表接口 N+1                            | 强制 `resolve_visible_kbs` 批量接口                   |
| 9   | 变更后 Milvus 未同步                       | 越权检索                                | 对账任务 + 写后传播 + 告警                            |
| 10  | 授权日志可删除                             | 事后无法追责                            | append-only + 删除保护                                |

## 11. 决策记录

| 编号 | 决策                                                                                                                            | 理由                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| D42  | 角色分三层，KB Owner/Manager/Contributor/Reader 为**资源级 ACL 记录**，不进 `sys_roles`                                         | 避免"全员 Owner"；支持同一用户对不同库有不同角色   |
| D43  | ACL v2 引入 `principal_type`(user/role/dept/group) + `perm`(owner/manage/contribute/read) + `effect`(allow/deny) + `expires_at` | 现有"组名单"无法表达级别、拒绝与临时授权           |
| D44  | 求值口径：显式 deny > 一切；多条 allow 取最高级；user 直接授权优先于 role/dept/group；过期即忽略                                | 单一可测函数；口径需评审确认（见 §4.4 注）         |
| D45  | 采用 **default deny**，移除 `_resolve_allowed_kbs` 的"表空=全放开"回退；公开库由 `knowledge_bases.is_public` 表达               | 与"无 ACL 记录即不可见"一致；消除隐式全局开关      |
| D46  | 数据权限求值下沉 kb 域（`app/kb/service/acl/`），`retrieval` 只保留 Milvus 表达式；借此删除 `kb → retrieval` 债务豁免           | 数据权限归数据所有者；单向依赖收敛，导入契约可清理 |
| D47  | 文档 ACL 只收窄：文档可见集 ⊆ KB 可见集；`visibility=public` 限定为"KB 内公开"；文档默认 `restricted`                           | 防止文档 ACL 成为越权放大通道                      |
| D48  | 授权变更写 append-only `rag_acl_audit`；资源类 opera 事件禁止删除                                                               | 追溯是授权体系的可信前提                           |
| D49  | 建库与改 ACL 拆出独立功能码 `rag:kb:create` / `rag:kb:acl`，且改 ACL 要求 `== owner`                                            | 职责分离（SoD）在权限码层可配置、可审计            |
| D50  | 单资源无权访问统一 404；批量检索传入无权 `kb_names` 保留 403                                                                    | 防存在性探测与保留越权诊断价值之间取平衡           |

## 12. 相关文档

- [2026-09-06-rag-access-control-design.md](./2026-09-06-rag-access-control-design.md) — 两级 ACL 与召回内过滤（本 spec 的上游，§2–4 为其演进）
- [2026-09-07-multi-tenant-permission-design.md](./2026-09-07-multi-tenant-permission-design.md) — 多租户与 `plugin_namespace` 边界
- [2026-09-05-agent-layer-and-mcp-design.md](./2026-09-05-agent-layer-and-mcp-design.md) — MCP 鉴权与 D30/D33 只读边界
- [2026-09-12-agentic-rag-落地改造清单.md](./2026-09-12-agentic-rag-落地改造清单.md) — D34–D41 与本文 D42+ 的连续性
- [2026-09-01-eaglerag-kb-migration-design.md](./2026-09-01-eaglerag-kb-migration-design.md) — 两轴隔离模型与 KB 模块边界
