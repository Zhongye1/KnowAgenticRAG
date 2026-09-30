# 智能体配置

ARS 的智能体系统基于 LangGraph 构建。配置链路由三个部分组成：

- Agent 如何被定义和发现
- Context 如何驱动配置界面
- Context 如何贯穿一次 Agent 运行周期

本文聚焦这三部分。

## 1. 整体结构

智能体开发围绕四个核心对象展开：

- **`BaseAgent`**：统一的 Agent 抽象，定义 `get_graph()`、`context_schema`、`capabilities`
- **`BaseContext`**：配置 Schema，也是前端配置项的来源
- **Graph / Middleware**：LangGraph 图与中间件链，决定运行时行为
- **Agent**：数据库中的一级智能体实例，保存展示信息、后端 `backend_id`、共享权限和 `config_json.context`

仓库中已经内置了可直接参考的智能体：

- `chatbot`：通用对话智能体，使用 `ChatBotContext` 扩展可调用子智能体配置
- `subagent`：专用子智能体后端，使用 `SubAgentContext`，用于被主 Agent 通过 task 工具调用

## 2. Agent 的代码组织

建议在 `backend/package/ars/agents` 下按包组织一个智能体：

```text
backend/package/ars/agents/
└── my_agent/
    ├── __init__.py
    ├── context.py
    └── graph.py
```

最小实现通常包含：

- 一个继承 `BaseAgent` 的主类
- 一个 `context_schema`
- 一个 `get_graph()` 实现

示例：

```python
from ars.agents import BaseAgent, BaseContext, load_chat_model
from langchain.agents import create_agent


class MyAgent(BaseAgent):
    name = "我的智能体"
    description = "示例智能体"
    context_schema = BaseContext

    async def get_graph(self, context=None, **kwargs):
        context = context or self.context_schema()
        graph = create_agent(
            model=load_chat_model(context.model),
            system_prompt=context.system_prompt,
            checkpointer=await self._get_checkpointer(),
        )
        return graph
```

## 3. Context 配置模型

### 3.1 `BaseContext` 的角色

`BaseContext` 定义在 `backend/package/ars/agents/context.py`，同时承担三项职责：

- 它定义了 Agent 可以配置哪些字段
- 它定义了这些字段在前端如何展示
- 它也是运行期传入 Graph 和中间件的上下文对象

当前基础字段包括：

| 字段 | 作用 |
| --- | --- |
| `system_prompt` | 系统提示词 |
| `model` | 主模型 |
| `tools` | 启用的内置工具 |
| `knowledges` | 关联知识库 |
| `mcps` | 启用的 MCP 服务器 |
| `skills` | 关联 Skills |
| `summary_threshold` | 摘要触发阈值 |
| `summary_prompt` | 摘要触发时使用的提示词 |
| `summary_keep_messages` | 摘要后保留的最近消息数 |
| `summary_tool_result_token_limit` | 工具结果 offload 阈值和预览 token 上限 |
| `summary_l2_trigger_ratio` | L1 后进入 L2 summary 的触发比例 |
| `max_execution_steps` | 单次运行最大执行步数 |
| `model_retry_times` | 模型调用失败时的最大重试次数 |
| `thread_id` / `uid` | 运行期标识，不作为页面配置项暴露 |

`tools`、`knowledges`、`mcps`、`skills` 在未显式配置时会默认启用当前用户可访问的全部资源；显式保存空列表表示不启用该类资源。

`ChatBotContext` 在 `BaseContext` 之上增加 `subagents` 字段，表示当前主 Agent 允许调用的子智能体。`subagents` 未显式配置或保存空列表时会默认启用当前用户可见的全部子智能体；显式选择后则作为允许列表过滤。

`SubAgentContext` 在 `BaseContext` 之上增加 `parent_thread_id` 与 `is_subagent_runtime` 等隐藏运行态字段，不包含 `subagents`，因此子智能体不能继续配置下一层子智能体。

### 3.2 前端配置项如何从 Context 生成

`BaseContext.get_configurable_items()` 会遍历字段定义，把字段类型、默认值、描述、模板元数据整理成 `configurable_items`。

随后：

1. `BaseAgent.get_info()` 暴露 `configurable_items`
2. 前端读取 Agent 详情
3. `AgentRuntimeConfigForm` 按 `kind` 渲染不同控件

`AgentRuntimeConfigForm` 直接消费 `context_schema` 生成的配置描述，不单独维护字段清单。因此：

- 新增一个 Context 字段，往往会直接影响侧边栏
- 字段的 `metadata` 信息会直接影响展示方式

### 3.3 配置表单与 Agent 的联动关系

在前端：

- `AgentRuntimeConfigForm.vue` 负责渲染配置表单
- `agentStore` 加载配置时，读取 `config_json.context`
- 如果某些字段未配置，会用 `configurable_items` 中的默认值补全
- 保存时，前端将当前表单写回 `config_json: { context: agentConfig }`

因此真实关系是：

```text
context_schema
  -> get_configurable_items()
  -> Agent detail API 返回 configurable_items
  -> AgentRuntimeConfigForm 渲染表单
  -> 用户编辑后保存到 config_json.context
```

`context_schema` 决定侧边栏可以配置的字段及展示方式；数据库中的 `config_json.context` 保存当前 Agent 的实际配置值。

### 3.4 自定义 Context 的推荐方式

智能体需要额外配置时，扩展对应 Context，由现有 schema 链路生成前端表单：

```python
from dataclasses import dataclass, field
from ars.agents import BaseContext


@dataclass(kw_only=True)
class MyAgentContext(BaseContext):
    custom_mode: str = field(
        default="default",
        metadata={
            "name": "运行模式",
            "description": "控制智能体的自定义行为",
            "options": ["default", "strict"],
        },
    )
```

然后在 Agent 中声明：

```python
class MyAgent(BaseAgent):
    context_schema = MyAgentContext
```

这会同时影响：

- 后端可接收的配置结构
- 前端配置侧边栏的展示内容
- 运行期 `context` 可访问的字段

## 4. Context 如何贯穿 Agent 的运行周期

Context 贯穿配置加载、Graph 构建、执行、文件系统视图和恢复流程。

### 4.1 配置加载阶段

在聊天请求进入后端时，服务会先解析请求中的 `agent_id` 或线程已绑定的 Agent，再加载对应配置。

当前主流程在 `chat_service.py` 中：

1. 新线程通过 `agent_id` 查找用户可访问的 Agent
2. 已有线程通过 `thread_id` 读取 `Conversation.agent_id`，并拒绝运行中切换 Agent
3. 取出 Agent 的 `config_json.context`
4. 与 `uid`、`thread_id` 合并成运行时输入

运行期 Context 以数据库中保存的 Agent 配置为基础来源；前端临时状态不进入该重建链路。

用户工作区会默认创建 `agents/AGENTS.md`、`agents/USER.md` 与 `agents/MEMORY.md`。每次 Agent 运行开始时，后端按这三个文件的固定顺序读取非空内容并追加到 `system_prompt`：前者适合放长期工作约束，`USER.md` 记录稳定的用户偏好，`MEMORY.md` 保存可跨对话复用的事实。它们属于用户级共享工作区；文件不存在、为空或不可读时不会阻断运行。每个文件最多读取 64 KiB，超出部分会截断并标记。

合并后的提示词结构可以理解为：

```text
Agent.config_json.context.system_prompt
  + 用户工作区 agents/AGENTS.md、USER.md、MEMORY.md 内容
  + 运行期中间件继续追加的系统提示段
```

一次性要求应写在当前对话中。三个工作区文件只保存需要跨对话复用的内容。

### 4.2 Context 实例化阶段

`BaseAgent` 在运行前会创建 `context_schema()` 实例，并通过 `update_from_dict()` 注入配置值。

这一步完成后，Context 才真正成为运行期对象。

可以把它理解为：

```text
config_json.context + runtime ids -> context_schema instance
```

### 4.3 Graph 构建阶段

`get_graph(context=context)` 会收到这份 Context。

以内置 `chatbot` 为例，Context 会直接参与：

- 主模型选择：`context.model`
- 系统提示词拼接：`context.system_prompt`
- 可调用子智能体列表：`context.subagents`
- 摘要阈值：`context.summary_threshold`

Graph 构建直接依赖 Context。普通 Agent 在归一化后的 `context.subagents` 非空时挂载 ARS task middleware；`SubAgentBackend` 隐藏并清空 `subagents` 字段，因此子智能体不会继续调用下一层子智能体。

### 4.4 Graph 构建与中间件运行阶段

`get_graph()` 创建 LangGraph 前会先调用 `prepare_agent_runtime_context`，用当前用户重新过滤资源字段，并派生运行时字段：

- `_visible_knowledge_bases`：当前会话实际可查询的知识库对象
- `_effective_skill_slugs`：需要注入提示词并允许激活的 Skill 依赖闭包；它不是文件系统权限边界
- `_runtime_skills`：由当前授权快照派生的 Skill Prompt 元数据与依赖

随后 Graph 构建会直接使用这份 Context：

- `load_chat_model(context.model)` 选择主模型
- `build_prompt_with_context(context)` 生成系统提示词
- `resolve_configured_runtime_tools(context)` 组装已配置的内置工具和 MCP 工具
- `SkillsMiddleware` 根据 `_effective_skill_slugs` 注入 Skill 提示段，并在 Skill 被激活后按需让模型看见其工具与 MCP 依赖；知识库工具由内置 `knowledge-base` Skill 提供
- Chat service 将线程历史附件的文件名和路径追加到本轮模型可见的用户消息，持久化消息保持原文

文件系统与沙盒接入同样读取这些运行时字段：

- 普通 Agent 使用根 Conversation 的 `runtime_scope_id` 连接 execution Sandbox，并以 Conversation 的 `workdir_path` 选择 UserWorkspace 中的当前 Workdir
- 子智能体保留 child `thread_id` 作为 LangGraph checkpoint，但继承根 Conversation 的 runtime 与 Workdir
- `/home/gem/user-data/<workdir_path>` 是当前执行树的默认工作目录；`uploads`、`outputs` 只是子目录约定
- `/home/gem/skills` 使用当前用户的共享/内置 Skill 授权投影；个人 Skill 使用 `/home/gem/user-data/agents/skills`。`_effective_skill_slugs` 只决定当前 Agent 在 Prompt 和工具层激活哪些 Skill，不改变 sandbox 身份或挂载

所以 Context 既是输入配置，也是 Graph 创建前整理出的运行时资源上下文。

### 4.5 文件系统与 Viewer 阶段

文件系统服务从 `config_json.context` 还原 runtime context，并将其用于：

- 判断当前 Agent 在 Prompt 和工具层激活的 Skills
- 构造 Agent 视图的 composite backend
- 构造 Viewer 视图的文件系统展示

因此 Context 同时影响：

- Agent 文件工具
- Viewer 文件浏览器
- Skills 的 Prompt/工具激活集合
- 沙盒挂载语义

### 4.6 恢复运行阶段

在 `resume` 流程中，系统同样会通过线程绑定的 Agent 重新构造 Context，再继续执行 Graph。

首次对话、中断恢复和文件系统查看均依赖同一份 Context 配置来源。

## 5. `capabilities` 的作用

`capabilities` 声明前端可从 Agent 静态元数据判断的能力开关，用于控制上传入口、文件面板等固定 UI。Context 管理配置值，运行中产生的状态保存在 LangGraph state；两类信息不写入 `capabilities`。

示例：

```python
class MyAgent(BaseAgent):
    capabilities = ["file_upload", "files"]
```

当前常见能力包括：

| capability | 说明 |
| --- | --- |
| `file_upload` | 启用上传入口 |
| `files` | 启用文件面板 |

像 todo 这类运行态信息，不建议再放进 `capabilities`。ARS 当前会直接从 LangGraph state 中提取 `agent_state`，前端在创建对话后常态化展示状态入口，并在状态面板中渲染 `todos`、`files`、`artifacts`、`subagent_runs` 等运行时内容。

`capabilities` 只描述 Agent 固定支持的界面入口。

## 6. 开发建议

### 6.1 新增配置时优先改 Context

影响 Agent 行为的配置应定义为 `context_schema` 字段，并沿统一 schema 链路生成前端表单。前端本地状态仅用于界面交互。

### 6.2 把 Graph 逻辑和配置逻辑分开

推荐做法：

- `context.py` 定义配置模型
- `graph.py` 使用这些配置构建 Graph

这样前后端联动关系会清晰很多。

### 6.3 把“配置来源”和“运行时状态”区分开

建议始终区分两层语义：

- `config_json.context`：持久化配置来源
- `runtime.context`：实际运行对象，可能被中间件继续补充或修改

## 7. 相关主题

- [工具系统](./tools-system.md)
- [中间件](./middleware.md)
- [沙盒配置与运维](./sandbox-architecture.md)
- [沙盒机制详解](../mechanisms/sandbox.md)
- [Summary 上下文压缩机制](../mechanisms/context-compression.md)
- [知识库机制详解](../mechanisms/knowledge-base.md)
- [MCP 集成](./mcp-integration.md)
- [Skills 管理](./skills-management.md)
- [子智能体](./subagents-management.md)
- [Langfuse 集成](../advanced/langfuse-integration.md)
