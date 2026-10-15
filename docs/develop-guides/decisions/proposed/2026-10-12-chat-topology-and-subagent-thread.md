# 对话页拓扑与子智能体线程的承载方式

状态：proposed
类型：architecture
Owner：web/src/pages/chat/ui/chat-page.tsx

事实分工：`web/src/pages/chat/ui/chat-page.tsx` 拥有对话页的布局与入口装配；`web/src/features/chat/lib/panel-sections.ts` 与 `web/src/features/chat/ui/agent-panel.tsx` 拥有右侧面板的分区模型与外壳；`web/src/app/layouts/app-shell.tsx` 拥有全站外壳。参照实现 `/home/liskarm/桌面/RAGS/Yuxi/web` 只提供视觉与行为事实，不拥有本仓拓扑。

## 问题

参照的 `AgentChatComponent.vue` 把三个入口放在一条 `chat-header` 里（模板 12–67）：对话标题、状态面板入口、文件面板入口，Debug 入口的门槛是 `debugMode && isSuperAdmin`。本仓的外壳切片已把全站拓扑定为「单侧边栏、无顶栏」（见 `2026-10-12-web-shell-yuxi-alignment.md`），对话页现在只有 `ContentLayout` 的 `title`（写 document.title）与一个落在消息区上方的超管 Debug 按钮。三个入口因此没有落点。

同一份参照用 `SubagentThreadView.vue`（309 行）在右侧面板内展示某个子智能体的对话，入口来自工具行与面板的子智能体分区。本仓的 `agent_state.subagent_runs` 已经带 `child_thread_id`，`lib/panel-sections.ts` 的类型联合里也已声明 `subagent`，但没有入口也没有渲染，打开子智能体对话这条路径不可达。

这两个选择都会长期约束对话页与外壳的关系，且都有不止一个合理答案，因此先冻结再动 UI。

## 提案

### 一、不建对话页顶栏

保持全站「单侧边栏、无顶栏」的拓扑。参照 `chat-header` 的三个入口改落现有布局：

- **对话标题**继续由 `ContentLayout` 写 document.title，不占用页面纵向空间。
- **状态入口与文件入口**做成消息区与输入区之间的一行动作区，与已有的超管 Debug 开关同排；点击后激活右侧面板的对应分区（`message-debug` 或 `file-tree`）。
- 参照的 `debugMode && isSuperAdmin` 门槛本仓只保留超管一半：`web/src/entities/session` 没有 `debugMode` 概念，`/api/system/info` 下发的是组织与品牌事实。

参照的 `chat-header` 记入声明偏离，理由与外壳切片同源。

### 二、子智能体线程走右侧面板内的视图

对齐参照：在 `AgentPanel` 内新增 `subagent` 分区的渲染，节点数据取 `agent_state.subagent_runs` 里的 `child_thread_id`，消息用普通线程端点读取：

- `GET /api/chat/thread/{child_thread_id}/state?include_messages=true` 返回子线程的消息、`parent_thread_id` 与 `subagent_run`；
- 子运行的详情与事件用 `GET /api/agent/runs/{run_id}` 与 `agent_state.subagent_runs[].events_url` / `result_url`。

不新增路由。子线程是同一个面板里的一个分区，与调试分区、文件分区共用拖拽、最大化与关闭语义；面板同时只展示一个分区，父线程的消息不随子线程切换而变化。

## 替代方案

**只为对话页恢复顶栏。** 最贴参照，但要让外壳切片的决定开口子，之后每个页面都要重新判断一次自己有没有顶栏，`AppShell` 的布局也不再是唯一入口。

**把状态入口与文件入口挂到左侧导航列。** 导航列是全站级容器，承载的是路由级目标；对话页的面板分区属于页面内状态，挂上去会让导航项在对话页与其它页行为不同。

**子智能体线程用独立路由 `/agent/:thread_id/subagent/:runId`。** 可深链、可分享、刷新后可恢复，但要多一条路由、一个守卫与一套面包屑，并且面板的分区模型要容纳「来自路由的分区」，与现有的受控分区状态产生两个事实源。

**不做子智能体线程视图，只渲染工具行里的生命周期。** 成本最低，但参照里「点开子智能体看它的对话」这条路径不可达，`AgentPanel` 里预留的 `subagent` 分区类型会长期是死类型。

## 验收标准

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 无顶栏下状态与文件入口仍可达 | 入口无处安放，或被塞进导航列导致对话页行为与其它页不同 | `web/src/pages/chat/ui/chat-page.tsx` | `pnpm run test:unit` 中对话页的入口用例；真实页面点击后右侧面板切到对应分区 | 去掉动作区与面板分区的绑定后，对应用例必须失败 | Not run |
| 面板同时只展示一个分区 | 子智能体线程与父线程消息同屏拼接 | `web/src/features/chat/lib/panel-sections.ts` | 分区激活与关闭的既有用例；新增「激活 subagent 分区不改变其它分区的关闭语义」 | 让 `upsertSection` 允许两个激活分区时用例必须失败 | Not run |
| 子线程消息不与父线程串 | 打开子线程后父线程的消息被替换或追加 | `web/src/features/chat/model/thread-runtime-store.ts` | 子线程 state 读取的单测；父线程消息数在打开子线程前后不变 | 把子线程消息写进父线程运行时后用例必须失败 | Not run |
| 子智能体入口在无数据时不渲染 | 无 `subagent_runs` 时出现点了无反应的入口 | `web/src/features/chat/ui/`（子智能体分区渲染） | 空 `subagent_runs` 的渲染用例 | 去掉空列表判定后用例必须失败 | Not run |
| 全站外壳拓扑不变 | 对话页私自引入顶栏，`AppShell` 不再是唯一布局入口 | `web/src/app/layouts/app-shell.tsx` | `pnpm run lint:fsd`、`pnpm run arch:check`；对话页不新增页面级 header 组件 | 在对话页引入顶栏组件时依赖方向或 FSD 规则必须报出 | Not run |

## 风险

- 动作区承载入口是本仓新增的形态，参照没有对应物，视觉上需要额外设计一次；阶段二换 antd 时会与输入区一起重排。
- 子线程用普通线程端点读取，意味着它对权限与可见性走的是与普通线程相同的路径；若后端对子线程有额外可见性约束，本仓的读取会与之不一致，需要以真实链路核对。
- 面板内视图无法深链：刷新后子线程视图不恢复，只能重新从工具行或分区打开。这是对齐参照的代价。
