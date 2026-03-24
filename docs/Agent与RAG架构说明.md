# Agent 与 RAG 架构说明

> 本文档面向开发者和使用者，解释项目中 Agent 如何自主调用 RAG 检索，以及两种查询模式的区别。

---

## 一、整体架构

```
用户输入
   │
   ├─── /RAG_query ──────────────────→ RAGPipeline（强制检索）
   │                                        │
   │                                        ├── 混合检索（BM25 + FAISS 向量 + RRF）
   │                                        └── OllamaLLM 生成回答
   │
   └─── /agent_query ────────────────→ ReActRAGAgent（自主决策）
                                            │
                                            ├── LLM 推理：是否需要检索？
                                            │      │
                                            │      ├── 需要 → 调用 search_knowledge_base 工具
                                            │      │              └── HybridRetriever（BM25 + FAISS + RRF）
                                            │      │                       └── 返回文档片段
                                            │      │              ↑ 可循环多次
                                            │      └── 不需要 → 直接回答（简单对话）
                                            │
                                            └── 最终 Final Answer → 返回给用户
```

---

## 二、两种查询模式对比

| 维度 | 普通 RAG（`/RAG_query`） | ReAct Agent（`/agent_query`） |
|------|--------------------------|-------------------------------|
| 检索时机 | **每次必执行检索** | **LLM 自主决定是否检索** |
| 检索次数 | 固定 1 次 | 1 到 N 次（受 `max_iterations` 限制） |
| 适合场景 | 明确需要查文档的问题 | 混合对话、复杂推理、多轮问答 |
| 对话灵活性 | 低（每次都强制召回） | 高（简单对话不触发检索，节省资源） |
| 推理过程透明度 | 无 | 返回完整 Thought / Action / Observation 步骤 |
| 响应格式 | 流式文本 + SOURCES 来源 | 流式步骤日志 + 最终回答 |

---

## 三、ReAct Agent 推理流程详解

Agent 遵循 **ReAct（Reasoning + Acting）** 循环，LLM 按照以下格式推理：

```
Question: 用户提出的问题

Thought: 我需要在知识库中查找相关信息
Action: search_knowledge_base
Action Input: 用户问题或关键词
Observation: 【来源 1：文档名.pdf 第3页（相关度: 0.8231）】
             检索到的文档片段内容...

Thought: 我已经找到了相关信息，可以回答了
Final Answer: 根据知识库内容，......（中文回答）
```

### 关键特性

- **多轮检索**：如果第一次检索结果不够，Agent 会自动发起第二次检索
- **短路优化**：对于"你好"、"谢谢"等简单对话，Agent 判断无需检索，直接回答
- **容错处理**：LLM 输出格式不规范时自动修复（`handle_parsing_errors=True`）
- **来源溯源**：从推理步骤中自动提取文档来源，标注在回答中

---

## 四、核心文件结构

```
RagBackend/
├── RAG_M/
│   ├── RAG_app.py                    # 路由注册（所有查询接口入口）
│   └── src/
│       ├── agent/
│       │   └── react_agent.py        # ReActRAGAgent 主类 + RAG Tool 工厂函数
│       ├── rag/
│       │   ├── rag_pipeline.py       # 普通 RAG Pipeline（强制检索）
│       │   ├── hybrid_retriever.py   # BM25 + FAISS + RRF 混合检索器
│       │   └── native_rag.py         # 原生 RAG（不依赖 LangChain）
│       └── vectorstore/
│           └── vector_store.py       # FAISS 向量存储管理
```

---

## 五、对外 API 接口

### 5.1 ReAct Agent 流式问答

```
POST /api/RAG/agent_query
```

**请求体：**
```json
{
  "query": "你的问题",
  "docs_dir": "local-KLB-files/<知识库ID>",
  "use_hybrid": true,
  "max_iterations": 5
}
```

**响应（SSE 流式）：**
```
data: 🤖 启动 ReAct Agent 模式...
data: 📂 正在加载向量存储...
data: ✅ 向量存储加载完成，文档块: 128 个
data: 🤖 ReAct Agent 开始推理...
data: 📚 Agent 执行了 1 个推理步骤:
data: STEP: {"step": 1, "action": "search_knowledge_base", "input": "用户问题"}
data: 💬 正在生成回答...
data: 最终回答内容...
data: COMPLETE
```

### 5.2 ReAct Agent 同步问答（测试用）

```
POST /api/RAG/agent_query_sync
```

**响应（JSON）：**
```json
{
  "status": "success",
  "answer": "最终回答",
  "steps": [
    {
      "tool": "search_knowledge_base",
      "tool_input": "查询关键词",
      "observation_preview": "检索到的文档片段（前300字）"
    }
  ],
  "sources": ["文档A.pdf", "文档B.docx"],
  "mode": "react_agent",
  "model": "qwen:7b-chat"
}
```

### 5.3 普通 RAG 流式问答

```
POST /api/RAG/RAG_query
```

### 5.4 原生 RAG（不依赖 LangChain）

```
POST /api/RAG/native_ingest   # 先执行向量化
POST /api/RAG/native_query    # 再执行检索问答
```

---

## 六、检索技术：混合检索 + RRF

无论是 Agent 模式还是普通 RAG 模式，底层都使用 **混合检索（Hybrid Retrieval）**：

```
用户问题
   │
   ├── BM25 关键词检索 ─────────────────┐
   │   （精确匹配，对专有名词效果好）    │
   │                                    ├── RRF 倒排融合排序 → Top-K 文档
   └── FAISS 向量相似度检索 ─────────────┘
       （语义理解，对同义表达效果好）
```

**RRF（Reciprocal Rank Fusion）** 公式：

```
score(d) = Σ 1 / (k + rank_i(d))
```

其中 k=60，rank_i 是文档 d 在第 i 个检索结果列表中的排名。两路检索结果取并集后按 RRF 分数重排，取前 top_k 个文档块送给 LLM。

---

## 七、模型配置

| 配置项 | 文件 | 默认值 |
|--------|------|--------|
| LLM 模型 | `models_config.json` → `llm_model` | `qwen:7b-chat` |
| Embedding 模型 | `models_config.json` → `embedding_model` | `sentence-transformers/all-MiniLM-L6-v2` |
| Ollama 地址 | `.env` → `OLLAMA_HOST` | `http://localhost:11434` |
| 向量维度 | 由 Embedding 模型决定 | 384维（MiniLM-L6） |

---

## 八、前端使用

在知识库详情页（`KnowledgeDetail.vue`）的**检索模块**中：

- **Tab 切换**：顶部 `[🔗 LangChain]` / `[⚡ 原生实现]` 切换两种实现方式
- Agent 模式入口在 `Agent.vue` 页面（左侧导航 → Agent）
- 两种模式的对比说明会在页面内以横幅形式展示

---

*最后更新：2026-03-24*
