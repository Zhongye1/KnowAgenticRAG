---
title: EagleRAG 多租户知识库设计迁移（KB 模块）
description: 将 EagleRAG 的两轴多租户知识库设计迁移到 RAG-F，模块落于 backend/src/app/kb/，与 RAG 摄取/生成解耦
status: 已评审
date: 2026-09-01
---

# EagleRAG 多租户知识库设计迁移（KB 模块）

## 1. 目标与范围

把 EagleRAG 的多租户在线知识库设计完整迁移到 RAG-F（KnowledgeRAG-OGAS）：

- **两轴隔离模型**：`plugin_namespace`（部署级域隔离）+ `kb_name`（请求级知识库隔离）。
- **KB 管理层**：注册表、文档元数据登记、去重原语、标签目录、生命周期（级联删除）、统计、Milvus 隔离原语。
- **与 RAG 摄取/生成解耦**：KB 模块不依赖解析/分块/向量化/检索/生成/任务队列；RAG 层后续作为下游消费者接入。

### 明确不迁移（本轮）

- Knowhere / PixelRAG 多模态摄取管线
- 检索问答、Session/Message、SSE 流式
- MCP 工具集
- 模型绑定（DeepSeek / Qwen）

## 2. 两轴隔离模型

| 轴     | 标识符             | 机制                                        | 变更时机               |
| ------ | ------------------ | ------------------------------------------- | ---------------------- |
| 行业域 | `plugin_namespace` | Milvus Database + PostgreSQL 过滤，实例绑定 | 部署期，运行时不可切换 |
| 知识库 | `kb_name`          | 同一 Database 内共享集合 + 标量过滤         | 请求期，可动态增删     |

- 默认域：`core`（`PLUGIN_NAMESPACE` / `settings.PLUGIN_NAMESPACE`），映射到 Milvus `default` 库。
- 默认 KB：`default`（`KB_NAME` / `settings.KB_NAME`）。
- `kb_name` 正则 `^[a-z0-9_]+$`，不可重命名。
- 守卫：`resolve_namespace()` —— 请求显式传入的 `plugin_namespace` 与实例不一致时返回 403（`ALLOW_NAMESPACE_OVERRIDE` 仅测试用）。
- 术语约定：UI/API 中 `kb_name` 不叫 "namespace"，`namespace` 保留给 `plugin_namespace`。

## 3. 依赖方向

- 请求方向：`api → service → crud → infra`（向下，保持 FBA 分层）。
- 依赖方向：KB 业务层定义契约（`TenantScopedCrud`、`resolve_namespace`、Milvus KB 操作），infra（`milvus_pool` / `milvus_kb_ops`）反向实现并强制约束。
- 多租户过滤**下沉到 CRUD 层统一注入**，不允许各 service 自行拼接。

## 4. 文件结构

```text
backend/src/app/kb/
├── model/                     # knowledge_bases / documents / document_dedup / document_keywords
├── schema/                    # KB / Document / Scope / Tag 的 Pydantic DTO
├── crud/                      # TenantScopedCrud 基类 + CRUDKnowledgeBase/Document/Dedup/Keyword
├── service/                   # namespace / kb_service / kb_stats_service / dedup / tag
├── api/v1/                    # knowledge_bases / documents / tags + router
└── deps.py                    # get_current_tenant（JWT + X-Plugin-Namespace 解析）

backend/src/database/
├── milvus_pool.py             # MilvusClientPool（按 db_name 缓存，禁止 close）
└── milvus_kb_ops.py           # 按 KB 的 count/delete + 基础集合 ensure

backend/src/core/config.py     # + PLUGIN_NAMESPACE / KB_NAME / ALLOW_NAMESPACE_OVERRIDE / 集合名 / 向量维度
backend/src/core/register.py   # + milvus_pool 挂 lifespan

frontend/src/features/knowledge/
├── api/                       # knowledge-bases.ts / documents.ts / types.ts
├── components/                # 列表 / 详情 / 删除确认（复用现有 drawer/button 体系）
└── hooks/                     # use-knowledge-bases
```

## 5. 数据模型（PostgreSQL）

| 表                  | 主键                                  | 关键字段                                                                                        |
| ------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `knowledge_bases`   | `(kb_name, plugin_namespace)`         | display_name, description, theme, icon, pdf_text_page_ratio, collections_used(json)             |
| `documents`         | `document_id`                         | kb_name, plugin_namespace, name, source_type, source_uri, pipeline, status, sha256, chunk_count |
| `document_dedup`    | `(sha256, kb_name, plugin_namespace)` | document_id, object_key, source_name                                                            |
| `document_keywords` | `(document_id, keyword)`              | kb_name, plugin_namespace, node_count                                                           |

- 除主键外，`kb_name` / `plugin_namespace` 均建复合索引。
- 去重语义：同一文件（SHA-256）可存在于多个 KB，同一 KB 内禁止重复。

## 6. Milvus 隔离

- `MilvusClientPool`：进程级缓存，`db_name` 构造即绑定；**禁止 `close()`**（同连接别名共享）。
- 基础集合：`ragf_text`（文本，默认 1536 维）、`ragf_visual`（视觉，默认 2048 维），schema 含动态字段 `kb_name`，建倒排索引。
- 每次 ANN/统计/删除都注入 `kb_name == '...'` 标量过滤；`ensure_database` 自动建库（`auto_create_db`）。

## 7. API 契约（挂 JWT，前缀 `/api/v1`）

| 方法     | 路径                                             | 说明                                            |
| -------- | ------------------------------------------------ | ----------------------------------------------- |
| `GET`    | `/knowledge_bases`                               | 分页列表 + 统计                                 |
| `GET`    | `/knowledge_bases/overview`                      | 跨 KB 聚合                                      |
| `POST`   | `/knowledge_bases`                               | 创建                                            |
| `GET`    | `/knowledge_bases/{kb_name}`                     | 详情 + KPI                                      |
| `GET`    | `/knowledge_bases/{kb_name}/format-distribution` | 文件类型分布                                    |
| `GET`    | `/knowledge_bases/{kb_name}/ingestion-volume`    | 摄入时间序列                                    |
| `GET`    | `/knowledge_bases/{kb_name}/collections`         | Milvus 集合统计                                 |
| `GET`    | `/knowledge_bases/{kb_name}/facets`              | source_type/year/pipeline 分面                  |
| `PATCH`  | `/knowledge_bases/{kb_name}`                     | 部分更新                                        |
| `DELETE` | `/knowledge_bases/{kb_name}`                     | 级联删除（Milvus → documents → dedup → 注册行） |
| `POST`   | `/knowledge_bases/{kb_name}/rebuild`             | 依赖 RAG 层，当前返回明确错误                   |
| `GET`    | `/documents`                                     | 文档列表（只读，按 KB 过滤）                    |
| `GET`    | `/documents/{document_id}`                       | 文档详情                                        |
| `GET`    | `/tags`                                          | 标签目录                                        |

- 所有端点接受可选 `X-Plugin-Namespace` 头，与实例不一致 → 403。
- 删除响应：`{ "deleted": true }`；重复删除 404。

## 8. 生命周期

`DELETE /knowledge_bases/{kb_name}` 级联顺序：

1. Milvus：对 `ragf_text` / `ragf_visual`（及未来插件集合）按 `kb_name` 删除向量
2. PostgreSQL：documents → document_dedup → document_keywords → knowledge_bases 注册行

`rebuild` 与 `reclassify` 依赖 RAG 摄取层（重嵌入/重派发），本轮返回明确错误并在服务层留扩展点。

## 9. 照搬 / 改造 / 重写清单

| EagleRAG 文件            | RAG-F 目标                     | 处理                                              |
| ------------------------ | ------------------------------ | ------------------------------------------------- |
| `db/namespace.py`        | `service/namespace.py`         | 照搬逻辑，异常换 FBA `ForbiddenError`             |
| `index/milvus_pool.py`   | `database/milvus_pool.py`      | 照搬，配置字段适配                                |
| `index/milvus_kb_ops.py` | `database/milvus_kb_ops.py`    | 照搬 expr 写法                                    |
| `kb/registry.py`         | `service/kb_service.py` + crud | 纯逻辑照搬，SQL 改 SQLAlchemy                     |
| `kb/lifecycle.py`        | `service/kb_service.py`        | 级联顺序照搬                                      |
| `kb/stats.py`            | `service/kb_stats_service.py`  | 重写为 FBA service                                |
| `db/models/*`            | `model/*`                      | SQLModel → SQLAlchemy `MappedBase`，主键/索引保留 |
| `api/knowledge_bases.py` | `api/v1/knowledge_bases.py`    | 契约照搬，五层重写 + JWT                          |
| 前端（Next.js）          | `features/knowledge`           | 重写（React + Vite 设计体系）                     |

## 10. 验证

- 后端：`ruff check` / `ruff format` / `mypy`，单元测试覆盖 namespace 守卫、KB CRUD、去重。
- 前端：`tsc --noEmit` / `oxlint`。
- 冒烟：创建 KB → 列表/详情/统计 → 级联删除。
