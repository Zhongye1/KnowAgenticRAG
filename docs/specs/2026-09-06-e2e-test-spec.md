---
title: E2E 测试规范
description: KnowledgeRAG-OGAS 端到端测试方案，覆盖 RAG 核心流程、MCP 工具面、管理功能
status: 待实现
date: 2026-09-06
---

# E2E 测试规范（Spec）

## 0. 文档信息

| 项 | 内容 |
| --- | --- |
| 状态 | 待实现 |
| 日期 | 2026-09-06 |
| 范围 | 端到端测试方案 + 接口清单 + 测试用例设计 |
| 技术栈 | pytest + httpx（异步HTTP客户端） |
| 依赖环境 | PostgreSQL + Milvus + MinIO + Redis + Celery Worker |

## 1. 目标与范围

### 1.1 目标

1. 验证 RAG 核心链路的端到端正确性：上传 → 摄取 → 检索 → 问答 → 引用
2. 验证 MCP 工具面的可用性：工具调用、鉴权、审计日志
3. 验证管理功能的完整性：知识库 CRUD、文档管理、模型配置
4. 建立可重复运行的自动化测试套件，支持 CI/CD 集成

### 1.2 范围

**覆盖模块**：
- Auth（认证授权）
- KB（知识库管理）
- Document（文档管理）
- Ingest（文档摄取）
- Retrieval（检索）
- Chat（问答）
- MCP（工具面）
- Model Provider（模型供应商）

**不覆盖**：
- Admin 系统管理（部门/菜单/数据规则/日志/监控）
- Plugin（OAuth2/Email）
- Task 调度（Schedulers）
- 前端页面

### 1.3 接口精简清单

| 模块 | 接口 | 方法 | 路径 | 测试优先级 |
|------|------|------|------|-----------|
| **Auth** | 登录 | POST | `/api/v1/auth/login` | P0 |
| | 刷新token | POST | `/api/v1/auth/refresh` | P1 |
| **KB** | 列表 | GET | `/api/v1/knowledge_bases` | P0 |
| | 概览 | GET | `/api/v1/knowledge_bases/overview` | P1 |
| | 创建 | POST | `/api/v1/knowledge_bases` | P0 |
| | 详情 | GET | `/api/v1/knowledge_bases/{kb_name}` | P0 |
| | 更新 | PATCH | `/api/v1/knowledge_bases/{kb_name}` | P1 |
| | 删除 | DELETE | `/api/v1/knowledge_bases/{kb_name}` | P0 |
| | 文件类型分布 | GET | `/api/v1/knowledge_bases/{kb_name}/format-distribution` | P2 |
| | 摄入时间序列 | GET | `/api/v1/knowledge_bases/{kb_name}/ingestion-volume` | P2 |
| **Document** | 上传 | POST | `/api/v1/documents` | P0 |
| | 列表 | GET | `/api/v1/documents` | P0 |
| | 详情 | GET | `/api/v1/documents/{document_id}` | P0 |
| | 下载链接 | GET | `/api/v1/documents/{document_id}/download` | P1 |
| | 更新元数据 | PATCH | `/api/v1/documents/{document_id}` | P1 |
| | 删除 | DELETE | `/api/v1/documents/{document_id}` | P0 |
| **Ingest** | 摄取 | POST | `/api/v1/knowledge_bases/{kb_name}/ingest` | P0 |
| | 状态查询 | GET | `/api/v1/knowledge_bases/{kb_name}/documents/{document_id}/status` | P0 |
| | 重摄取 | POST | `/api/v1/knowledge_bases/{kb_name}/rebuild` | P1 |
| **Retrieval** | 搜索 | POST | `/api/v1/knowledge_bases/{kb_name}/search` | P0 |
| **Chat** | 问答 | POST | `/api/v1/knowledge_bases/{kb_name}/chat` | P0 |
| **Model Provider** | 列表 | GET | `/api/v1/system/model-providers` | P0 |
| | 详情 | GET | `/api/v1/system/model-providers/{provider_id}` | P1 |
| | 创建 | POST | `/api/v1/system/model-providers` | P0 |
| | 删除 | DELETE | `/api/v1/system/model-providers/{provider_id}` | P1 |
| | 连通性测试 | POST | `/api/v1/system/model-providers/test-connection` | P0 |
| **MCP** | 工具目录 | GET | `/mcp/tools` | P0 |
| | JSON-RPC | POST | `/mcp` | P0 |

**总计**：30 个核心测试接口

## 2. 测试架构

### 2.1 目录结构

```text
backend/
├── e2e/
│   ├── __init__.py
│   ├── conftest.py                    # E2E 配置、fixtures、跳过规则
│   ├── fixtures/
│   │   ├── __init__.py
│   │   ├── auth.py                    # 认证 fixture
│   │   ├── knowledge_base.py          # KB 生命周期管理
│   │   └── document.py                # 文档上传、摄取轮询
│   ├── test_auth_e2e.py               # 认证流程（2 用例）
│   ├── test_kb_management_e2e.py      # 知识库 CRUD（6 用例）
│   ├── test_document_ingest_e2e.py    # 文档上传+摄取（8 用例）
│   ├── test_retrieval_e2e.py          # 检索流程（4 用例）
│   ├── test_chat_e2e.py               # 问答流程（3 用例）
│   ├── test_mcp_e2e.py                # MCP 工具调用（6 用例）
│   └── test_full_pipeline_e2e.py      # 端到端全流程（3 用例）
└── tests/
    └── ...（现有单元/集成测试）
```

### 2.2 测试分类

| 类型 | 说明 | 运行条件 |
|------|------|---------|
| **P0（冒烟）** | 核心流程最小验证 | 每次 CI 运行 |
| **P1（回归）** | 完整功能验证 | PR 合并前运行 |
| **P2（扩展）** | 统计/辅助功能 | 可选运行 |

### 2.3 执行策略

```bash
# P0 冒烟测试（CI 每次运行）
pytest e2e/ -m "p0" --tb=short

# P1 回归测试（PR 合并前）
pytest e2e/ -m "p1 or p0" --tb=short

# 全量测试
pytest e2e/ --tb=short

# 指定模块
pytest e2e/test_chat_e2e.py -v
```

## 3. 测试数据策略

### 3.1 命名规范

```python
# 测试 KB：test_{uuid}
# 示例：test_a1b2c3d4

# 测试文档：test_doc_{uuid}
# 示例：test_doc_e5f6g7h8
```

### 3.2 生命周期管理

```python
@pytest.fixture(scope="function")
async def test_kb(auth_client):
    """创建测试 KB，测试后自动清理"""
    kb_name = f"test_{uuid.uuid4().hex[:8]}"
    
    # Setup: 创建 KB
    resp = await auth_client.post("/api/v1/knowledge_bases", json={"kb_name": kb_name, ...})
    assert resp.status_code == 200
    
    yield kb_name
    
    # Teardown: 级联删除
    await auth_client.delete(f"/api/v1/knowledge_bases/{kb_name}")
```

### 3.3 隔离性保证

- 每个测试函数使用独立 KB（`scope="function"`）
- 测试间无数据依赖
- 失败后自动清理（fixture teardown）
- 支持并发运行（`pytest-xdist`）

## 4. 测试用例设计

### 4.1 Auth E2E（2 用例）

| # | 用例 | 前置条件 | 步骤 | 预期结果 |
|---|------|---------|------|---------|
| A01 | 登录获取token | 已创建用户 | POST /auth/login | 返回 access_token + refresh_token |
| A02 | 刷新token | 有效 refresh_token | POST /auth/refresh | 返回新 access_token |

### 4.2 KB Management E2E（6 用例）

| # | 用例 | 前置条件 | 步骤 | 预期结果 |
|---|------|---------|------|---------|
| KB01 | 创建知识库 | 已登录 | POST /knowledge_bases | 返回 kb_name |
| KB02 | 获取知识库列表 | 已创建KB | GET /knowledge_bases | 包含测试KB |
| KB03 | 获取知识库详情 | 已创建KB | GET /knowledge_bases/{kb_name} | 返回完整信息 |
| KB04 | 更新知识库 | 已创建KB | PATCH /knowledge_bases/{kb_name} | 更新成功 |
| KB05 | 获取概览统计 | 已创建KB+文档 | GET /knowledge_bases/overview | 返回聚合数据 |
| KB06 | 删除知识库 | 已创建KB | DELETE /knowledge_bases/{kb_name} | 级联清理完成 |

### 4.3 Document + Ingest E2E（8 用例）

| # | 用例 | 前置条件 | 步骤 | 预期结果 |
|---|------|---------|------|---------|
| DI01 | 上传文档 | 已创建KB | POST /documents | 返回 document_id |
| DI02 | 触发摄取 | 文档已上传 | POST /ingest | 返回 task_id，状态=pending |
| DI03 | 查询摄取状态 | 摄取已触发 | GET /status | 状态流转至 ready |
| DI04 | 获取文档列表 | 文档已摄取 | GET /documents | 包含测试文档 |
| DI05 | 获取文档详情 | 文档已摄取 | GET /documents/{id} | 返回完整信息+chunk_count |
| DI06 | 下载文档链接 | 文档已摄取 | GET /download | 返回预签名URL |
| DI07 | 重摄取文档 | 文档已摄取 | POST /rebuild | 重新触发摄取链 |
| DI08 | 删除文档 | 文档已创建 | DELETE /documents/{id} | 级联清理完成 |

### 4.4 Retrieval E2E（4 用例）

| # | 用例 | 前置条件 | 步骤 | 预期结果 |
|---|------|---------|------|---------|
| R01 | 基础检索 | KB有已摄取文档 | POST /search | 返回 hits 数组 |
| R02 | 带过滤检索 | 文档有元数据 | POST /search + filters | 过滤生效 |
| R03 | 多KB检索 | 多个KB有文档 | search_multi | 跨KB结果合并 |
| R04 | 引用溯源 | 检索返回结果 | 检查引用字段 | 包含 document_id, chunk_id, score |

### 4.5 Chat E2E（3 用例）

| # | 用例 | 前置条件 | 步骤 | 预期结果 |
|---|------|---------|------|---------|
| C01 | SSE流式问答 | KB有已摄取文档 | POST /chat (SSE) | 返回 meta/delta/done 事件 |
| C02 | 无命中短路 | 空KB | POST /chat | 返回 meta.hit=0 + 提示文案 |
| C03 | 引用返回 | 有命中 | POST /chat | citation 事件包含引用列表 |

### 4.6 MCP E2E（6 用例）

| # | 用例 | 前置条件 | 步骤 | 预期结果 |
|---|------|---------|------|---------|
| M01 | 获取工具目录 | 已认证 | GET /mcp/tools | 返回工具JSON Schema列表 |
| M02 | list_knowledge_bases | 已有KB | tools/call | 返回KB列表 |
| M03 | search_knowledge | KB有文档 | tools/call | 返回hits+引用 |
| M04 | answer_with_citations | KB有文档 | tools/call | 返回answer+citations |
| M05 | 未授权调用 | 无token | POST /mcp | 401 Unauthorized |
| M06 | 审计日志 | 任意调用 | 检查call_log | 记录工具/耗时/结果码 |

### 4.7 Full Pipeline E2E（3 用例）

| # | 用例 | 步骤 | 验证点 |
|---|------|------|--------|
| FP01 | 完整RAG流程 | 创建KB → 上传文档 → 摄取 → 检索 → 问答 | 全链路正确性 |
| FP02 | 多文档场景 | 上传3个文档 → 摄取 → 检索 → 验证排序 | 相关性排序正确 |
| FP03 | 并发摄取 | 同时上传3个文档 → 并发摄取 → 全部成功 | 幂等性+无冲突 |

## 5. 环境与配置

### 5.1 环境要求

```text
PostgreSQL 16  → localhost:5432（测试库 ragf_test）
Milvus 2.5     → localhost:19530
MinIO          → localhost:9000
Redis 7        → localhost:6379
Celery Worker  → 运行中（消费 ingest 队列）
```

### 5.2 配置项

```python
# e2e/conftest.py
E2E_BASE_URL = "http://localhost:8000"
E2E_TEST_DB = "ragf_test"
E2E_TIMEOUT = 300  # 摄取超时（秒）
E2E_POLL_INTERVAL = 2  # 状态轮询间隔（秒）
```

### 5.3 跳过规则

```python
# 外部服务不可用时自动跳过
@pytest.fixture(scope="session", autouse=True)
def check_e2e_deps():
    if not is_postgres_reachable():
        pytest.skip("PostgreSQL 不可用")
    if not is_milvus_reachable():
        pytest.skip("Milvus 不可用")
```

## 6. CI/CD 集成

### 6.1 GitHub Actions 配置

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on:
  pull_request:
    branches: [main, develop]
  
jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres: ...
      milvus: ...
      redis: ...
      minio: ...
    
    steps:
      - uses: actions/checkout@v4
      - name: Run E2E Tests
        run: |
          cd backend
          pip install -e ".[dev]"
          pytest e2e/ -m "p0" --tb=short --junitxml=e2e-results.xml
```

### 6.2 测试报告

```bash
# 生成 HTML 报告
pytest e2e/ --html=reports/e2e.html --self-contained-html

# 生成 JUnit XML（CI 集成）
pytest e2e/ --junitxml=e2e-results.xml
```

## 7. 实现计划

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 1 | 基础 fixtures + Auth + KB | 1 天 |
| Phase 2 | Document + Ingest + Retrieval | 2 天 |
| Phase 3 | Chat + MCP | 1 天 |
| Phase 4 | Full Pipeline + CI 集成 | 1 天 |
| **总计** | | **5 天** |

## 8. 验收标准

1. 所有 P0 用例通过（`pytest e2e/ -m "p0"` → 全绿）
2. 测试覆盖率 > 80%（核心接口）
3. 单次运行时间 < 10 分钟
4. 可重复运行 10 次无随机失败
5. CI 集成完成，PR 自动触发

## 9. 相关文档

- [2026-08-21-agentic-rag-系统设计.md](./2026-08-21-agentic-rag-系统设计.md) — RAG 核心设计
- [2026-08-25-rag-api设计与落地路线.md](./2026-08-25-rag-api设计与落地路线.md) — API 清单
- [2026-09-05-agent-layer-and-mcp-design.md](./2026-09-05-agent-layer-and-mcp-design.md) — MCP 设计
- [前后端基础架构 Spec](./2026-09-02-frontend-backend-architecture-spec.md) — 现有架构
