# Agent 架构

ReAct Agent 是 KnowledgeRAG 的核心 AI 能力，采用先进的 ReAct（Reasoning + Acting）架构，让 LLM 自主决策是否需要检索知识库。

## 什么是 ReAct Agent？

ReAct（Reasoning + Acting）是一种结合推理和行动的智能体架构，通过让 LLM 在推理过程中自主决定何时采取行动（如检索知识库），实现更智能、更灵活的问答系统。

## ReAct 推理循环

Agent 的工作流程遵循以下推理循环：

```
Question: 用户输入的任务

Thought: 我需要在知识库中查找相关信息
Action: search_knowledge_base
Action Input: 查询关键词
Observation: 【来源 1：文档名.pdf（相关度：0.82）】检索到的文档片段...

Thought: 我已找到足够信息
Final Answer: 根据知识库内容，...（完整回答）
```

### 各阶段说明

1. **Question**：用户输入的自然语言任务或问题
2. **Thought**：LLM 分析当前情况，思考下一步行动
3. **Action**：根据思考结果选择执行的动作
4. **Action Input**：动作的具体参数
5. **Observation**：动作执行后的观察结果
6. **Final Answer**：综合所有信息后的最终回答

## 与普通 RAG 的对比

| 维度 | 普通 RAG | ReAct Agent |
|------|----------|-------------|
| **检索时机** | 每次必执行检索 | LLM 自主决定是否检索 |
| **检索次数** | 固定 1 次 | 1 到 N 次（受 max_iterations 限制） |
| **适合场景** | 明确文档查询 | 复杂推理、多轮问答、混合对话 |
| **响应格式** | 流式文本 + 来源 | 推理步骤日志 + 最终回答 |
| **短路优化** | 无 | 简单对话无需检索，直接回答 |

### 示例对比

**普通 RAG**（每次都检索）：
```
用户：你好
→ 强制检索知识库
→ 基于检索结果回答
```

**ReAct Agent**（智能决策）：
```
用户：你好
→ Thought: 这是简单的问候，不需要检索
→ Final Answer: 你好！有什么我可以帮助你的吗？

用户：KnowledgeRAG 支持哪些功能？
→ Thought: 这个问题需要查询知识库
→ Action: search_knowledge_base
→ Observation: [检索到的功能列表...]
→ Final Answer: KnowledgeRAG 支持以下功能...
```

## 前端功能

### 自然语言任务输入

- 大文本框输入
- `Ctrl+Enter` 快捷提交
- 支持长文本和复杂任务描述

### 示例任务卡片

内置 4 个示例任务，点击一键填入：

1. **知识查询**：查询特定主题的详细信息
2. **问题分析**：对复杂问题进行拆解和分析
3. **内容总结**：总结某个主题的核心要点
4. **对比分析**：对比多个概念的异同

### 执行选项

用户可选择：

- **使用知识库**：选择一个或多个知识库作为信息来源
- **联网搜索**：启用网络搜索获取最新信息（需配置）

### 步骤可视化

实时展示 Agent 的推理过程：

```
📝 Thought: 我需要先了解用户问题的核心概念...
🔧 Action: search_knowledge_base
📥 Action Input: {"query": "人工智能发展历程"}
📤 Observation: 找到 3 篇相关文档...
📝 Thought: 已找到足够的历史信息，可以组织答案了...
✅ Final Answer: 人工智能的发展经历了以下几个阶段...
```

### 历史任务面板

- **左侧抽屉**：显示所有历史任务
- **持久化存储**：保存到 localStorage
- **重新执行**：点击历史任务可填回输入框重新运行
- **清空历史**：一键清除所有记录

## 后端实现

### 核心文件

- `agent/react_agent.py` - ReAct Agent 主类
- `RAG_app.py` - `/agent_query` 接口

### Agent 架构

```python
class ReActRAGAgent:
    def __init__(self, llm, tools, max_iterations=5):
        self.llm = llm  # Ollama LLM
        self.tools = tools  # 工具集（如检索工具）
        self.max_iterations = max_iterations  # 最大迭代次数
    
    def run(self, question):
        # ReAct 循环
        for i in range(self.max_iterations):
            # 生成 Thought
            thought = self.generate_thought(question, history)
            
            # 决定 Action
            action, action_input = self.parse_action(thought)
            
            # 执行 Action
            if action == "search_knowledge_base":
                observation = self.search_knowledge_base(action_input)
            else:
                # 不需要检索，直接生成答案
                return self.generate_final_answer(thought)
            
            # 记录 Observation
            history.append((thought, action, observation))
        
        # 达到最大迭代次数，强制生成答案
        return self.generate_final_answer(history)
```

### 可用工具

Agent 可调用的工具包括：

1. **search_knowledge_base**：在指定知识库中搜索
2. **hybrid_retriever**：BM25 + FAISS 混合检索
3. **answer_directly**：不检索，直接回答

## API 接口

### 流式接口（推荐）

**POST /api/RAG/agent_query**

使用 SSE（Server-Sent Events）流式返回：

```javascript
// 前端接收示例
const eventSource = new EventSource('/api/RAG/agent_query', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: "你的问题",
    kb_ids: ["知识库 ID"],
    use_hybrid: true
  })
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // data.type: 'thought' | 'action' | 'observation' | 'final_answer'
  // data.content: 对应类型的内容
};
```

### 同步接口

**POST /api/RAG/agent_query_sync**

一次性返回所有步骤（测试用）：

```json
{
  "steps": [
    {
      "type": "thought",
      "content": "我需要查找..."
    },
    {
      "type": "action",
      "content": "search_knowledge_base"
    },
    {
      "type": "observation",
      "content": "检索结果..."
    }
  ],
  "final_answer": "最终回答内容"
}
```

## 使用场景

### 适合使用 Agent 的场景

1. **复杂问题**：需要多步推理的问题
2. **开放性问题**：没有标准答案的探索性问题
3. **多轮对话**：需要理解上下文的连续对话
4. **模糊查询**：用户不确定具体要查什么
5. **综合分析**：需要整合多个知识点的问题

### 适合使用普通 RAG 的场景

1. **事实性查询**：查找具体的事实或数据
2. **定义性问题**：询问某个概念的定义
3. **快速检索**：只需要查找相关文档
4. **性能敏感**：对响应时间要求极高

## 最佳实践

### 提问技巧

1. **清晰表达**：尽量清晰地描述问题
2. **提供上下文**：给出必要的背景信息
3. **分解问题**：复杂问题可以分解为多个小问题
4. **耐心等待**：Agent 需要时间思考和检索

### 配置建议

1. **max_iterations**：通常设置为 3-5 次
   - 太少可能找不到足够信息
   - 太多会增加响应时间

2. **知识库选择**：
   - 选择与问题最相关的知识库
   - 避免选择过多知识库影响性能

3. **混合检索**：
   - 建议启用 `use_hybrid=true`
   - 同时利用关键词和语义匹配

### 性能优化

1. **缓存利用**：充分利用向量缓存
2. **合理 Top-K**：设置合适的检索结果数量
3. **模型选择**：根据硬件选择合适的 LLM
4. **并发控制**：避免同时运行多个 Agent 任务

## 调试技巧

### 查看推理步骤

在前端界面可以详细看到每一步的：

- Thought 内容
- Action 选择和参数
- Observation 结果
- 最终答案生成过程

### 常见问题排查

1. **Agent 不检索**：
   - 检查是否选择了知识库
   - 确认文档处于启用状态
   - 验证向量化是否完成

2. **无限循环**：
   - 检查 max_iterations 设置
   - 查看 Thought 是否重复
   - 可能需要调整 Prompt

3. **回答质量差**：
   - 提升文档质量
   - 调整检索参数
   - 考虑更换更强的 LLM

## 技术细节

### Prompt 工程

Agent 的行为由精心设计的 Prompt 控制：

```
你是一个智能助手，使用 ReAct 框架来回答问题。

你可以使用以下工具：
- search_knowledge_base: 在知识库中搜索信息

请按以下格式回答：
Question: 必须回答的问题
Thought: 你当前的想法
Action: 要执行的动作（如果需要）
Action Input: 动作的参数
Observation: 动作的结果
...（重复上述步骤）
Thought: 我现在可以回答最终问题了
Final Answer: 对原始问题的回答

现在请回答以下问题：
{question}
```

### 工具定义

每个工具都有明确的输入输出规范：

```python
class Tool:
    name: str
    description: str
    input_schema: dict
    output_schema: dict
    
    def execute(self, input_data) -> any:
        pass
```

## 未来发展方向

1. **更多工具**：集成计算器、代码执行器等
2. **多 Agent 协作**：多个 Agent 协同解决复杂问题
3. **自我反思**：Agent 能够评估和改进自己的答案
4. **长期记忆**：跨会话的记忆和学习能力
5. **视觉理解**：支持图片和图表的理解
