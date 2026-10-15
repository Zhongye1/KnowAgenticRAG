# 对话页的状态分区

状态：implemented
类型：feature
Owner：web/src/features/chat/lib/agent-state-readers.ts

事实分工：本批新增 `web/src/features/chat/lib/agent-state-readers.ts`（`agent_state` 五类字段的类型化读取）、`web/src/features/chat/ui/state-panel.tsx`（聚合分区渲染）；`panel-sections.ts` 补上 `state` 分区类型与常驻 `STATE_SECTION`；`pages/chat/ui/chat-page.tsx` 拥有分区内容的数据派生与「打开文件预览 / 打开子智能体线程」两个动作。

## 问题

`agent_state` 整包已经在运行时里（`thread-runtime-store.ts:42`），但 `AgentStateResponse` 只声明了 `token_usage`，其余字段（`todos / files / artifacts / subagent_runs`）没有类型化读取；`ui/token-usage-card.tsx` 单独摆在输入区上方，参照里它是状态面板的一个分区。参照的状态面板（`AgentChatComponent.vue:329–741`）聚合五个只读段：用量（含折叠明细）、待办、附件/文件、产物、子智能体，全部为空时显示「暂无状态内容」。

## 决策

1. **读取层是纯函数集，逐字段降级**：`readAgentStateTodos`（缺 content 丢弃；状态不在白名单归 `unknown`，不渲染成「待处理」——沿用第 2 片对任务清单的收紧口径）、`readAgentStateFiles`（后端给 `Record<path, 元数据>`，路径去重，附件列表并入同一份且不覆盖已有路径）、`readAgentStateArtifacts`、`readAgentStateSubagentRuns`（直通 `readSubagentRuns`）。非对象输入统一返回空集合，不猜。
2. **待办展示名按码点截断**（`Array.from().slice(0, 60)`，对齐参照 `formatTodoName`），完整内容留在 `title` 供悬浮——emoji 占两个码元不会被切成半个。
3. **状态分区是面板的常驻分区**：与文件树、调试分区并列，全部段为空时显示「暂无状态内容」；分区内部各段可独立折叠（默认展开），计数徽标跟随内容。
4. **点击条目复用既有分区机制**：文件走 `file:thread:{path}` 的文件预览分区（与文件树同一套 `upsertSection` + `panelPreview.open`）；子智能体走 A5 的 `subagent:{run_id}` 分区。状态分区是入口聚合，不拥有预览与线程视图。
5. **用量卡复用 `TokenUsageCard`**：它已经有完整的读取与展示，本批只是把它从输入区上方的孤立卡片收进状态分区。

## 替代方案

**把状态内容塞进 `AgentPanel` 的 children**：面板是受控外壳，children 兜底只给调试分区；状态分区有自己的数据派生与动作，走 `renderSection` 与文件、子智能体分区同构。

**给每个字段建独立的 React Query**：`agent_state` 由 `fetchAgentState` 随流式与轮询写进运行时，不存在独立的失效节奏；再建查询层只会引入第二份真相。

**产物段复用产物卡片的提取函数**：对话流产物卡片从工具调用提取（本轮对话范围），状态分区从 `agent_state.artifacts` 读（整线程范围，后端已按 workdir 归一）；两个来源语义不同，各用各的。

## 后果

- 面板默认三个分区：文件、状态、调试；状态分区在无数据时占位一行「暂无状态内容」。
- 输入区上方原有的 `TokenUsageCard` 与状态分区里的重复——本批把页面顶部的独立卡片移除（只保留状态分区里这一份）。
- 附件条目在 `agent_state.files` 里已有路径时不重复出现；附件路径与工作区路径不在同一命名空间时可能出现两个条目指向同一物理文件，参照同。
- `AgentStateResponse` 的类型声明未扩（它只服务 API 段的字段子集）；读取层以 unknown 为输入，不需要契约先行。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 待办未登记状态归 unknown | 未知状态渲染成「待处理」外观 | `lib/agent-state-readers.ts` | 单测：unknown 归类 + 文案「状态未知」 | 改成 pending 后用例失败 | Passed |
| 文件路径去重，附件并入不覆盖 | 同一路径出现两条 | 同 | 单测：Record + 附件混合 | 去掉 seenPaths 后用例失败 | Passed |
| 缺 content 的待办丢弃 | 空条目渲染成空行 | 同 | 单测：混合输入 | — | Passed |
| 截断不留半个代理对 | emoji 展示名尾部乱码 | 同 | 单测：60 码点边界 | — | Passed |
| 全空渲染「暂无状态内容」 | 空面板挂着四个空折叠区 | `ui/state-panel.tsx` | 组件测试：空态、有待办、点击文件、子智能体可点性、折叠 | 恒 false 化空态判定后用例失败 | Passed |
| 子智能体条目只有带子线程的可点 | 无线程条目点击后打开空分区 | 同 | 组件测试：r1 可点 | — | Passed |

## 风险

- `agent_state.files` 的值形状后端没有 schema（`Record<path, unknown>`），读取层按可选字段取 `file_name` / `name`；后端改形状时文件名回退「文件」，路径仍正确。
- 状态分区在流式期间随 `agent_state` 分片刷新；React 每帧重派生五个读取函数，集合小（todos ≤ 20），成本可忽略。
- 真实链路未走查：需要一次产生 todos / files / artifacts / subagent_runs 的真实运行。

## 证据

- 全量门禁：`oxlint src test` 0 errors（539 文件）、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`depcruise`（无违规）、`vitest run`（184 文件 / 2094 例全过）、`vite build` 通过。
- 变异验证：三处「改坏 → 用例失败 → 还原」并核对 md5——unknown 归 pending（1 例失败）、文件不去重（1 例失败）、空态判定恒 false（组件空态用例失败）。

## 已知未验证范围

- 真实链路未走查：状态分区各段的真实数据形态与点击动作需要一次真实运行；随 `pages/agent/evidence/` 归档。
- 用量卡在状态分区里的折叠明细是 `TokenUsageCard` 既有实现，本批未改；它与参照的折叠交互差异归阶段二。
