# API 参考

KnowledgeRAG系统提供RESTful API接口，允许程序化访问系统功能。

## 基础信息

- 基础URL: `/api/v1`
- 内容类型: `application/json`
- 所有请求都需要有效的认证令牌

## 认证

大多数API端点需要在HTTP头部提供认证令牌：

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## 用户管理API

### 获取当前用户信息

```
GET /api/v1/user/profile
```

返回当前认证用户的基本信息。

### 更新用户资料

```
PUT /api/v1/user/profile
```

更新当前用户的个人资料信息。

## 知识库API

### 列出用户的所有知识库

```
GET /api/v1/knowledge-bases
```

参数:
- `page` (可选): 页码，默认为1
- `limit` (可选): 每页数量，默认为10

### 创建新知识库

```
POST /api/v1/knowledge-bases
```

请求体:
```json
{
  "name": "知识库名称",
  "description": "知识库描述",
  "visibility": "public|private|team"
}
```

### 获取特定知识库信息

```
GET /api/v1/knowledge-bases/{kb_id}
```

### 删除知识库

```
DELETE /api/v1/knowledge-bases/{kb_id}
```

## 文档API

### 上传文档到知识库

```
POST /api/v1/knowledge-bases/{kb_id}/documents
```

使用multipart/form-data格式上传文件。

### 列出知识库中的文档

```
GET /api/v1/knowledge-bases/{kb_id}/documents
```

### 删除文档

```
DELETE /api/v1/knowledge-bases/{kb_id}/documents/{doc_id}
```

## 搜索API

### 在知识库中搜索

```
POST /api/v1/search
```

请求体:
```json
{
  "query": "搜索查询",
  "kb_ids": ["knowledge_base_id1", "knowledge_base_id2"],
  "limit": 10
}
```

## 错误处理

API错误响应遵循以下格式:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "错误消息描述",
    "details": {} // 可选的详细信息
  }
}
```

常见的错误代码包括:
- `AUTH_ERROR`: 认证失败
- `PERMISSION_DENIED`: 权限不足
- `RESOURCE_NOT_FOUND`: 资源不存在
- `VALIDATION_ERROR`: 请求参数无效
- `INTERNAL_ERROR`: 服务器内部错误