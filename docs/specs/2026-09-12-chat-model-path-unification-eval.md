# /chat ↔ /agent 模型链路统一评估（agentic-rag 清单 4.1）

> 状态：**已评审（2026-09-12）** —— 结论见 §5，落地动作见 §6。
> 上游：[2026-09-12-agentic-rag-落地改造清单.md](2026-09-12-agentic-rag-落地改造清单.md) 4.1。

## 1. 问题

`/chat` 与 `/agent` 目前用两套方式调用同一个 provider 模型行：

| | `/chat`（含 MCP `answer_with_citations`） | `/agent` |
| --- | --- | --- |
| 实现 | `model_provider/providers/chat.py::OpenAICompatibleChatModel`（自研 httpx） | `agent/service/model_adapter.py::AgentChatModel`（LangChain `ChatOpenAI` 子类） |
| 请求体 | `build_chat_payload`：`stream=true` + `stream_options.include_usage` | LangChain 组装，`stream_usage` 控制 usage |
| 思考等级 | `thinking_level` → `reasoning_effort` / `chat_template_kwargs.enable_thinking` | 同左（子类 `_get_request_payload` 覆写） |
| token 上限 | `max_tokens` | 父类写 `max_completion_tokens`，子类改回 `max_tokens` |
| base_url | 接受 `.../chat/completions` 结尾 | 需 API 根（自行拼接） |
| 工具调用 / 结构化输出 | ❌ 不支持 | ✅ `create_agent` + `with_structured_output` |
| 错误面 | `ValueError(status + body[:500])` → `error` 事件 | `openai.*` 异常 → `error` 事件 |
| 重试 | 无（单次） | 节点级 `RetryPolicy`（plan/rewrite） |

风险不是「两套实现存在」，而是**两条链路的协议翻译会各自漂移**：同一个模型在 `/chat`
与 `/agent` 上对 `thinking_level`、token 字段、URL 形态的理解一旦不一致，症状是
「换个入口模型行为就变了」，定位成本极高。

## 2. 差异盘点（评估时实测）

| 差异点 | 是否已收口 | 证据 |
| --- | --- | --- |
| `thinking_level` 三档翻译 + `off` 的 Qwen 开关 | ✅ 抽到 `common/llm_protocol.apply_thinking_level` | `agent/tests/test_llm_protocol_parity.py` |
| token 字段名（`max_tokens` ← `max_completion_tokens`） | ✅ `normalize_max_tokens_field` | 同上 |
| base_url ↔ `/chat/completions` 互推 | ✅ `api_root_url` / `chat_completions_url` | 同上 |
| usage 索取方式 | ❌ 有意不同（chat 显式 `stream_options`；agent 由 LangChain 管理） | `test_stream_options_are_chat_side_only` |
| 错误文案与异常类型 | ❌ 不同（分属两个 SDK） | 两侧 `error` 事件均带 `msg` + `trace_id`，前端无需区分 |
| 重试策略 | ❌ 不同（chat 无重试；agent 节点级重试） | D36 预算内可控，属有意设计 |

## 3. 候选方案

| 方案 | 内容 | 成本 | 风险 |
| --- | --- | --- | --- |
| **A** `/chat` 切 LangChain | 用 `ChatOpenAI` 重写 `OpenAICompatibleChatModel`，两条链路同一 SDK | 中（重写 + 全量回归） | 🟠 触碰冻结的 `/chat`（D35）：SSE 增量形态、usage 携带、错误文案、超时/重试语义都要重新对齐；provider 目前是 chat/MCP 共用门面 |
| **B** tool-calling 下沉 provider | 在 `model_provider` 实现工具调用 / 结构化输出，agent 不再用 LangChain | 高（等于自研 agent 运行时） | 🔴 与 D34 依赖方向冲突（基础域反向依赖 LangChain）；LangGraph 条件边、预算、checkpointer 演进全部要自研 |
| **C** 传输不动、协议统一（**采纳**） | `/chat` 保留 httpx 客户端，`/agent` 保留 `ChatOpenAI`；两者共用 `common/llm_protocol` 的协议规则，并以跨链路一致性测试锁死 | 低（已落地） | 🟢 不触碰 `/chat` 契约；漂移点被测试钉住 |

## 4. 为什么不在此时选 A

1. **收益边际**：真正的痛点（协议漂移）C 已解决；A 剩下的收益只是「少一个 httpx 客户端」。
2. **回归面大而不可见**：`/chat` 的 `reasoning_content` 丢弃、`finish_reason` 透传、usage 事件、
   `ERROR` 事件码都建立在自研客户端的逐行 SSE 解析上；换成 LangChain 需逐项对齐，
   而这些行为目前**只有集成层能验证**（SSE 事件序列 + 前端 D25 消费）。
3. **冻结契约优先**：D35 明确 `/chat` 语义冻结，工程上空窗期越短越好。
4. **B 直接排除**：它把 LangChain 语义搬进基础域，与 D34/D39 的取舍相反。

## 5. 结论（评审决定）

- **采纳 C**：`/chat` 与 `/agent` 各自保留传输实现，共用 `common/llm_protocol` 的协议规则；
  新增跨链路一致性测试（`agent/tests/test_llm_protocol_parity.py`）作为漂移闸门。
- **A 记为期随后续**：触发条件 = 出现第二个需要工具调用/结构化输出的调用方
  （如 MCP 侧要出 `answer_with_tools`），或自研客户端的维护成本超过一次替换成本。
- **4.1 验收**：`/chat`、`/chat/stream` 回归全绿（本仓库全量 pytest 323 passed / 1 skipped，
  前端 chat 用例无新增失败），且两条链路的协议一致性用例常绿。

## 6. 落地动作（已完成）

| 动作 | 落点 |
| --- | --- |
| 新增共用协议模块 | `backend/src/common/llm_protocol.py`（纯函数、零依赖） |
| chat 客户端改为委托 | `model_provider/providers/chat.py`：`ensure_chat_completions_url` / `build_chat_payload` |
| agent 适配层改为委托 | `agent/service/model_adapter.py`：`AgentChatModel._get_request_payload` |
| 漂移闸门 | `agent/tests/test_llm_protocol_parity.py`（thinking_level / token 字段 / URL 互推 / usage 索取方式） |

### 若将来执行 A（迁移清单）

1. 在 `model_provider` 内新增基于 `ChatOpenAI` 的实现，**保持 `OpenAICompatibleChatModel` 接口不变**
   （`achat_stream` / `achat` / `test_connection`），用现有 `test_chat_client.py` 作回归基线；
2. 对齐四项语义：`stream_usage=True`、`max_retries=0`、错误文案（status + body 截断）、超时 120s；
3. 保留 `common/llm_protocol` 并在新实现上复用（一致性测试继续有效）；
4. 灰度开关（provider 级）→ 全量 → 删除 httpx 实现，`/chat` 契约零改动。
