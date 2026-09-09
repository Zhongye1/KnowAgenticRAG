---
title: 文档版本化设计（Phase 2）
description: 文档资源版本化（document_versions + chunks 溯源 + 原子切换），明确在 RAG 摄取与生成管线完成后实现
status: 待实现（Phase 2）
date: 2026-09-02
---

# 文档版本化设计（Phase 2，依赖摄取管线）

## 0. 文档信息

| 项       | 内容                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| 状态     | 待实现（Phase 2）                                                                          |
| 日期     | 2026-09-02                                                                                 |
| 范围     | 文档版本化的数据模型 / 状态机 / API 契约 / 关键机制，不含实现代码                          |
| 前置依赖 | RAG 摄取与生成管线（解析 → 分块 → 嵌入 → 写向量 → 状态回写）完成后                         |
| 上游设计 | [2026-09-01-eaglerag-kb-migration-design.md](./2026-09-01-eaglerag-kb-migration-design.md) |
| 技术基线 | FBA + PostgreSQL + Celery + Milvus + MinIO                                                 |

## 1. 背景与定位

RAG 场景下"改文档"不是原地编辑，而是**新版本 + 重摄取 + 原子切换**：

- chunk / 向量是内容的派生物，原地改内容必然造成旧向量与新内容不一致。
- 文档实体只引用 OSS 地址（`source_uri` = object_key），worker 自行拉取字节，文件"在哪"与"怎么摄取"解耦。
- 版本化相对"先删后建"的核心优势：切换瞬间检索整体落到新版本，**不产生检索空洞期、不新旧混杂**。

### 为什么放在摄取管线之后

- 版本化的价值闭环（重摄取、版本级状态机、chunk 溯源、失败重试）都依赖摄取产物存在。
- 当前 KB 管理环（注册表 / 文档登记 / 去重 / OSS 落盘 / 统计 / Milvus 原语）已闭环，先行固化不阻塞。
- 摄入链取数契约已就绪：`documents.source_uri` 即 OSS object_key；Milvus 集合为动态字段，摄取写入 `document_id` 即可按文档删向量。

## 2. 实施时机与前置条件

**触发条件**：RAG 摄取与生成管线完成，且满足：

1. 摄取任务链落地（`task_audit` 模型 + Celery 任务 + 上传后入队），文档状态机可被驱动到 `ready`。
2. 摄取写入 Milvus 时带 `document_id` 动态字段（已有 `delete_vectors_by_document` 前向兼容）。
3. 摄取产出 chunk 元数据（PG `chunks` 行或等价的元数据存储），支撑 `/chunks` 浏览与版本溯源。

## 3. 数据模型

### 3.1 documents（扩展）

在现有 `documents` 表上增量演进（不重建）：

| 字段                           | 说明                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `document_id`                  | 主键（现有，保持）                                                                          |
| `kb_name` / `plugin_namespace` | 两轴归属（现有，保持）                                                                      |
| `source_type`                  | `file` / `oss_uri`（扩展枚举）                                                              |
| `source_uri`                   | OSS object_key（现有，保持）                                                                |
| `sha256`                       | 内容指纹，去重/幂等（现有）                                                                 |
| `active_version`               | 新增，int，默认 1                                                                           |
| `status`                       | 新增语义：由 active_version 状态**投影**（ready / outdated / failed），不再直接写摄取过程态 |
| `deleted` / `deleted_time`     | 软删标记（新增）                                                                            |

去重约束不变：`(sha256, kb_name, plugin_namespace)` 同库同文件唯一（现有 `document_dedup` 表承担）。

### 3.2 document_versions（新增）

| 字段                            | 说明                                                      |
| ------------------------------- | --------------------------------------------------------- |
| `version_id`                    | 主键                                                      |
| `document_id`                   | FK → documents                                            |
| `kb_name` / `plugin_namespace`  | 冗余两轴，便于域级隔离与清理                              |
| `version`                       | int，`UNIQUE (document_id, version)`                      |
| `file_key`                      | 该版本字节所在 OSS key                                    |
| `file_size` / `mime`            | 元数据                                                    |
| `sha256`                        | 该版本指纹                                                |
| `status`                        | 版本级摄取状态（见 §4），**摄取状态属于版本，不属于文档** |
| `chunk_count`                   | 该版本已产出块数                                          |
| `error`                         | 失败原因（可 retry）                                      |
| `created_time` / `updated_time` | 时间戳                                                    |

### 3.3 chunks（新增，摄取层写入）

| 字段                                               | 说明                                     |
| -------------------------------------------------- | ---------------------------------------- |
| `chunk_id`                                         | 主键                                     |
| `document_version_id`                              | FK → document_versions（溯源精确到版本） |
| `document_id` / `kb_name` / `plugin_namespace`     | 冗余归属                                 |
| `chunk_index` / `content` / `token_count` / `meta` | 块内容与元数据                           |
| `vector_id`                                        | 对应 Milvus 主键（或按约定推导）         |

**检索语义**：新版本摄取期间旧版本 chunk 仍在检索路径（可用性优先）；切换后旧版本 chunk 异步清理。检索只命中 active_version 的 chunk（`join active_version` 或 `is_active` 标记二选一，实现时定）。

### 3.4 租户维度说明

本设计沿用当前两轴模型（`plugin_namespace` 部署级常量 + `kb_name`）。若未来切换为真多租户（每行 `tenant_id`、请求级解析），需在实施前先定"tenant 从哪来"（JWT claims / 组织表），再全局替换 `plugin_namespace` 维度；本 spec 的模型结构保持不变，仅维度名变化。

## 4. 状态机（版本级）

```
pending → parsing → chunking → embedding → ready
                       ↘ failed（可 retry → 原版本重新入队）
```

- `document.status`：active_version 状态投影——`ready` / `outdated`（非 active 版本就绪）/ `failed`。
- 删除：`soft-deleted` →（异步）`purged`（tombstone 保留审计，或定期物理清除）。

## 5. API 契约

### 5.1 新增/调整端点

| 方法     | 路径                       | 说明                                                               | 时机               |
| -------- | -------------------------- | ------------------------------------------------------------------ | ------------------ |
| `POST`   | `/documents/upload-url`    | 申请预签名直传（返回 key + URL，限大小/类型，15min 过期）          | 增（直传）         |
| `POST`   | `/documents`               | 确认注册（etag/sha256 校验，去重 409，建 version(pending) 并入队） | 增（改造现有）     |
| `POST`   | `/documents/import`        | 从 OSS URI/前缀批量导入（模式 B/C）                                | 增（缓做）         |
| `GET`    | `/documents`               | 列表：状态/来源/时间过滤 + 分页（现有，扩展过滤）                  | 查                 |
| `GET`    | `/documents/{id}`          | 详情：版本历史、状态、错误（扩展）                                 | 查                 |
| `GET`    | `/documents/{id}/download` | 预签名下载（现有）                                                 | 查                 |
| `GET`    | `/documents/{id}/chunks`   | chunk 浏览（`q=` 过滤 + 分页，调试/溯源标配）                      | 查                 |
| `PATCH`  | `/documents/{id}`          | 改元数据（title/标签），**不触发重摄取**（现有，语义明确）         | 改                 |
| `POST`   | `/documents/{id}/versions` | 上传新版本内容 → 重摄取（取代现有 `PUT /file` 的就地替换）         | 改                 |
| `POST`   | `/documents/{id}/retry`    | 失败重试（原版本重新入队）                                         | 改                 |
| `DELETE` | `/documents/{id}`          | 软删除 + 同步清向量 + 异步清理                                     | 删（改造现有硬删） |

### 5.2 变更要点

- **替换现有 `PUT /documents/{id}/file`**：就地替换升级为 `POST /documents/{id}/versions` 版本化重摄取；旧行为（无版本化）在 Phase 2 后废弃。
- **删除改造**：现有同步硬删演进为两步——① 软删（立即可见性消失）+ 向量按 `(kb_name, document_id)` 同步删；② 异步删 chunks 行 / 各版本 OSS 对象 / tombstone。
- **去重逻辑**：版本替换时去重排除自身（现有语义），新版本 sha256 冲突（他文档）→ 409。

## 6. 关键机制

### 6.1 版本切换的原子性

```
摄取 v2 ready
→ 条件更新抢切换权（防并发）：
  UPDATE documents SET active_version = v2
  WHERE document_id = :id AND active_version = v1
→ 抢不到 = 他人已切换/已删除，放弃
→ 检索立即命中 v2 chunk
→ 异步任务清理 v1 的 chunks 行 + 向量点 + OSS 对象
```

期间任何时刻检索结果都是完整新版或完整旧版，不混杂。

### 6.2 直传链路（文件字节不经 API 服务器）

```
① POST /documents/upload-url
   → 服务端生成 file_key = kb/{ns}/{kb}/{doc_id}/v{n}
   → 返回预签名 PUT（仅限该 key、限大小、限 content-type、15min 过期）
② 客户端 PUT 到 OSS
③ POST /documents 确认（带 sha256）
   → HeadObject 核对大小/存在 → sha256 查重 → 建 document + version(pending) → 入队
```

### 6.3 在途任务拦截

软删除后，在途摄取任务通过条件更新拦截：`UPDATE ... WHERE status NOT IN ('deleted')` 拿不到租约即放弃，防止复活已删文档。

### 6.4 向量删除的时效性说明

当前向量库为 Milvus，filter 删除为**最终一致（约 1s 延迟，冒烟已验证）**，与参考设计中的 Qdrant 毫秒级不同。因此"软删 + 同步删向量"存在约 1s 窗口，可接受；若后续要求严格即时，需在检索侧叠加 `deleted` 状态过滤兜底。

## 7. 与现有实现的关系

| 现有实现                                             | Phase 2 演进                           |
| ---------------------------------------------------- | -------------------------------------- |
| `document_dedup (sha256, kb_name, plugin_namespace)` | 保持，即版本化幂等锚点                 |
| `documents.source_uri` = object_key                  | 保持，摄入链取数契约                   |
| `PUT /documents/{id}/file`（就地替换）               | 替换为 `POST /documents/{id}/versions` |
| `DELETE /documents/{id}`（同步硬删）                 | 演进为软删两步 + 异步清理              |
| `delete_vectors_by_document`（前向兼容 no-op）       | 接管为真实按文档删向量                 |
| `POST /documents`（multipart 经服务器）              | 演进为预签名直传 + 确认注册            |
| `rebuild`（400 占位）                                | 接入摄取后按 task_audit 重投           |

## 8. 边界与不做（Phase 2 之后仍缓做）

- **外部桶导入（模式 B）**：STS 临时凭据 / RAM Role AssumeRole / KMS 加密落库是独立基建，等真实客户场景再上。
- **前缀同步（模式 C）**：cron ETag 对比 + OSS 事件 webhook（验签 + 从 key 前缀反解租户，绝不信 payload 租户字段）——多租户新攻击面，缓做。
- 多模态（图片/视频）版本化：等 Knowhere / PixelRAG 类管线接入后另行设计。

## 9. Phase 1 预埋地基（已实施 / 已约定）

完整版本化（索引代、快照、差分摄取）是 Phase 2 特性，但有三块"事后补代价极高"的
地基必须在 Phase 1 埋好。判断口诀：**要改已有数据或已有查询的，现在埋最小版本；
纯新增表和代码的，等信号。**

### 9.1 已实施（随本 spec 落库）

| 地基 | 落点 | 说明 |
| --- | --- | --- |
| ① 版本占位列 | `documents.active_version`（默认 1） | Phase 2 前恒为 1；列存在与否决定 Phase 2 是平滑演进还是停机迁移 |
| ② 向量 payload 约定 | Milvus 动态字段 `document_id` + `document_version_id` | 摄取写入时必须携带（见 milvus_kb_ops 模块文档），否则按文档删向量/版本切换不可用 |
| ③ 模型字段 | `knowledge_bases.embedding_model`（默认 `bge-m3`） | 所有调 embedding 处从 KB 配置读模型，禁止硬编码；换模型=重建 KB |

### 9.2 已约定（摄取 worker 落地时同步实现，半天工作量）

| 地基 | 方案 | 回本场景 |
| --- | --- | --- |
| chunk_hash + embedding 缓存 | `h = sha256(norm_text(chunk.content) + CHUNK_STRATEGY_ID)`；`cache.get/set(h, model, emb)`（Redis 或 PG 表即可） | 重试任务、重传文档、rebuild 从第一天起反复烧 embedding 费用 |

### 9.3 红线（未到信号不做）

- ❌ 索引代（index generation）与切换流程——等第一次换 embedding 模型。
- ❌ 差分摄取 / tree_diff——等重复更新成为真实模式。
- ❌ 快照 manifest——等有"批量发布 + 审计"需求。

### 9.4 过渡信号（出现任一即启动对应 Phase 2 特性）

- 换模型/调切块参数时发现"重建期间检索新旧混杂" → 上索引代。
- OSS 同步场景同一文档重复更新 → 上文档版本切换。
- 客户要"上次导入那批的准确率报告" → 上 snapshot + 评测集。
- embedding 账单显著或 rebuild 成高频 → 上差分摄取。
- 合规审计进场 → snapshot pin + 不可变版本。

## 10. 验收标准

1. 上传新版本后，旧版本 chunk 在切换前仍可检索，切换后检索整体命中新版本，无空洞期。
2. 并发切换场景下条件更新保证只有一个版本生效。
3. 文档删除后：检索不可见、向量在约 1s 内清除、OSS 对象与 chunks 行异步清理，tombstone 保留审计。
4. 失败版本可 `retry` 原版本重新入队，不污染文档层状态。
5. 直传链路下 API 服务器不接触文件字节，仅做元数据与确认。
