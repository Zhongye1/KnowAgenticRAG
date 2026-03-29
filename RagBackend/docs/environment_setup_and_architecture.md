# ASF-RAG 环境安装与项目架构文档

## 1. 使用 uv 安装环境

uv 是一个极其快速的 Python 包和项目管理器，用 Rust 编写，是 pip 和 venv 的直接替代品。

### 1.1 安装 uv

#### 使用 pip 安装（推荐）
```bash
pip install uv
```

#### Windows 上使用 winget
```bash
winget install -e --id uv
```

#### macOS 上使用 Homebrew
```bash
brew install uv
```

#### Linux 上使用 curl
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 1.2 创建虚拟环境

使用 uv 创建虚拟环境比传统方法更快：

```bash
# 创建虚拟环境
uv venv

# 激活虚拟环境
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
```

### 1.3 安装依赖

#### 安装项目依赖
```bash
# 安装 requirements.txt 中的所有依赖
uv pip install -r requirements.txt
```

#### 安装单个依赖包
```bash
uv pip install package_name
```

#### 安装开发依赖
```bash
# 如果有开发依赖文件
uv pip install -r requirements-dev.txt
```

### 1.4 uv 的优势

1. **速度提升**：uv 比 pip 快 10-100 倍
2. **更好的依赖解析**：更准确地解决依赖冲突
3. **内置虚拟环境管理**：不需要额外工具
4. **兼容性**：与 pip 完全兼容，可以直接替代

### 1.5 注意事项

1. uv 仍然使用 PyPI 作为包源，所以所有 pip 可用的包在 uv 中也可用
2. uv 完全兼容现有的 requirements.txt 格式
3. 如果遇到特定包的安装问题，可以回退到 pip 安装特定包：
   ```bash
   pip install problematic-package
   ```

## 2. 项目架构

### 2.1 整体架构

ASF-RAG 后端服务采用分层架构，主要包括以下几个层次：

```
+-------------------+
|     Client        |
+-------------------+
          ↓
+-------------------+
|   API Layer       |  ← FastAPI REST API
+-------------------+
          ↓
+-------------------+
|   Business Logic  |  ← 核心业务逻辑
+-------------------+
          ↓
+-------------------+
|   Data Access     |  ← 数据访问层
+-------------------+
          ↓
+-------------------+
|   External        |
|   Services         |  ← 外部服务集成
+-------------------+
```

### 2.2 技术架构组件

#### Web 层 (FastAPI)
- 使用 FastAPI 实现异步 API 服务
- 提供 RESTful 接口
- 支持 OpenAPI 文档自动生成

#### 任务处理层 (Celery + Redis)
- 使用 Celery 处理文档解析等耗时任务
- 使用 Redis 作为消息代理和结果后端

#### 文档处理流水线
- 支持多种文档格式（PDF、DOC/DOCX、TXT、MD、RTF）
- 使用 pdfplumber、pytesseract 等库进行文档解析
- 实现文档分块处理

#### 向量存储层 (FAISS)
- 使用 FAISS 进行向量存储和相似度搜索
- 支持高效的大规模向量检索

#### LLM 集成层 (LangChain + Ollama)
- 使用 LangChain 框架集成大语言模型
- 使用 Ollama 提供本地 LLM 服务

### 2.3 项目目录结构

```
ASF-RAG-backend/
├── assets/                     # 静态资源目录
├── chat_units/                 # 聊天相关功能
│   ├── chat_documents/        # 聊天文档存储
│   └── chat_management/       # 聊天管理功能
├── document_processing/       # 文档处理模块
│   ├── doc_list.py           # 文档列表管理
│   ├── doc_manage.py         # 文档CRUD操作
│   ├── doc_upload.py         # 文件上传处理
│   └── pipeline.py           # 文档处理流水线
├── knowledge_base/            # 知识库管理
│   ├── knowledgeBASE4CURD.py # 知识库CRUD操作
│   └── knowledge_graph/      # 知识图谱相关
├── knowledge_graph/           # 知识图谱模块
├── RAG_M/                     # RAG核心模块
│   ├── src/                  # RAG核心实现
│   │   ├── api/             # API路由
│   │   ├── ingestion/       # 文档摄取
│   │   ├── models/          # 数据模型
│   │   ├── rag/             # RAG管道
│   │   ├── scripts/         # 脚本工具
│   │   └── vectorstore/     # 向量存储
│   └── RAG_app.py           # RAG应用入口
├── RAGF_User_Management/     # 用户管理模块
├── main.py                   # 主应用入口
└── requirements.txt          # 项目依赖
```

### 2.4 核心模块介绍

#### document_processing 模块
负责文档的上传、管理和处理：
- `doc_upload.py`：处理文件分块上传逻辑
- `doc_manage.py`：文档的增删改查操作
- `doc_list.py`：文档列表管理
- `pipeline.py`：文档处理流水线

#### knowledge_base 模块
负责知识库的管理：
- `knowledgeBASE4CURD.py`：知识库的创建、查询、更新、删除操作
- `knowledgebase_cover.py`：知识库封面图片管理

#### RAG_M 模块
RAG 核心功能模块：
- `src/ingestion/`：文档加载和处理
- `src/vectorstore/`：向量存储管理
- `src/rag/`：RAG 管道实现
- `RAG_app.py`：RAG 服务 API 入口

#### chat_units 模块
聊天功能相关：
- `chat_management/`：聊天会话管理
- `chat_documents/`：聊天文档存储

#### RAGF_User_Management 模块
用户管理功能：
- `LogonAndLogin.py`：用户注册和登录
- `User_Management.py`：用户信息管理
- `User_settings.py`：用户设置

### 2.5 数据流

1. **文档上传流程**：
   - 用户通过 API 上传文档
   - 文档被分块存储在本地
   - 触发文档处理流水线
   - 文档内容被解析并分块
   - 文档块被向量化并存储到 FAISS

2. **查询处理流程**：
   - 用户提交查询请求
   - 查询文本被向量化
   - 在 FAISS 中搜索相似文档块
   - 使用 LangChain 构造上下文
   - 调用 Ollama 模型生成回答

3. **知识图谱生成流程**：
   - 选择文档进行知识图谱生成
   - 使用 langextract 库提取实体和关系
   - 构建图结构并保存
   - 生成可视化文件

### 2.6 部署架构

```
+-----------------+
|    Client       |
+-----------------+
         ↓
+-----------------+
|  Load Balancer  | (可选)
+-----------------+
         ↓
+-----------------+
|     Nginx       | ← 反向代理
+-----------------+
         ↓
+-----------------+
|   FastAPI       | ← 主应用服务器
|   (Uvicorn)     |
+-----------------+
         ↓
+-----------------+
|   Celery        | ← 异步任务处理
+-----------------+
         ↓
+-----------------+
|   Redis         | ← 消息队列和缓存
+-----------------+
         ↓
+-----------------+
|   FAISS         | ← 向量存储
+-----------------+
         ↓
+-----------------+
|   Ollama        | ← LLM 服务
+-----------------+
```

### 2.7 环境变量配置

项目使用 `.env` 文件进行配置：

```env
# Ollama 配置
OLLAMA_HOST=http://localhost:11434
MODEL=llama2

# 向量存储路径
VECTORSTORE_PATH=data/vectorstore

# 日志配置
LOG_LEVEL=INFO
```

## 3. 开发工作流

### 3.1 初始化开发环境

```bash
# 1. 克隆项目
git clone <repository-url>
cd ASF-RAG-backend

# 2. 创建虚拟环境
uv venv

# 3. 激活虚拟环境
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# 4. 安装依赖
uv pip install -r requirements.txt
```

### 3.2 启动开发服务器

```bash
python main.py --host 0.0.0.0 --port 8000 --reload
```

### 3.3 运行测试

```bash
# 如果有测试目录
python -m pytest test/
```

## 4. 打包和部署

### 4.1 使用 PyInstaller 打包

```bash
# 安装 PyInstaller
uv pip install pyinstaller

# 使用 spec 文件打包
pyinstaller build_exe.spec
```

### 4.2 Docker 部署（可选）

可以创建 Dockerfile 来容器化部署应用：

```dockerfile
FROM python:3.10

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "main.py", "--host", "0.0.0.0", "--port", "8000"]
```

通过以上文档，您可以了解如何使用 uv 快速搭建开发环境，以及 ASF-RAG 项目的整体架构设计。
