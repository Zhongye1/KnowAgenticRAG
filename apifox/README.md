# KnowledgeRAG-GZHU — Apifox 接入指南

> **一句话定位**：本目录是 Apifox 的"接入包"，含环境配置、导入指引和调试手册，所有接口文档由 FastAPI 自动生成，无需手写维护。

---

## 目录结构

```
apifox/
├── README.md                    ← 本文件，快速上手总览
├── environments/
│   ├── env_local.json           ← 本地开发环境（localhost:8000）
│   └── env_server.json          ← 云服务器环境（8.163.51.93:8000）
├── collections/
│   └── KnowledgeRAG_API.json    ← 可直接导入 Apifox 的接口集合（OpenAPI 格式）
├── scripts/
│   ├── pre_login.js             ← 登录前置脚本（自动获取 Token）
│   └── pre_request_auth.js      ← 全局 Auth 注入脚本
└── tests/
    └── smoke_test.apifox.json   ← 冒烟测试套件（7 条核心接口）
```

---

## 快速上手（5 步搞定）

### Step 1 — 安装 Apifox

前往 [https://apifox.com](https://apifox.com) 下载桌面版（Windows/Mac/Linux 均支持）。

### Step 2 — 导入环境

1. 打开 Apifox → 左侧「环境管理」→「导入」
2. 分别导入 `environments/env_local.json` 和 `environments/env_server.json`
3. 开发时切「本地」，部署验证时切「服务器」

### Step 3 — 从 FastAPI 自动导入接口

> FastAPI 内置 OpenAPI，**无需手动维护接口文档**。

**方式 A（推荐）：URL 导入，每次刷新自动同步**

```
Apifox → 项目设置 → 导入数据 → OpenAPI/Swagger → URL导入
填入：http://localhost:8000/openapi.json
```

**方式 B：手动下载后导入**

```bash
# 后端运行时执行
curl http://localhost:8000/openapi.json -o apifox/collections/KnowledgeRAG_API.json
```

然后在 Apifox 中「导入」→ 选择 `collections/KnowledgeRAG_API.json`。

**方式 C：直接在浏览器查看**

```
Swagger UI:  http://localhost:8000/docs
ReDoc:       http://localhost:8000/redoc
```

### Step 4 — 配置登录前置脚本

登录后，Apifox 自动把 Token 写入环境变量，后续所有请求自动携带 Bearer Token。

具体配置见 [`scripts/pre_login.js`](scripts/pre_login.js) 的注释说明。

### Step 5 — 运行冒烟测试

```
Apifox → 测试套件 → 导入 tests/smoke_test.apifox.json → 运行全部
```

7 条核心接口全部 ✅ = 后端健康。

---

## 接口分组总览

| 分组 | 前缀 | 说明 |
|------|------|------|
| 系统 | `/` | 健康检查、下载页 |
| 用户认证 | `/api/register` `/api/login` `/api/logout` | 注册/登录/退出 |
| 密码重置 | `/api/password-reset/*` | 邮件验证码 + 重置密码 |
| QQ 登录 | `/api/qq-login/*` | OAuth2.0 回调 |
| 知识库 CRUD | `/knowledge/*` `/api/knowledge/*` | 创建/查询/删除/封面 |
| 文档上传 | `/upload-chunk` `/merge-chunks` | 分片上传 + 合并 |
| 文档管理 | `/documents/*` `/api/files/*` | 列表/删除/预览 |
| RAG 服务 | `/api/RAG/*` | 流式问答/同步查询/向量化 |
| 多模型对话 | `/api/chat/*` `/api/models/*` | 统一对话接口 |
| Agent 模式 | `/api/agent/*` | ReAct 任务/联网搜索 |
| 知识图谱 | `/api/kg/*` | 生成/查询/搜索 |
| 知识广场 | `/api/square/*` | 分享/搜索/圈子/收藏 |
| 文档创作 | `/api/creation/*` | 摘要/翻译/大纲/优化 |
| 模型评测 | `/api/eval/*` | 运行评测/查结果 |
| 审计日志 | `/api/audit/*` | 接口调用记录查询 |
| 系统监控 | `/metrics` | Prometheus 指标 |
| 用户设置 | `/api/user/*` | 个人信息/头像/设置 |

---

## 认证说明

所有需要登录的接口均通过 **JWT Bearer Token** 认证：

```
Header: Authorization: Bearer <token>
```

Token 通过 `/api/login/login` 获取，有效期 **24 小时**。

在 Apifox 中：「项目设置」→「Auth」→ 选择「Bearer Token」→ 值填 `{{token}}`（自动从环境变量读取）。

---

## SSE 流式接口说明

以下接口返回 `text/event-stream`，在 Apifox 中需开启「流式响应」模式：

| 接口 | 说明 |
|------|------|
| `POST /api/RAG/RAG_query` | RAG 流式问答 |
| `POST /api/RAG/ingest` | 文档向量化进度流 |
| `POST /api/models/chat` | 多模型流式对话 |
| `POST /api/creation/generate` | 文档创作 SSE |

> Apifox 调试 SSE：请求面板 → 右侧「响应」→ 展开可见逐行 `data:` 事件。

---

## Mock 服务使用建议

当后端尚未部署或网络不通时，可用 Apifox Mock 模拟接口响应：

1. 在接口详情页 → 「Mock」Tab → 配置期望响应
2. 或开启「智能 Mock」，根据 Schema 自动生成测试数据
3. 前端 `.env` 中把 `VITE_API_BASE_URL` 改为 Apifox Mock 地址即可

---

## 常见问题

**Q：导入 OpenAPI 时提示认证失败？**
A：确保后端已启动（`uvicorn main:app --port 8000`），或先手动下载 JSON 再离线导入。

**Q：SSE 接口只返回一行就结束了？**
A：需在 Apifox「高级设置」中关闭「自动解压 gzip」并开启「流式接收」。

**Q：如何在不改代码的情况下看所有接口签名？**
A：访问 `http://localhost:8000/docs`，所有接口含参数/响应 Schema 一目了然。

**Q：运行测试套件报 401？**
A：先单独运行「登录」接口，确认 `{{token}}` 环境变量已被赋值（`pre_login.js` 脚本负责此步骤）。
