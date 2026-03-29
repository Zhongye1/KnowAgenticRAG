# ASF-RAG 后端服务完整文档

## 1. 项目概述

ASF-RAG 后端服务是一个基于 FastAPI + Ollama 提供服务的 RAG (检索增强生成) 后端服务，用于处理文档解析、知识库管理、知识图谱生成、RAG 检索、向量存储、Ollama 服务管理和智能问答。

### 1.1 核心功能

1. **文档处理**
   - 支持多种文档格式：PDF、DOC/DOCX、TXT、MD、RTF
   - 文档分块处理：支持按段落、固定长度、按句子等多种分块策略
   - 文档上传：支持分块上传和大文件处理
   - 文档管理：完整的 CRUD 操作，包括启用/禁用、删除等

2. **知识库管理**
   - 知识库创建、删除、更新
   - 知识库项目分页查询
   - 文档状态管理
   - 系统统计信息

3. **RAG 功能**
   - 文档向量化：使用 FAISS 进行向量存储
   - 智能检索：支持相似度搜索和关键词搜索
   - 生成式问答：基于检索结果生成回答
   - 知识图谱生成

4. **聊天功能**
   - 聊天会话管理
   - 聊天历史记录
   - 聊天文档管理

### 1.2 技术栈

- **Web 框架**：FastAPI + Uvicorn
- **文档处理**：pdfplumber、pytesseract、layoutparser、camelot
- **向量存储**：FAISS
- **LLM 集成**：LangChain + Ollama
- **数据库**：MySQL（用户管理）

## 2. 项目结构

```
ASF-RAG-backend/
├── ASF_SRE/
├── assets/                     # 静态资源目录
├── chat_units/                 # 聊天相关功能
│   ├── chat_documents/        # 聊天文档存储
│   └── chat_management/       # 聊天管理功能
├── document_processing/       # 文档处理模块
│   ├── doc_list.py           # 文档列表管理
│   ├── doc_manage.py         # 文档CRUD操作
│   ├── doc_upload.py         # 文件上传处理
│   └── pipeline.py          # 文档处理流水线
├── knowledge_base/           # 知识库管理
│   ├── knowledgeBASE4CURD.py # 知识库CRUD操作
│   └── knowledge_graph/      # 知识图谱相关
├── knowledge_graph/          # 知识图谱模块
├── RAG_M/                    # RAG核心模块
│   ├── src/                  # RAG核心实现
│   │   ├── api/             # API路由
│   │   ├── ingestion/       # 文档摄取
│   │   ├── models/          # 数据模型
│   │   ├── rag/             # RAG管道
│   │   ├── scripts/         # 脚本工具
│   │   └── vectorstore/     # 向量存储
│   └── RAG_app.py           # RAG应用入口
├── RAGF_User_Management/    # 用户管理模块
├── main.py                  # 主应用入口
└── requirements.txt         # 项目依赖
```

## 3. 环境要求

- Python 3.10+
- Ollama 运行服务

## 4. 快速开始

### 4.1 克隆项目

```bash
# 克隆代码仓库
git clone <repository-url>
cd ASF-RAG-backend
```

### 4.2 安装依赖

```bash
# 创建虚拟环境
python -m venv venv
# 激活虚拟环境
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 4.3 启动 FastAPI 服务

```bash
python main.py --host 0.0.0.0 --port 8000 --reload
```

服务启动后，可访问 http://localhost:8000 查看 API 文档。

## 5. API 接口文档

### 5.1 知识库管理

#### 创建知识库
- **Endpoint**: `POST /api/create-knowledgebase/`
- **功能**: 创建新的知识库
- **请求参数**:
  - Body (application/x-www-form-urlencoded):
    - `kbName` (string, 必填): 知识库名称
- **响应**:
  - 200: 成功创建
  - 422: 参数验证错误

#### 分页获取知识库项目列表
- **Endpoint**: `GET /api/get-knowledge-item/`
- **功能**: 分页获取知识库项目列表
- **查询参数**:
  - `page` (integer, 可选, 默认=1): 页码
  - `page_size` (integer, 可选, 默认=10): 每页数量
  - `search` (string, 可选): 搜索关键词
- **响应**:
  - 200: 返回分页结果
  - 422: 参数验证错误

#### 根据 ID 获取单个知识库项目
- **Endpoint**: `GET /api/get-knowledge-item/{item_id}`
- **功能**: 通过 ID 获取知识库项目详情
- **路径参数**:
  - `item_id` (string, 必填): 知识库项目 ID
- **响应**:
  - 200: 返回知识库项目详情
  - 422: 参数验证错误

#### 更新知识库配置
- **Endpoint**: `POST /api/update-knowledgebase-config/{KLB_id}`
- **功能**: 更新知识库配置
- **路径参数**:
  - `KLB_id` (string, 必填): 知识库 ID
- **响应**:
  - 200: 配置更新成功
  - 422: 参数验证错误

### 5.2 文档管理

#### 获取文档列表
- **Endpoint**: `GET /api/documents-list/{KLB_id}/`
- **功能**: 获取指定知识库中的文档列表
- **路径参数**:
  - `KLB_id` (string, 必填): 知识库 ID
- **响应**:
  - 200: 返回文档列表
  - 422: 参数验证错误

#### 更新文档启用状态
- **Endpoint**: `POST /api/update-document-status/`
- **功能**: 更新文档的启用/禁用状态
- **请求体 (application/json)**:
  ```json
  {
    "documentId": 123,
    "enabled": true
  }
  ```
- **响应**:
  - 200: 状态更新成功
  - 422: 参数验证错误

#### 批量删除文档
- **Endpoint**: `POST /api/delete-documents/`
- **功能**: 批量删除指定知识库中的文档
- **查询参数**:
  - `KLB_id` (string, 必填): 知识库 ID
- **请求体 (application/json)**:
  ```json
  {
    "documentIds": [1, 2, 3]
  }
  ```
- **响应**:
  - 200: 删除操作成功
  - 422: 参数验证错误

#### 上传文件分块
- **Endpoint**: `POST /api/upload-chunk/`
- **功能**: 上传文件分块
- **请求体 (multipart/form-data)**:
  - `chunk` (binary, 必填): 文件分块数据
  - `fileHash` (string, 必填): 文件哈希值
  - `chunkIndex` (integer, 必填): 当前分块索引
  - `totalChunks` (integer, 必填): 总分块数
  - `fileName` (string, 必填): 文件名
  - `KLB_id` (string, 必填): 知识库 ID
- **响应**:
  - 200: 分块上传成功
  - 422: 参数验证错误

#### 合并文件分块
- **Endpoint**: `POST /api/upload-complete/`
- **功能**: 合并已上传的文件分块
- **响应**:
  - 200: 合并成功

### 5.3 RAG 服务

#### 执行 RAG 查询
- **Endpoint**: `POST /api/RAG/RAG_query`
- **功能**: 执行 RAG 查询，支持指定文件夹路径进行查询，以流式方式返回结果
- **请求体 (application/json)**:
  ```json
  {
    "query": "查询问题",
    "docs_dir": "可选的文件夹路径"
  }
  ```
- **响应**: 流式响应，包含处理过程和最终结果

#### 导入文档
- **Endpoint**: `POST /api/RAG/ingest`
- **功能**: 导入文档到向量存储
- **请求体 (application/json)**:
  ```json
  {
    "docs_dir": "文档目录路径"
  }
  ```
- **响应**: 流式响应，包含处理过程和最终结果

#### 初始化项目
- **Endpoint**: `POST /api/RAG/init`
- **功能**: 初始化项目目录结构
- **响应**:
  - 200: 项目初始化成功
  - 500: 初始化失败

#### 健康检查
- **Endpoint**: `GET /api/RAG/health`
- **功能**: 检查 RAG 服务健康状态
- **响应**:
  - 200: 服务健康状态信息

#### Google Drive 集成

##### 导入 Drive 文件
- **Endpoint**: `POST /api/RAG/ingest/drive/files`
- **功能**: 从 Google Drive 导入文件
- **请求体 (application/json)**:
  ```json
  {
    "folder_id": "Google Drive 文件夹 ID"
  }
  ```
- **响应**:
  - 200: 成功导入文件列表

##### 导入 Drive 文件夹
- **Endpoint**: `POST /api/RAG/ingest/drive/folder/{folder_id}`
- **功能**: 从 Google Drive 导入文件夹
- **路径参数**:
  - `folder_id` (string, 必填): Google Drive 文件夹 ID
- **查询参数**:
  - `recursive` (boolean, 可选, 默认=true): 是否递归处理子文件夹
- **响应**:
  - 200: 成功导入文件列表

### 5.4 用户管理

#### 用户登录
- **Endpoint**: `POST /api/login`
- **功能**: 用户登录
- **请求体 (application/json)**:
  ```json
  {
    "username": "用户名",
    "password": "密码"
  }
  ```
- **响应**:
  - 200: 登录成功，返回用户信息和 token
  - 401: 登录失败

#### 用户注册
- **Endpoint**: `POST /api/register`
- **功能**: 用户注册
- **请求体 (application/json)**:
  ```json
  {
    "username": "用户名",
    "password": "密码",
    "email": "邮箱"
  }
  ```
- **响应**:
  - 200: 注册成功
  - 400: 注册失败

#### 获取用户数据
- **Endpoint**: `GET /api/user/GetUserData`
- **功能**: 获取当前用户数据
- **响应**:
  - 200: 返回用户数据

#### 更新用户数据
- **Endpoint**: `POST /api/user/UpdateUserData`
- **功能**: 更新用户数据
- **请求体 (application/json)**:
  ```json
  {
    "bio": "用户签名",
    "email": "邮箱"
  }
  ```
- **响应**:
  - 200: 更新成功

#### 更新头像
- **Endpoint**: `POST /api/user/UpdateAvatar`
- **功能**: 更新用户头像
- **请求体 (multipart/form-data)**:
  - `avatar`: 头像文件
- **响应**:
  - 200: 更新成功

### 5.5 聊天服务

#### 删除聊天会话
- **Endpoint**: `POST /api/chat/delete-session`
- **功能**: 删除聊天会话
- **请求体 (application/json)**:
  ```json
  {
    "session_id": "会话ID"
  }
  ```
- **响应**:
  - 200: 删除成功

#### 获取聊天历史
- **Endpoint**: `GET /api/chat/history`
- **功能**: 获取聊天历史记录
- **响应**:
  - 200: 返回聊天历史

#### 上传聊天文档
- **Endpoint**: `POST /api/chat/upload`
- **功能**: 上传聊天文档
- **请求体 (multipart/form-data)**:
  - `file`: 文档文件
- **响应**:
  - 200: 上传成功

### 5.6 知识图谱

#### 生成知识图谱
- **Endpoint**: `POST /api/kg/generate`
- **功能**: 从文档生成知识图谱
- **请求体 (application/json)**:
  ```json
  {
    "document_id": "文档ID"
  }
  ```
- **响应**:
  - 200: 生成成功

#### 获取知识图谱
- **Endpoint**: `GET /api/kg/graph/{document_id}`
- **功能**: 获取指定文档的知识图谱
- **路径参数**:
  - `document_id` (string, 必填): 文档 ID
- **响应**:
  - 200: 返回知识图谱数据

### 5.7 Ollama 模型管理

#### 获取 Ollama 模型列表
- **Endpoint**: `GET /api/ollama/models`
- **功能**: 获取 Ollama 可用模型列表
- **响应**:
  - 200: 返回模型列表

## 6. 数据模型说明

### 6.1 QueryRequest

```json
{
  "question": "string"  // 用户查询问题
}
```

### 6.2 DocumentResponse

```json
{
  "id": 0,
  "name": "string",
  "fileType": "string",
  "chunks": 0,
  "uploadDate": "string",
  "slicingMethod": "string",
  "enabled": true,
  "file_size": 0,
  "file_hash": "string"
}
```

### 6.3 DocumentStatus

```json
{
  "documentId": 0,
  "enabled": true
}
```

### 6.4 DeleteDocuments

```json
{
  "documentIds": [0, 1, 2]  // 文档ID数组
}
```

## 7. 部署说明

### 7.1 生产环境部署

1. 确保已安装所有依赖：
   ```bash
   pip install -r requirements.txt
   ```

2. 配置环境变量：
   - 设置 Ollama 服务地址
   - 配置数据库连接信息（如使用）

3. 启动服务：
   ```bash
   python main.py --host 0.0.0.0 --port 8000
   ```

### 7.2 使用 Nginx 反向代理

配置 Nginx 作为反向代理，将请求转发到 FastAPI 应用。

### 7.3 使用 Docker 部署

可以使用 Docker 容器化部署应用，确保环境一致性。

## 8. 安全注意事项

1. 在生产环境中应限制 CORS 允许的域名
2. 所有接口应实现适当的身份验证和授权机制
3. 文件上传接口应限制文件大小和类型
4. 建议为所有接口添加请求速率限制，防止滥用
5. 接口响应应包含适当的缓存控制头
6. 在生产环境中，应考虑添加 API 版本控制

## 9. 故障排除

1. **服务无法启动**：
   - 检查依赖是否正确安装
   - 检查端口是否被占用
   - 检查 Python 版本是否符合要求

2. **文档上传失败**：
   - 检查文件大小是否超过限制
   - 检查文件格式是否支持
   - 检查磁盘空间是否充足

3. **RAG 查询无结果**：
   - 检查向量存储是否正确初始化
   - 检查文档是否已成功导入
   - 检查 Ollama 服务是否正常运行

4. **用户认证失败**：
   - 检查数据库连接
   - 检查用户名和密码是否正确
   - 检查 JWT 配置是否正确

## 10. 贡献指南

1. Fork 项目仓库
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 11. 许可证

本项目采用 MIT 许可证，详情请参见 LICENSE 文件。
