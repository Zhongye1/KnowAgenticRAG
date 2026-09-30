# 中间件系统

中间件是 ARS 扩展智能体运行行为的主要机制。它工作在 LangGraph Agent 的模型调用、工具调用、状态更新和文件系统访问路径上，用来把知识库、Skills、子智能体、上下文压缩和运行观测接入同一条执行链路。

内置 `ChatbotAgent` 与 `SubAgentBackend` 都会在 `get_graph()` 中构建中间件列表。`prepare_agent_runtime_context` 在 Graph 创建前完成资源过滤，中间件随后消费已经归一化的运行时配置。

## 运行时准备

运行时准备发生在中间件装配之前，负责确定后续中间件可见的资源。内置 Agent 创建 Graph 前依次执行：

- `prepare_agent_runtime_context`：按当前用户权限过滤工具、知识库、MCP、Skills 和子智能体，并派生 `_visible_knowledge_bases`、`_effective_skill_slugs` 与 `_runtime_skills`
- `build_prompt_with_context`：基于 Context 生成系统提示词
- `load_chat_model(context.model)`：加载主模型
- `resolve_configured_runtime_tools(context)`：加载已配置的内置/MCP 工具，并把可读 Skill 的本地依赖注册进静态 ToolNode；Skill MCP 依赖由 Middleware 在激活轮次动态绑定

中间件直接消费归一化后的 runtime context。资源授权和可见性过滤由前置准备阶段完成，产生副作用的工具仍需在执行边界校验具体目标。

## 内置中间件链路

当前内置 `ChatbotAgent` 的中间件顺序如下：

| 中间件 | 作用 |
| --- | --- |
| `create_agent_filesystem_middleware` | 通过 Sandbox 接入实时 Project Workdir、User Data 与只读 Skills，并在工具结果过大时把内容写入 Project `outputs/large_tool_results` |
| `SkillsMiddleware` | 注入可见 Skill 的提示段，监听读取 `SKILL.md` 后的 Skill 激活，并按依赖追加工具和 MCP 工具；知识库工具由内置 `knowledge-base` Skill 按需加载 |
| `ArsSubAgentMiddleware` | 仅主 Agent 在存在可见子智能体时挂载，提供 `task` 工具调用真实子 Agent graph |
| `ArsSummarizationMiddleware` | 基于 DeepAgents `SummarizationMiddleware` 做长上下文压缩，并清洗被摘要历史里的工具结果 |
| `TodoListMiddleware` | 提供待办状态，让前端状态面板可展示 Agent 运行进度 |
| `PatchToolCallsMiddleware` | 修正部分工具调用消息形态，提升工具调用兼容性 |
| `ModelRetryMiddleware` | 在模型调用失败时按配置重试 |
| `ImageInputCompatibilityMiddleware` | 仅为 OpenAI Chat Completions 兼容链路桥接 `read_file` 返回的图片；模型明确拒绝图片输入时自动改为 `ocr_parse_file` |
| `TokenUsageMiddleware` | 在 LangGraph state 写入近似上下文、本次与线程累计的 Provider 实际 token 用量、模型标识和缓存命中率，供前端状态面板查看 |

`SubAgentBackend` 使用同一组核心能力，但不会挂载 `ArsSubAgentMiddleware`，并额外过滤 `present_artifacts`、`ask_user_question`、`install_skill` 等不适合子智能体直接使用的工具。

## 知识库工具

知识库访问能力沉淀为内置 `knowledge-base` Skill。Agent 读取 `/home/gem/skills/knowledge-base/SKILL.md` 激活该 Skill 后，`SkillsMiddleware` 会按依赖追加 `list_kbs`、`query_kb`、`find_kb_document`、`open_kb_document`、`get_mindmap`、`search_file` 和 `download_kb_file` 七个工具。

`prepare_agent_runtime_context` 根据当前用户权限和 Agent 配置生成 `_visible_knowledge_bases`，工具执行范围受该集合限制。`context.knowledges` 只定义资源范围，Skill 激活状态由 `SkillsMiddleware` 单独维护。

知识库文件树不挂载到沙盒。Agent 通过知识库工具访问内容，`/home/gem/kbs` 等旧路径不属于当前接口。状态、权限、存储和检索边界见[知识库机制详解](../mechanisms/knowledge-base.md)。

## Skills 注入与激活

`SkillsMiddleware` 支持渐进加载和显式预加载：

1. 模型调用前读取 `_effective_skill_slugs`。普通 Skill 注入名称、描述和 `SKILL.md` 路径；`preload_skills` 及其依赖闭包直接注入根级完整说明。
2. 工具调用后检查模型是否读取了共享投影 `/home/gem/skills/<slug>/SKILL.md` 或个人 UserWorkspace
   `/home/gem/user-data/agents/skills/<slug>/SKILL.md`。如果该 Skill 在
   `_effective_skill_slugs` 范围内，就把它写入 `activated_skills`，并在后续模型调用中追加它声明的工具和 MCP 依赖。

普通 Skill 在读取并激活后开放依赖；预加载 Skill 从首轮模型请求开始开放依赖。默认空配置保持初始工具 schema 不变。

## 附件与文件系统

附件确认后会落盘到当前 Workdir。每个新 Run 都把线程全部历史附件的文件名和实时路径追加到本轮模型可见的 `HumanMessage`，不会修改系统提示词，也不会把文件内容复制进模型上下文。数据库 Message、流式 `init` 事件和历史接口仍保留原始用户文本，因此前端不渲染这段模型专用上下文。模型需要查看附件时，应通过 `read_file` 读取对应路径；中断恢复沿用 checkpoint 中原有的本轮消息。

文件系统中间件通过 Sandbox 暴露当前用户的整个 UserWorkspace 与只读共享 Skills。普通 Agent 与子智能体使用根 Conversation 的同一个 `runtime_scope_id` 和 `workdir_path`；child `thread_id` 只隔离 LangGraph checkpoint。Workdir 选择 cwd，不形成同一 uid 内的文件隔离；各 Agent 的 Skill 选中列表只影响 Prompt 和工具激活。

## 子智能体任务

主 Agent 配置了可见子智能体时，会挂载 `ArsSubAgentMiddleware` 并获得 `task` 工具。该工具从 `agents` 表查找 `is_subagent=true` 且后端为 `SubAgentBackend` 的 Agent 配置，随后启动对应子 Agent graph。旧版独立 SubAgents 表不参与当前链路。

子智能体执行时会获得独立 child thread、独立 checkpoint 和 `agent_runs(run_type=subagent)` 记录；工具结果会返回 child thread ID，后续可以把该 ID 传回 `task` 继续同一个子任务。子智能体自身不会再挂载下一层 `task` 中间件，避免形成嵌套子智能体链路。

## Summary 上下文压缩

`ArsSummarizationMiddleware` 在主模型调用前按近似上下文大小决定是否进入压缩：L1 只生成临时精简视图并卸载长工具结果，L2 才把较早历史写入文件、调用摘要模型并更新 checkpoint 中的 `_summarization_event`。它不删除 PostgreSQL 聊天消息，内部摘要模型的 token 也不进入当前主模型用量口径。

配置字段及默认值见[智能体配置](agents-config.md)，完整触发条件、文件 Owner、流事件、恢复边界与测试入口见[Summary 上下文压缩机制](../mechanisms/context-compression.md)。中间件总览只维护装配位置与职责，不复制实现细节。

## Token 用量统计

`TokenUsageMiddleware` 同时维护两种用途不同的口径：

- 近似上下文统计通过 `count_tokens_approximately` 计算，用于上下文窗口、摘要阈值和消息构成展示。
- 实际用量直接保留主 Agent 模型调用返回的 `AIMessage.usage_metadata`，包括 `input_tokens`、`output_tokens`、`total_tokens`、缓存和推理 token 明细。当前不包含 Summary 中间件内部直接发起的 L2 摘要模型调用，因此尚不能作为完整账单口径。

state 中的实际用量分为 `latest`、`run` 和 `thread`：分别表示最近一次模型调用、当前 AgentRun 累计和当前 LangGraph 线程累计。前端状态面板只读取 state；流式终态 chunk 不携带用量。worker 从当前父线程、`current_run_id` 匹配的 AgentState 提取 `run`，在 Run 进入终态时将该快照写入 `AgentRun.token_usage`。`run.models` 与 `thread.models` 使用 ARS `provider_id:model_id` 配置 spec 分桶，并记录 Provider 响应中的实际模型 ID，避免模型切换后把不同模型的 token 混为一组，也避免把 OpenAI 兼容协议类型误当作业务供应商。

每个模型桶独立计算缓存 token 命中率：使用 Provider 明确上报的 `input_token_details.cache_read / input_tokens`；OpenAI `priority` / `flex` service tier 对应识别 `priority_cache_read` / `flex_cache_read`。累计时先汇总该模型已上报缓存明细的输入 token，再计算 `sum(cache_read) / sum(input_tokens)`；缺少缓存读取字段表示 Provider 未上报，不按 0 命中处理。当前 Run 的按模型聚合会在终态事务中写入 `AgentRun.token_usage`，父 Run 与 SubAgent Run 分别保存，不重复合并。

`siliconflow-cn` 与 `siliconflow` 当前返回的 usage 格式与统计契约不一致，暂列入 Token 用量 Provider 黑名单。黑名单模型仍计算近似上下文占用，但不写入最近调用、Run 或线程的 Provider 实际用量聚合。

Summary 触发使用近似上下文统计。Provider 返回的 `usage_metadata.total_tokens` 用于记录实际主模型用量。完整关系见[Summary 上下文压缩机制](../mechanisms/context-compression.md)。

## 自定义中间件

新增中间件时，将实现放入 `backend/package/ars/agents/middlewares`，再在具体 Agent 的 `get_graph()` 中加入 `middleware` 列表。新增前先确认它属于哪一种职责：

- 资源过滤、权限收敛和默认资源选择应放在 `prepare_agent_runtime_context` 一类的 Graph 创建前逻辑中。
- 模型提示注入、工具动态追加、工具结果处理和 state 更新适合做成 LangChain Agent middleware。
- 文件读写、工具结果卸载和 artifacts 展示应优先复用 `create_agent_filesystem_middleware` 与沙盒 backend。

仓库中仍保留 `DynamicToolMiddleware`，但当前内置 Agent 的工具和 MCP 加载已经由 `resolve_configured_runtime_tools(context)` 与 `SkillsMiddleware` 承担。新增功能时不要默认复用旧的动态工具中间件，除非确实需要“预注册后按请求筛选”的模式。
