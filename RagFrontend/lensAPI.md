## Lens API 接口文档（完整参数说明）

### 1. 专利检索（POST）

**端点**：`POST /patent/search`

**参数**（JSON Body）：

```
{
  "query": { // 查询条件（必需）
    "match": {
      "字段名": "搜索值" // 如 "title": "Fidget Spinner"
    }
  },
  "size": 5,  // 返回结果数量
  "from": 0,  // 起始偏移量（分页）
  "include": [  // 包含字段
    "biblio.invention_title",
    "legal_status"
  ],
  "exclude": null,  // 排除字段
  "sort": [  // 排序规则
    {"created": "desc"},
    {"year_published": "asc"}
  ],
  "scroll": "1m",  // 滚动搜索有效期（如1分钟）
  "scroll_id": "DXF1ZXJ5QW5k..."  // 滚动搜索ID
}
```

### 2. 专利检索（GET）

**端点**：`GET /patent/search`

**参数**（Query String）：

- `token`: API凭证（必需）
- `query`: 搜索关键词（必需）
- `size`: 结果数量（默认10）
- `from`: 起始偏移量
- `include`: 包含字段（逗号分隔：`biblio,legal_status`）
- `exclude`: 排除字段（逗号分隔：`families,abstract`）
- `sort`: 排序规则（逗号分隔：`desc(date_published),asc(created)`）

### 3. 专利聚合分析

**端点**：`POST /patent/aggregate`

**参数**（JSON Body）：

```
{
  "query": {  // 基础查询
    "match": {"title": "Malaria"}
  },
  "aggregations": {  // 聚合配置（必需）
    "publication_types": {
      "cardinality": {"field": "publication_type"}  // 按出版类型聚合
    }
  },
  "size": 0  // 不需要返回实际文档
}
```

### 4. 专利数据结构

**端点**：`GET /schema/patent`

**参数**：无

---

### 5. 学术检索（POST）

**端点**：`POST /scholarly/search`

**参数**（JSON Body）：

```
{
  "query": {"match": {"title": "Malaria"}},
  "size": 5,
  "include": ["title", "open_access.license"],
  "sort": [{"year_published": "desc"}],
  "scroll": "2m"
}
```

### 6. 学术检索（GET）

**端点**：`GET /scholarly/search`

**参数**（Query String）：

- `token`: API凭证（必需）
- `query`: 搜索词（必需）
- `include`: 包含字段（如 `title,authors,open_access`）
- `exclude`: 排除字段（如 `references,chemicals`）
- `sort`: 排序（如 `desc(year_published)`）

### 7. 学术聚合分析

**端点**：`POST /scholarly/aggregate`

**参数**（JSON Body）：

```
{
  "query": {"term": {"fields_of_study": "Biotechnology"}},
  "aggregations": {
    "funding_stats": {
      "terms": {"field": "funding.country"}  // 按资助国家分组统计
    }
  }
}
```

### 8. 学术数据结构

**端点**：`GET /schema/scholarly`

**参数**：无

---

### 9. 收藏集检索（POST）

**端点**：`POST /collections/{collection_id}`

**路径参数**：

- `collection_id`: 收藏集ID（必需）

**JSON Body参数**：

```
{
  "query": {"match": {"title": "Nanotechnology"}},
  "from": 10,
  "include": ["lens_id", "title"]
}
```

### 10. 收藏集检索（GET）

**端点**：`GET /collections/{collection_id}`

**路径参数**：

- `collection_id`: 收藏集ID（必需）

**查询参数**：

- `token`: API凭证（必需）
- `query`: 搜索过滤词
- `sort`: 排序规则（如 `desc(date_published)`）
- `include`: 字段包含（如 `biblio,abstract`）

---

### 11. 批量数据发布信息

**端点**（学术）：`GET /bulk/scholarly/releases`

**端点**（专利）：`GET /bulk/patent/releases`

**参数**：无

### 12. 最新发布详情

**端点**（学术）：`GET /bulk/scholarly/release`

**端点**（专利）：`GET /bulk/patent/release`

**参数**：无

### 13. 文件下载

**端点**：`GET /bulk/download/{downloadAccessKey}`

**路径参数**：

- `downloadAccessKey`: 从发布接口获取的下载密钥（必需）

---

### 通用说明

#### 认证参数

所有接口需在URL中包含：

```
?token=your_api_token_here
```

#### 响应字段示例

专利核心字段：

```
"biblio": {
  "invention_title": {"text": "Wind Turbine Blade", "lang": "en"},
  "priority_claims": {
    "claims": [{
      "jurisdiction": "US",
      "doc_number": 123456,
      "date": "2020-01-15"
    }]
  }
},
"legal_status": {
  "granted": true,
  "grant_date": "2023-05-20"
}
```

学术核心字段：

```
"open_access": {
  "license": "CC BY 4.0",
  "colour": "gold"
},
"authors": [{
  "last_name": "Smith",
  "affiliations": [{
    "name": "MIT",
    "country_code": "US"
  }]
}]
```
