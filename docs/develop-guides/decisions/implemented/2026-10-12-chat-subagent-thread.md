# 对话页的子智能体线

状态：implemented
类型：feature
Owner：web/src/features/chat/lib/subagent-run.ts

事实分工：本批新增 `web/src/features/chat/lib/subagent-run.ts`（运行态解析、task 与 subagent_* 的展示视图、`readSubagentRuns`）、`web/src/features/chat/model/subagent-thread.ts`（子线程的流装载）、`web/src/features/chat/ui/subagent-task-row.tsx`、`web/src/features/chat/ui/subagent-lifecycle-row.tsx`、`web/src/features/chat/ui/subagent-thread-view.tsx`；`tool-result.ts` 的分派表把六个工具 id 路由到专用行；`panel-sections.ts` 的 `subagent` 分区补上 `threadId` / `runId` / `runStatus`；`pages/chat/ui/chat-page.tsx` 拥有分区随 `agent_state.subagent_runs` 的同步与内容渲染。

## 问题

`agent_state.subagent_runs`（`SubAgentRunState`，含 `run_id`、`child_thread_id`、`status` 等）已经在运行时里，但前端三处都没有接：`task` / `subagent_*` 走通用工具行回落（头部是「工具 X 执行完成」这类无信息文案）；面板声明了 `subagent` 分区类型与图标但没有渲染；子线程的消息没有入口。参照的三块是：`TaskTool.vue`（运行状态与子线程归属）、`SubagentLifecycleTool.vue`（生命周期工具的元信息、进度、事件）、`SubagentThreadView.vue`（面板内的子线程消息视图，终态读历史、运行中订阅 run 事件流）。

后端事实：子线程是普通线程——历史走 `GET /api/chat/thread/{id}/history`，运行态走 `GET /api/agent/runs/{run_id}/events`（与主对话同一个 SSE 形态）；`backend/test/e2e/test_subagent_stream_e2e.py:379` 已用真实链路验证过这条读法。

## 决策

1. **解析与展示视图落在 `lib/subagent-run.ts`，全部纯函数**：`readSubagentRuns`（非数组丢弃、缺 `child_thread_id` 或 `run_id` 的条目丢弃——没有子线程就无法打开视图）、`resolveSubagentDisplayName`（结果名 → `display_label` → 参数 slug → 结果 slug → 「子智能体」）、`resolveSubagentEffectiveStatus`（`run_status` → `active_run_status` → `status`）、`resolveTaskRunStatus`（对齐参照口径：有结果即完成，结果标 failed 算失败，没有结果时只有活跃调用算运行中）、`buildSubagentLifecycleView` / `buildSubagentTaskView`。
2. **结果载荷统一归一为对象**：`parseSubagentToolResult` 把字符串结果 JSON 解析，解析不出与缺失都落空对象而不是 null——调用方不再各自判空，空对象不产生兜底文本（`Object.keys` 为空时不做 JSON 序列化）。
3. **行渲染器经 `tool-result.ts` 的分派表接入**：六个工具 id 返回 `subagent-task` / `subagent-lifecycle` 两个标记视图，`ToolCallRow` 顶部提前返回专用行，不走通用外壳。状态色与运行中动效在行内，折叠行为与通用行一致。
4. **活跃调用的判定由页面注入**：`ToolCallRow` 新增可选 `activeSubagentToolCallIds`；本批先不接「同子线程多次 steer 只算最后一个」的富化（那是 `enrichTaskToolCalls` 的按 run 归并，需要 agent_state 与工具调用的关联表），没有注入时非终态调用回落「已完成」，与参照在缺省注入时的行为一致。
5. **子线程视图复用全局运行时存储，键就是子线程 id**：`model/subagent-thread.ts` 用 `createRunStream` + `createStreamHandler` 建独立实例，分片写进子线程自己的运行时——与父线程的隔离靠键，不建第二套状态模型。分区关闭时 `disposeThreadRuntime` 整份释放（分片、流、运行时状态），不残留定时器。
6. **运行中的 run 从历史里过滤**：历史里的那条 run 与流式分片会整段重播，装载时按 `extra_metadata.run_id`（或 `run_id`）把在飞 run 的历史消息滤掉，只留流式渲染。终态 run 不订阅流，只展示历史。
7. **面板分区随 `agent_state.subagent_runs` 同步**：effect 从 `readSubagentRuns(runtime.agentState)` 派生分区，有运行态就 upsert（`key = subagent:{run_id}`），运行态消失时只清 subagent 分区，不动文件与调试分区。分区激活才拉数据、订阅流（`active` 传给视图）。

## 替代方案

**为子线程建第二套 store**：参照就是每视图一份本地 `streamState`；本仓的全局运行时存储已经按线程 id 分键、按版本号订阅，键就是天然的作用域。第二套 store 要重写一遍同样的分片表与订阅机制，且两套消息解析会漂移。

**子线程走独立路由**：A1 已冻结「面板内视图」的决定，独立路由与外壳的单侧栏拓扑冲突。

**把 run 状态做进工具调用的富化表（参照 `enrichSubagentToolCall` 的 `subagentRunById`）**：那需要把 `agent_state.subagent_runs` 按 `tool_call.id` 关联——后端目前没有这层关联（run 的 `tool_call_id` 不在 `SubAgentRunState` 里），参照靠 inject 一个页面级函数做启发式匹配。本批不猜这层关联：task 行用「有结果即完成、活跃调用算运行中」的保守口径，等后端补上关联字段再做富化。

## 后果

- `task` / `subagent_*` 从通用回落变成专用行；`HIDDEN_TOOL_CALL_IDS` 不变（`present_artifacts` 仍由产物卡片呈现）。
- 子线程分区在运行态出现时自动出现、消失时自动收走；用户手动关闭分区后，下一次 `agent_state` 变化会把它加回来——分区列表是状态的投影，不是用户收藏。
- 子线程视图里没有输入区、审批面板与队列条：子线程不接受用户消息（参照同），分片是只读消费。
- 面板 `subagent` 分区的图标沿用 `Folders`；阶段二按参照换图标。
- 同一子线程多次 steer 的中间调用在流式期间会显示为「已完成」（无结果、非活跃），结果回填后与最终调用一致。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| `readSubagentRuns` 只留可打开视图的运行态 | 半截条目渲染出打不开的分区 | `lib/subagent-run.ts` | 单测：完整条目、缺 id 丢弃、非对象丢弃 | 去掉 `child_thread_id` 要求后用例失败 | Passed |
| task 状态：有结果即完成，活跃才运行中 | steer 历史调用闪成运行中，或活跃调用一直是已完成 | 同 | 单测：结果、failed 结果、活跃/非活跃无结果、error | 去掉活跃集合判定后用例失败 | Passed |
| 展示名的回退链 | 头部出现「undefined」或裸 slug | 同 | 单测：四级回退 | — | Passed |
| 空结果载荷不产生 JSON 兜底 | 展开后是 `{}` | 同 | 单测：空对象无兜底 | 去掉 `hasMeaningfulResult` 后用例失败 | Passed |
| 事件截到八条 | 巨量事件把面板撑爆 | 同 | 单测：12 条截到 8 | — | Passed |
| 六个工具 id 走专用行 | task 显示「工具 task 执行完成」 | `tool-result.ts` + 行组件 | 组件测试：task 与 lifecycle 各自的头部、状态、展开内容 | — | Passed |
| 子线程与父线程的消息不串 | 子线程分片写进父线程 | `model/subagent-thread.ts` | 键隔离是存储既有语义（`thread-runtime-store` 按线程 id 分键）；本批单测覆盖 `readSubagentRuns` 与行渲染，装载层的真实流语义未单测（见未验证范围） | — | 部分 |
| 分区随运行态出现与收走 | 运行态清空后分区残留 | `pages/chat/ui/chat-page.tsx` | 页面测试的分区同步走真实实现（mock 只替换网络层） | — | Passed |

## 风险

- 子线程装载层的 SSE 时序（重连、`Last-Event-ID` 续传、终态后重拉）复用了 `createRunStream` 的既有实现，但子线程语境下的真实行为没有单测与真实链路验证；`test_subagent_stream_e2e.py` 覆盖的是后端，不覆盖这个前端装载层。
- `activeSubagentToolCallIds` 尚无注入方：流式期间 task 行的「运行中」状态在当前装配下不会出现（永远走「无结果→已完成」）。这是保守方向的错误，不产生假运行态。
- 分区随 `agent_state` 同步意味着用户不能固定一个已结束子线程的分区；重新打开要等运行态再次出现或从对话流的 task 行进入（后者的入口本批未接）。

## 证据

- 全量门禁：`oxlint src` 0 errors（347 文件，7 条既有警告，均不在新增文件）、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`depcruise`（394 模块 / 1430 依赖）、`vitest run`（179 文件 / 2064 例全过）、`vite build` 通过；根 `verify_engineering_contracts.py` 通过。
- 变异验证：三处「改坏 → 用例失败 → 还原」并核对 md5（基线 18 例）——`readSubagentRuns` 放宽 `child_thread_id` 要求（1 例失败）、task 不看活跃集合（1 例）、空对象产生 JSON 兜底（2 例失败）。

## 已知未验证范围

- 子线程视图的真实链路未走查：需要一个会真实启动子智能体的运行（本机多数运行不触发 `task`），验证分区出现、子线程消息装载、运行中流式与终态后历史对齐。走查时随 `pages/agent/evidence/` 归档。
- 同一子线程多次 steer 的「只有最后一个算运行中」需要页面注入活跃集合，本批未接；等后端把 run 与 `tool_call.id` 的关联下发后补。
- 面板 `subagent` 分区的图标与视觉是外壳占位，阶段二（B4）与参照对齐。
