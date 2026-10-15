# 对话右侧面板对齐 Yuxi

状态：implemented
类型：feature
Owner：web/src/features/chat/ui/agent-panel.tsx

事实分工：`web/src/features/chat/lib/panel-sections.ts` 拥有分区模型（增改与关闭后的落点）；`lib/panel-width.ts` 拥有宽度上下界与拖拽换算；`ui/agent-panel.tsx` 拥有面板外壳；`web/src/pages/chat/ui/chat-page.tsx` 拥有分区列表、当前分区与宽度的状态。

## 问题

参照的 `AgentPanel.vue`（1819 行）是右侧边栏：标签栏（可激活 / 可关闭）、拖拽调宽、最大化 / 还原、隐藏，内容是四类分区（`file-tree` / `file` / `message-debug` / `subagent`）。本仓原本没有右侧面板，调试信息是输入框上方一个开关 + 页内一块面板。

## 决策

**面板做受控组件**：`sections` 与 `activeSectionKey` 由页面持有，面板只渲染并发出「激活 / 关闭 / 最大化 / 隐藏 / 拖拽」事件。参照也是这个形状，因此分区状态不在面板内部再存一份。

**拖拽只发指针横坐标**：宽度换算要容器宽度，只有页面知道；事件按帧合并（`requestAnimationFrame`），指针每动一下都换算会打满主线程。

**碰界时重新锚定拖拽起点**：不重锚的话，用户往回拖要先「抵消」掉多拖出去的距离，手感是先不动再突然跳；只有夹取真的改变了宽度时才重锚。

**布局改成横向分栏**：对话卡片与面板同一行，其余区块（待处理中断、队列条、输入区）留在左列下方；面板列 `min-w-0` 防止长内容把左列挤没。

**分区列表用 `upsertSection` 而不是数组拼接**：调试按钮与用量环两处入口都会把调试分区加进来，盲加会产生重复 key（React 会警告且行为未定义）。

## 替代方案

- **把分区状态放进面板内部**：参照是受控的；内部再存一份会出现「面板里的当前分区」与「页面里的当前分区」不一致。
- **拖拽时在面板内直接算宽度**：面板不知道容器宽度，只能读到自身宽度，夹取上界就算不出来。
- **不重锚**：见「决策」，手感会变涩。
- **给四类分区都注册上**：其中三类没有数据源，注册了只能渲染空壳（见「后果」）。

## 后果

**本仓没有数据源的分区（已核实契约）**：

| 分区 | 参照依赖 | 本仓情况 |
|---|---|---|
| `file-tree` / `file` | agent 工作区文件树 | 没有该数据源（roadmap 第 8 项「个人空间」） |
| `subagent` | 子智能体运行态 | 没有任何子智能体端点 |

因此也没有搬参照的 `shouldPollAgentPanelFilesystem`——它判断的是工作区文件树的轮询条件，没有数据源就没有可判断的对象。

当前只注册 `message-debug` 一类分区。

**与 Yuxi 的 UI 差异（待阶段二对齐）**：面板外壳目前是 Tailwind 工具类，未换 antd。标签栏的图标、`aria-selected` 标记、文件树不给关闭入口、最大化按钮标题随状态切换都已对齐；**拖拽把手的视觉反馈与标签栏的溢出行为（参照的 `sectionTabsRef`）未做**。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 当前结果 |
|---|---|---|---|---|
| 关闭分区后的选中落点 | 关掉中间的标签后选中跳到不相邻的位置 | `lib/panel-sections.ts` | `test/unit/features/chat/panel-sections.test.ts`（9 例，含中间与末尾两种） | Passed |
| 增改分区保留原位置 | 按 key 重排导致用户正看着的标签跳走 | 同上 | 同文件的「已存在时就地更新并保留位置」 | Passed |
| 宽度下界不超过上界 | 窄容器里夹取把宽度夹到不可用值 | `lib/panel-width.ts` | `test/unit/features/chat/panel-width.test.ts`（13 例） | Passed |
| 碰界重锚后继续拖能立刻响应 | 往回拖先不动再跳 | 同上 | 同文件的两步用例（碰界 → 从新锚点继续拖） | Passed |
| 外壳的标签栏与操作按钮 | 文件树被关掉 / 最大化标题不对 | `ui/agent-panel.tsx` | `test/unit/features/chat/agent-panel.test.tsx`（6 例） | Passed |
| 两处入口不产生重复分区 | React 重复 key 警告 | `pages/chat/ui/chat-page.tsx` | 页面用例运行时无重复 key 警告 | Passed |
| 全量门禁 | — | — | `oxlint` / `tsc` / `check:tokens` / `steiger` / `depcruise` / `vitest` / `build` | Passed |

已知未验证范围：**真实页面未验证**（本机没有浏览器）——分栏后的版式、拖拽手感、最大化与隐藏的观感都未验证；本片未做变异验证。
