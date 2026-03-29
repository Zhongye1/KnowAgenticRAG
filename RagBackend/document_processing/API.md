# 知识库管理页面文档操作接口说明

## 1. 文件上传接口

### 接口地址

```
POST /api/upload-files
```

### 请求方式

POST

### 请求头

```
Content-Type: multipart/form-data
```

### 请求参数

以FormData形式上传多个文件，字段名为`files`

### 响应数据结构

```
[
  {
    "name": "文件名称",
    "fileType": "文件类型(pdf/docx/txt)",
    "chunks": 分块数量,
    "uploadDate": "上传日期(YYYY-MM-DD)",
    "slicingMethod": "切片方法"
  },
  ...
]
```

### 成功响应示例

HTTP状态码: 200

```
[
  {
    "name": "ASF技术文档.pdf",
    "fileType": "pdf",
    "chunks": 24,
    "uploadDate": "2023-10-15",
    "slicingMethod": "按段落"
  }
]
```

### 错误响应示例

HTTP状态码: 400/500

```
{
  "error": "上传失败原因"
}
```

## 2. 删除文档接口

### 接口地址

```
POST /api/delete-documents
```

### 请求方式

POST

### 请求参数

```
{
  "documentIds": [文档ID数组]
}
```

### 成功响应示例

HTTP状态码: 200

```
{
  "success": true,
  "message": "文档已删除"
}
```

### 错误响应示例

HTTP状态码: 400/500

```
{
  "error": "删除失败原因"
}
```

## 3. 更新文档状态接口

### 接口地址

```
POST /api/update-document-status
```

### 请求方式

POST

### 请求参数

```
{
  "documentId": 文档ID,
  "enabled": 是否启用(true/false)
}
```

### 成功响应示例

HTTP状态码: 200

```
{
  "success": true,
  "message": "文档状态已更新"
}
```

### 错误响应示例

HTTP状态码: 400/500

```
{
  "error": "更新失败原因"
}
```

## 4. 检索测试接口(模拟)

虽然前端代码中使用了模拟数据，但在实际应用中可能需要以下接口:

### 接口地址

```
POST /api/search
```

### 请求方式

POST

### 请求参数

```
{
  "query": "搜索查询文本",
  "documentIds": [可选，选定的文件ID数组],
  "similarityThreshold": 相似度阈值(0-1),
  "keywordWeight": 关键词相似度权重(0-100),
  "rerankModel": "rerank模型名称",
  "useKnowledgeGraph": 是否使用知识图谱(true/false),
  "language": "语言代码"
}
```

### 成功响应示例

HTTP状态码: 200

```
[
  {
    "source": "来源文档名称",
    "content": "匹配的内容片段",
    "file": "文件名称",
    "chunk": 分块编号,
    "score": 相似度分数(0-1)
  },
  ...
]
```

### 错误响应示例

HTTP状态码: 400/500

```
{
  "error": "检索失败原因"
}
```

## 注意事项

1. 所有接口应使用HTTPS协议确保数据传输安全
2. 接口应实现适当的身份验证和授权机制
3. 文件上传接口应限制文件大小(前端已限制为10MB)和类型
4. 建议为所有接口添加请求速率限制，防止滥用
5. 接口响应应包含适当的缓存控制头
6. 在生产环境中，应考虑添加API版本控制

以上接口说明基于前端代码中的调用逻辑整理，实际开发中可能需要根据后端实现进行调整。























#### 1. 文件上传接口

**URL**: `/api/upload-files`

**方法**: `POST`

**描述**: 上传文件到服务器。

**请求参数**:

- `files`: 文件列表，包含多个文件。

**请求头**:

- `Content-Type`: `multipart/form-data`

**响应**:

- 成功: 返回状态码 `200` 和包含文件处理结果的数组。
- 失败: 返回状态码 `500` 和错误信息。

**示例**:

javascript

 复制 插入 新文件

```
const formData = new FormData();
files.forEach(file => {
  formData.append('files', file);
});
axios.post('/api/upload-files', formData, {
  headers: {
    'Content-Type': 'multipart/form-data'
  }
});
```

#### 2. 更新文档启用状态接口

**URL**: `/api/update-document-status`

**方法**: `POST`

**描述**: 更新文档的启用状态。

**请求参数**:

- `documentId`: 文档ID。
- `enabled`: 启用状态，布尔值。

**响应**:

- 成功: 返回状态码 `200`。
- 失败: 返回状态码 `500` 和错误信息。

**示例**:

javascript

 复制 插入 新文件

```
axios.post('/api/update-document-status', {
  documentId: 1,
  enabled: true
});
```

#### 3. 删除文档接口

**URL**: `/api/delete-documents`

**方法**: `POST`

**描述**: 删除指定的文档。

**请求参数**:

- `documentIds`: 文档ID列表。

**响应**:

- 成功: 返回状态码 `200`。
- 失败: 返回状态码 `500` 和错误信息。

**示例**:

javascript

 复制 插入 新文件

```
axios.post('/api/delete-documents', {
  documentIds: [1, 2, 3]
});
```

### 详细说明

1. **文件上传接口**：
   - 使用 `POST` 方法上传文件到 `/api/upload-files`。
   - 请求头中需要设置 `Content-Type` 为 `multipart/form-data`。
   - 请求体中包含一个 `files` 参数，为文件列表。
   - 成功时返回状态码 `200` 和文件处理结果的数组。
   - 失败时返回状态码 `500` 和错误信息。
2. **更新文档启用状态接口**：
   - 使用 `POST` 方法更新文档启用状态到 `/api/update-document-status`。
   - 请求体中包含 `documentId` 和 `enabled` 参数。
   - 成功时返回状态码 `200`。
   - 失败时返回状态码 `500` 和错误信息。
3. **删除文档接口**：
   - 使用 `POST` 方法删除文档到 `/api/delete-documents`。
   - 请求体中包含 `documentIds` 参数，为文档ID列表。
   - 成功时返回状态码 `200`。
   - 失败时返回状态码 `500` 和错误信息。
