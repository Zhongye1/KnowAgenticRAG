








根据 [Eagle-RAG 官方 API 文档](https://zhiweio.github.io/EagleRAG/api/)，以下是完整的 REST API 端点列表，按功能模块分类整理：

---

## 1. 基础设施 (Infrastructure)

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/` | 应用名称、版本、文档链接 |
| `GET` | `/metrics` | Prometheus 指标采集 |
| `GET` | `/health` | Docker / HAProxy 存活探针 |

---

## 2. 查询与搜索 (Query & Search)

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/query` | 完整 RAG 问答（路由→检索→生成→持久化） |
| `POST` | `/query/stream` | **SSE** 流式问答（step + token 事件） |
| `POST` | `/search` | 纯检索（无 LLM 生成） |
| `POST` | `/search/stream` | **SSE** 流式检索（step + sources 事件） |
| `GET` | `/tags` | 标签目录（用于 Scope Filter UI） |

---

## 3. 会话 (Sessions)

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/sessions` | 会话列表（支持 `limit`/`offset`/`kb_name` 筛选） |
| `POST` | `/sessions` | 显式创建会话 |
| `GET` | `/sessions/{session_id}` | 获取单个会话元数据 |
| `PATCH` | `/sessions/{session_id}` | 更新会话标题 |
| `DELETE` | `/sessions/{session_id}` | 级联删除会话及消息 |
| `GET` | `/sessions/{session_id}/messages` | 分页获取会话消息历史 |

---

## 4. 文档摄入 (Ingest)

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/ingest/validate/file` | 文件预检（大小、PDF 页数等） |
| `POST` | `/ingest/validate/url` | URL 预检（可达性、SSRF、内容类型） |
| `POST` | `/ingest` | 统一入队入口（文件上传或 URL） |
| `GET` | `/ingest/queue-metrics` | 各 Celery 队列深度与并发数 |

---

## 5. 任务 (Tasks)

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/tasks` | 任务审计记录列表（支持状态/管道/KB 筛选） |
| `GET` | `/tasks/{job_id}` | 单个任务详情 |
| `GET` | `/tasks/{job_id}/stream` | **SSE** 实时进度订阅（`progress`/`timeout` 事件） |
| `GET` | `/tasks/{job_id}/logs` | 获取任务日志 |
| `POST` | `/tasks/{job_id}/retry` | 重试失败任务 |
| `DELETE` | `/tasks/{job_id}` | 删除审计记录（不删索引文档） |

---

## 6. 文档与证据 (Documents & Images)

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/documents` | 文档库列表（支持模糊搜索、状态、类型筛选） |
| `GET` | `/documents/{document_id}` | 单个文档元数据 |
| `GET` | `/documents/{document_id}/structure` | 语义结构树（Knowhere 解析结果） |
| `GET` | `/documents/{document_id}/file` | 原始文件流或 307 重定向 |
| `GET` | `/documents/{document_id}/chunks/{chunk_id}` | 获取 Chunk HTML（表格/视觉块） |
| `DELETE` | `/documents/{document_id}` | 删除文档注册行 |
| `GET` | `/images/{image_id}` | 原始 PNG 视觉切片字节流 |
| `GET` | `/images/{image_id}/meta` | 图片元数据 |

---

## 7. 知识库 (Knowledge Bases)

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/knowledge_bases` | 知识库列表（含实时统计） |
| `GET` | `/knowledge_bases/overview` | 跨 KB 聚合仪表盘 KPI |
| `POST` | `/knowledge_bases` | 创建知识库 |
| `GET` | `/knowledge_bases/{kb_name}` | 单个知识库详情 + KPI |
| `GET` | `/knowledge_bases/{kb_name}/format-distribution` | 文件类型分布 |
| `GET` | `/knowledge_bases/{kb_name}/ingestion-volume` | 摄入时间序列（1-90 天） |
| `GET` | `/knowledge_bases/{kb_name}/collections` | Milvus 集合统计 |
| `GET` | `/knowledge_bases/{kb_name}/facets` | source_type/year/pipeline 分面 |
| `PATCH` | `/knowledge_bases/{kb_name}` | 部分更新（显示名/主题/图标等） |
| `DELETE` | `/knowledge_bases/{kb_name}` | **危险**：彻底清空 KB（含 Milvus + MinIO） |
| `POST` | `/knowledge_bases/{kb_name}/rebuild` | 触发全量重建索引 |

---

## 8. 附件 (Attachments)

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/attachments` | 上传临时附件（查询级上下文，不入 Milvus） |
| `GET` | `/attachments/{attachment_id}` | 附件元数据 |
| `GET` | `/attachments/{attachment_id}/content` | 原始字节流 |
| `DELETE` | `/attachments/{attachment_id}` | 删除附件 |

---

## 9. 通知 (Notifications)

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/notifications` | 通知列表（支持已读/未读筛选） |
| `PATCH` | `/notifications/{notification_id}` | 标记单条已读 |
| `POST` | `/notifications/read-all` | 批量标记已读 |

---

## 10. 健康探针 (Health)

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 依赖连通性（PostgreSQL/Redis/Milvus/MinIO/Knowhere/PixelRAG/VLM/Celery） |
| `GET` | `/health/plugins` | 插件清单、Celery 模块、最近审计决策 |
| `GET` | `/mcp/tools` | MCP 工具静态目录 |

---

## 11. 运维管理 (Admin)

### 基础设施仪表盘

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/admin/celery` | Workers、活跃任务、队列深度 |
| `GET` | `/admin/milvus` | 集合行数、各 KB 分区 |
| `GET` | `/admin/minio` | Bucket 与对象数量 |
| `GET` | `/admin/redis` | 内存与连接数 |
| `GET` | `/admin/knowhere` | 远程解析器健康 |
| `GET` | `/admin/pixelrag` | 进程内库状态 |
| `GET` | `/admin/vlm` | Qwen-VL 探针 |
| `GET` | `/admin/mcp` | 最近 MCP 调用日志 |
| `GET` | `/admin/config` | 脱敏配置快照 |
| `GET` | `/admin/probes` | 探针配置与最近结果 |

### 变更操作

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` / `PATCH` | `/admin/model-router` | 读取/更新路由模式覆盖 |
| `GET` / `PATCH` | `/admin/resource-limits` | 运维调参旋钮 |
| `POST` | `/admin/actions/{action}` | 受控维护动作 |

### 实时日志

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/admin/logs` | **SSE** 实时日志流（`log`/`heartbeat` 事件） |

---

## 12. MCP 传输

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/mcp` | MCP Streamable HTTP 端点（默认路径，可配置） |

---

### 关键约定速查

- **分页**：列表接口返回 `{ items: [...], limit, offset }`，部分含 `total`
- **删除响应**：`{ "deleted": true }`，重复删除返回 `404`
- **SSE 格式**：`event: <name>\r\ndata: <json>\r\n\r\n`
- **多租户**：`kb_name` 为请求级隔离，`plugin_namespace` 为部署级域隔离
- **认证**：REST 路由默认**无认证**，需部署在内网或网关后

如需查看任意端点的详细请求/响应 Schema 或 SSE 事件格式，可前往对应模块的文档页进一步展开。