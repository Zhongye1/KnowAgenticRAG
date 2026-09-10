---
title: 双管线摄取设计（EagleRAG ingest 迁移）
description: Knowhere/PixelRAG 双解析管线接入 RAG-F：策略链路由、任务审计、视觉向量、dedup 后置与 URL 摄取
status: 已实现（P0-P3）
date: 2026-09-10
---

# 双管线摄取设计（EagleRAG ingest 迁移）

## 1. 目标与范围

把 EagleRAG 验证过的摄取管线设计移植到 RAG-F（KnowledgeRAG-OGAS）：

- **编排层**：策略链路由（格式 + 内容形态决定管线）、Celery 任务拆分、细粒度任务审计、dedup 后置登记、URL 摄取 + SSRF 防护。
- **引擎层**：Knowhere 语义解析（api 模式，自建 :5005）与 PixelRAG 视觉管线（render → tiles → Qwen3-VL-Embedding）。
- **落点**：全部写入 RAG-F 既有设施——Milvus 模板集合（dense + 服务端 BM25）、PG chunks 双写、ACL 镜像、`ragf_visual` 预留集合、reconcile 对账。

### 明确不做 / 后续项（按价值排序）

| 项 | 原因 | 去向 |
| --- | --- | --- |
| Knowhere 图表 chunk → 视觉索引子任务（`knowhere_visual_chunks`） | 依赖 Knowhere api 服务实测产物形态 | spec §8 |
| 检索侧视觉融合（text + visual 双路召回融合策略） | 融合策略需单独设计（视觉命中非 chunk 形态） | spec §8（ops 层 `search_visual` 已就绪） |
| SSE 任务进度流 + 前端 | 需联调后端事件通道与前端生成物再生成 | spec §8（jobs 轮询 API 已就绪） |
| Knowhere parser 进程内模式 | 引入 MinerU 进 worker 镜像，重依赖 | P4 |
| 本地 HF 视觉编码器（torch） | 免 GPU 部署优先，DashScope 已覆盖 | P4（编码器协议已定义） |
| EagleRAG 插件钩子总线（hookbus） | RAG-F 扩展点走 `plugin_namespace`（D8 规范），不引入第二套机制 | 不做 |

## 2. 决策记录

| 编号 | 决策 | 理由 |
| --- | --- | --- |
| D1 | 整体拓扑：路由任务 → knowhere / visual 双管线（legacy 工厂链初始保留为兜底，后随 §7.1 整体删除）；引擎依赖为可选组件（惰性导入 + fail-closed），不进 uv.lock | 解析引擎按部署形态安装（api 模式零重依赖）；缺包显式报错，绝不静默 mock |
| D2 | KB 级开关：`knowledge_bases.routing_mode`（auto/text/visual/hybrid），KB 行优先于全局 `RAGF_ROUTING_MODE`；未上线直接全量切换，默认 auto 且无 legacy 取值（§7.1） | 出厂即双管线；引擎异常靠路由期 fail-closed 暴露，不做静默兜底 |
| D3 | 路由策略链（对齐 EagleRAG 优先级）：文件名前缀强制 > 生效模式强制 > HTTP URI > PDF 形态探测 > 扩展名 > 默认管线；探测阈值 KB 级自适应（`pdf_text_page_ratio`）；引擎不可用路由期 fail-closed 报错（§7.1 起，无 legacy 兜底） | 前缀是运维逃生门；形态探测让扫描件走视觉、文本 PDF 走语义解析；不可用引擎路由期拦截而非派发后失败 |
| D4 | 任务拆分与队列：`ingest.process_document`（路由入口）→ `knowhere.parse_document` / `visual.parse_document`；`RAGF_CELERY_KNOWHERE_QUEUE` / `RAGF_CELERY_VISUAL_QUEUE` 与既有 ingest 队列同模式（None=默认队列，拓扑不变）；visual worker 并发=1 | 延续 M8 拆分演练模式；解析与视觉编码资源画像不同，独立扩缩容 |
| D5 | `ingest_jobs` 审计表：状态机 pending → running(stage: routing/rendering/embedding/indexing) → success/failed；`job_id = Celery task_id`；成功跳过、重投递桥接；documents.status 保持粗粒度镜像不动 | 用户可见细粒度进度，前端零改动即可继续轮询旧状态 |
| D6 | Knowhere 产物映射：chunk → PG chunks（meta 存 path/level/summary/keywords/page_nums/connect_to）+ ragf_text 行（动态字段 chunk_type/path/level）；章节摘要节点 `chunk_type='section_summary'` 与内容 chunk 共享 path 前缀（parent-doc 检索）；关键词聚合进 `document_keywords`；doc_nav/文档摘要 → `documents.structure`/`summary`；ACL 镜像字段（namespace/visibility/owner_id/groups）逐行穿透 | 不绕开既有双写与 BM25；所有标量随行写，检索过滤无二次查询 |
| D7 | 视觉管线：pixelrag_render 渲染切片 → DashScope qwen3-vl-embedding（2048d，摄取与查询同 provider）→ tile 图落 MinIO + 向量写 ragf_visual；集合 schema 带 ACL 镜像（namespace 分区键）与编码器指纹（provider:model:dim），指纹不一致且非空拒绝重建 | 填补预留集合；指纹守卫防两个向量空间混用；切换 provider 必须重建集合 |
| D8 | 摄取限额：200 MiB / 200 页（MinerU 精提取上限），三道关口——API 上传预检（422 结构化 detail）、worker 防御复检、URL 下载限量流式断点 | 引擎上限前置到入口，避免派发后必失败；pypdfium2 数页不引新依赖 |
| D9 | dedup 后置登记：上传/替换只做 409 预检，指纹在管线成功后写入；`register` 改 SAVEPOINT 冲突容忍（原 `db.rollback()` 会摧毁调用方事务） | 失败摄取不残留指纹挡重传；并发同指纹以先成功者为准 |
| D10 | URL 摄取：默认关闭（`RAGF_URL_INGEST_ENABLED`）；四步防护——格式校验 → SSRF（DNS 解析拒私网/环回/云元数据，带硬超时）→ 部署出网白名单 → 限量流式下载（重定向后最终 URL 复检 SSRF）；仅接受文件直链 | 多租户产品比 EagleRAG 更不能信任用户 URL；网页正文提取（CDP 渲染）依赖浏览器，不在本期 |

## 3. 数据流

```
POST /documents/ingest (multipart)      POST /documents/ingest/url (D10, 默认关)
        │ 限额预检 D8 / dedup 409 预检 D9          │ 格式→SSRF→白名单→限量下载 D10
        ▼                                          ▼
   MinIO 原件 ◄────────────────────────────────────┘
        │  send_task(ingest.process_document)
        ▼
┌─ 路由任务（spec D3 策略链）────────────────────────────┐
│ 前缀 knowhere:/pixelrag: → KB routing_mode → URL →    │
│ PDF 形态探测（pdf_text_page_ratio）→ 扩展名 → 默认     │
│ 产出: [knowhere] / [visual] / [knowhere,visual]            │
└──────────────┬───────────────────────────────────────┘
               │ 建 ingest_jobs 行（D5）→ 按队列派发（D4）
   ┌───────────┴────────────┐
   ▼                        ▼
 knowhere.parse_document   visual.parse_document
 Knowhere SDK(:5005)       pixelrag_render → tiles
 → chunks+doc_nav          → DashScope 编码 2048d
 → bge-m3 embedding        → tile 图 → MinIO
                             → ragf_visual（ACL 镜像）
   │           │                          │
   ▼           ▼                          ▼
┌─ 落盘（PG 为事实源，Milvus/MinIO 为镜像）──────────────┐
│ PostgreSQL: documents(+structure/summary) / chunks /  │
│             ingest_jobs / document_keywords / dedup D9 │
│ Milvus: ragf_text_{dim}(dense+BM25+ACL) / ragf_visual │
│ MinIO: 原件 / __parsed__.md / tiles/                    │
└──────────────────────────────────────────────────────┘
```

## 4. 落点清单（本 spec 对应的提交 281a2bd / 40cf05a / 3670ad6 / 5205ba2）

| 模块 | 文件 |
| --- | --- |
| 路由 | `backend/src/app/ingest/routing/`（context / selectors / pdf_probe / router） |
| 引擎 | `backend/src/app/ingest/engine/`（knowhere / pixelrag / visual_encoder / availability） |
| 映射/编排 | `backend/src/app/ingest/service/`（knowhere_mapping / knowhere_service / visual_service / job_service） |
| 任务 | `backend/src/app/ingest/tasks/`（tasks 重构 / knowhere / visual / metrics） |
| 审计 | `backend/src/app/ingest/model/ingest_job.py` + `crud/crud_job.py` |
| API | `api/v1/jobs.py`（进度查询）、`api/v1/url_ingest.py`（URL 摄取） |
| 防护 | `app/ingest/limits.py`、`app/ingest/url_validator.py` |
| 存储 | `backend/src/database/milvus_visual_ops.py`（ragf_visual） |
| 演进列 | `database/ragf_schema_migrations.py`（routing_mode / summary / structure） |
| 部署 | `docker-compose.yml`（knowhere/visual worker，profile ragf-ingest）、`Dockerfile`、`deploy/backend/supervisor/*.conf` |

## 5. 与 EagleRAG 的关键差异

- **租户与权限**：所有任务 kwargs、Milvus 行、MinIO 对象键穿透 `plugin_namespace` + ACL 镜像（EagleRAG 仅 kb_name 透传）；ACL 变更传播扩展到视觉集合。
- **文本检索**：保留 bge-m3 + 服务端 BM25 混检 RRF（EagleRAG 为 LlamaIndex 纯 dense），Knowhere chunk 作为新数据源进入既有模板集合而非另建索引。
- **一致性**：保留 reconcile 对账并扩展视觉管线（EagleRAG 无对账）；PG chunks 双写 + 向量补偿语义不变。
- **路由阈值**：PDF 探测阈值接 KB 级 `pdf_text_page_ratio`（EagleRAG 为全局配置）。

## 6. 部署启用指引

**千问平台 token（D11 扩展）**：文本向量 / 重排 / 视觉向量统一走阿里云百炼 ——
`DASHSCOPE_API_KEY` + dashscope SDK（`MultiModalEmbedding.call` / `TextReRank.call`）。
启动时幂等注册 `dashscope` provider（`qwen3.7-text-embedding-flash` 文本向量，
dimension 对齐 `RAGF_TEMPLATE_DIM`；`qwen3-vl-embedding` 多模态向量 2048 维；
`qwen3.7-text-rerank` SDK 重排通道）。新 KB 默认 embedding spec = `dashscope:qwen3.7-text-embedding-flash`，
全局默认精排 = `dashscope:qwen3.7-text-rerank`；既有 KB 保持原模型不变（换模型 = 重建 KB）。

1. Knowhere api 模式：部署 Knowhere 服务（:5005，compose 占位注释）→ `.env.server` 设 `RAGF_KNOWHERE_MODE=api`、`RAGF_KNOWHERE_BASE_URL`；worker 侧可选装 `knowhere-python-sdk`。
2. 视觉管线：`.env.server` 设 `DASHSCOPE_API_KEY`；visual worker 可选装 `pixelrag`（git 依赖）。
3. 队列拆分：`.env.server` 设 `RAGF_CELERY_KNOWHERE_QUEUE=knowhere` / `RAGF_CELERY_VISUAL_QUEUE=visual` → `docker compose --profile ragf-ingest up -d ragf_celery_knowhere_worker ragf_celery_visual_worker`。
4. 灰度：**未上线直接全量切换**——默认值已改为 `RAGF_ROUTING_MODE='auto'`、`RAGF_KNOWHERE_MODE='api'`、新 KB `routing_mode='auto'`，且 knowhere 扩展集含 pdf/docx/pptx/md/txt/csv（office/文本格式不再走 legacy 工厂）；图片/扫描 PDF 走 visual。仅需部署 Knowhere 服务 + `DASHSCOPE_API_KEY`。既有 dev 库执行 `UPDATE knowledge_bases SET routing_mode='auto'` 或重建。异常回退 = 修复引擎（起 Knowhere / 补 key）后 `POST /{kb}/rebuild`。

## 7. 风险与守护

- **架构契约**：ingest 域新增分层契约（api→service→crud→model）；`kb → retrieval` 为 master 存量违规，本 spec 补豁免并标注待反转。
- **成本**：Knowhere LLM/VLM 摘要与 DashScope 编码按量计费 → 产物开关默认关闭、visual worker 并发=1。
- **幂等**：全量替换语义（先删后插）在三条管线一致；`prepare_run` 桥接 worker 重启重投递；hybrid 模式两管线并发回写 `documents.status` 以文本管线完成态为准（chunk_count 语义 = 文本块数）。

## 7.1 legacy 工厂链删除（未上线直接迁移）

双管线默认化后（`RAGF_ROUTING_MODE='auto'`、`RAGF_KNOWHERE_MODE='api'`、knowhere 扩展集含
pdf/docx/pptx/md/txt/csv），legacy 解析链整体删除：

- 删除：`app/ingest/parser/`（factory/registry/base + direct_text/office_text/mineru_public/rapid_ocr）、
  `app/ingest/chunking/`（dispatcher/presets/parsers，`count_tokens` 内联进 knowhere_mapping）、
  `ingest_service.run_document_ingest` 及 preset/ocr 指纹、上传 API 的 `chunk_preset_id`/`ocr_engine` 参数、
  配置组 `RAGF_MINERU_*`/`MINERU_API_TOKEN`/`RAGF_OCR_ENGINE`
- 依赖删除：rapidocr / onnxruntime / python-docx / python-pptx（pypdfium2 保留——限额与 PDF 形态探测在用）
- 语义变化：引擎不可用从「回退 legacy」改为 **路由期 fail-closed 报错**——摄取硬依赖
  Knowhere 服务 + DASHSCOPE_API_KEY；`routing_mode` 取值不再含 `legacy`

## 8. 后续工作

1. `knowhere_visual_chunks` 子任务：Knowhere 解析产物中的图表 chunk → 视觉索引（携带 parent_section/source_chunk_id 回链）。
2. 检索融合：`search_visual`（ops 层就绪）接入 retrieval 策略链，定义 text+visual 命中融合与 rerank 策略。
3. SSE 进度流：`ingest_jobs` 变更推送 + 前端 `generate:api` 再生成与进度组件。
4. Knowhere parser 进程内模式、本地 HF 视觉编码器（协议已就位）。
