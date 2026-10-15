# Langfuse 集成

## 为什么 ARS 需要 Langfuse

ARS 的一次 AgentRun 可能包含多轮模型调用、工具执行、知识库检索和 LangGraph 状态转换。Langfuse 将这些观测数据关联到同一条 trace，便于按用户、线程、Agent 和请求定位耗时、模型输入输出及工具错误。

Langfuse 属于可选观测层。模型服务、聊天接口和业务状态不依赖 Langfuse；集成失败时，ARS 保留主链路结果并记录观测告警。

## 在 ARS 中能做什么

ARS 使用以下映射组织观测数据：

| ARS 数据 | Langfuse 字段 | 用途 |
| --- | --- | --- |
| 用户 uid | `user_id` | 按用户筛选 |
| 对话 `thread_id` | `session_id` | 连续查看同一线程的多轮执行 |
| 单次请求 | trace | 定位该轮模型、工具、耗时和错误 |
| `agent_id`、operation 等 | metadata 与 tags | 按 Agent 和调用类型筛选 |

用户在对话界面对助手消息提交点赞或点踩后，ARS 会继续把反馈保存在本地业务表中；如果该助手消息已经关联 Langfuse trace，则会同步写入 Langfuse score。同步到 Langfuse 的 score 名称为 `user-feedback`，点赞值为 `1`，点踩值为 `0`，点踩原因会作为 score comment 保存，便于在 Langfuse 中按低分反馈筛选和分析具体 trace。

## 如何配置

在 Langfuse 项目中创建访问凭据，并向 API/worker 运行环境提供以下变量：

| 变量 | 必需 | 语义 |
| --- | --- | --- |
| `LANGFUSE_PUBLIC_KEY` | 是 | 项目公钥 |
| `LANGFUSE_SECRET_KEY` | 是 | 项目密钥 |
| `LANGFUSE_BASE_URL` | 自托管或指定区域时需要 | Langfuse 服务地址；未配置时使用 SDK 默认地址 |
| `LANGFUSE_ENABLED` | 否 | 默认为启用；`0`、`false`、`no`、`off` 显式关闭 |

公钥、密钥或 Langfuse SDK 缺失时，`is_langfuse_enabled()` 返回关闭，聊天主链路继续运行。客户端初始化失败会记录 warning，并跳过该次 tracing。修改环境变量后需要重启对应进程；使用已有容器镜像且依赖发生变化时，需要重新构建镜像。

## 配置后系统会如何工作

服务为每次请求构建 Langfuse metadata、tags 和 callback，并使用 `request_id` 生成 trace ID。模型与工具事件通过 callback 上报；运行结束时，ARS 将 trace ID、用户 ID 和 session ID 写入对应消息或 Run metadata，并刷新客户端缓冲区。

请求关键路径不会同步获取可点击的 trace URL，因为该操作需要访问 Langfuse 远程接口。界面和业务状态以 ARS 本地数据为准；Langfuse 控制台承担观测查询。

超级管理员开启对话 Debug 模式后，可以从消息调试面板的 Run 分组直接打开对应 Langfuse trace。点击入口时，后端按当前 uid 校验 AgentRun 可见性，从该 Run 权威输出消息的 metadata 读取 trace ID，再通过 Langfuse SDK 惰性解析项目 URL；系统不会从相邻 Run 或消息猜测关联。后端只接受与 `LANGFUSE_BASE_URL` 同源的 URL；未配置该变量时使用 `https://cloud.langfuse.com`。Run 没有持久化 trace 时，界面提示该 Run 暂无 Trace；Langfuse 未配置、远端解析失败或返回跨源 URL 时，界面提示 Langfuse 不可用。这些失败不影响 AgentRun 和聊天结果。

## 如何查看是否生效

1. 使用测试账号发起一轮真实 Agent 对话，并记录 thread、Agent 和发起时间。
2. 在 Langfuse 控制台按最近时间、`session_id` 或 `agent_id` 筛选 trace。
3. 打开对应 trace，核对模型调用、工具调用、metadata 与耗时。
4. 对助手消息提交一次测试反馈，确认本地反馈保存成功；消息已绑定 trace 时，再检查 Langfuse 中的 `user-feedback` score。

未找到 trace 时，依次检查运行进程是否收到环境变量、Langfuse SDK 是否存在、客户端初始化 warning、服务地址连通性和凭据所属项目。聊天成功仅证明业务主链路完成，Langfuse trace 需要在控制台或 API 中单独读取。

## 当前建议的接入方式

推荐按以下顺序接入：先验证 trace 与用户、线程、Agent 的映射；再验证本地反馈与 `user-feedback` score 的关联；最后基于稳定数据建立质量、延迟和成本分析。每个阶段都应使用真实请求回读 Langfuse 结果。

实现与测试入口：[langfuse_service.py](https://github.com/xerrors/ARS/blob/main/backend/package/ars/services/langfuse_service.py)、[feedback_service.py](https://github.com/xerrors/ARS/blob/main/backend/package/ars/services/feedback_service.py) 和 [test_langfuse_service.py](https://github.com/xerrors/ARS/blob/main/backend/test/unit/services/test_langfuse_service.py)。
