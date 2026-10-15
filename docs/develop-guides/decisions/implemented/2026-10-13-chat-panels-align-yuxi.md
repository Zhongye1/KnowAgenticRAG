# 对话页的右侧面板拆成参照的两个表面

状态：implemented
类型：feature
Owner：web/src/pages/chat/ui/chat-page-view.tsx

事实分工：本记录拥有**状态面板与文件面板的分工、挂载位置与停靠规则**。`web/src/features/chat/model/panel-sections-store.ts` 拥有文件面板的分区集合、状态面板的开关与停靠判定（`stateOpen` / `stateMode` / `toggleStatePanel`）；`web/src/features/chat/lib/panel-sections.ts` 拥有分区类型；`web/src/pages/chat/ui/chat-side-panel.tsx` 拥有文件面板各分区的渲染；`web/src/pages/chat/ui/chat-page.module.css` 拥有两个表面的几何。

## 问题

参照的对话页右侧是**两个独立表面**，本仓把它们合并成了一个面板，并在此过程中接错了一处入口：

- 参照的「状态」是独立面板（`#agent-state-panel`，`.side-panel--state`）：容器放得下时停靠成 340px 窄列，放不下或文件面板开着时浮动成右上角卡片；本仓的状态是文件面板里的一个 tab，看状态要占掉整个面板宽度，也没有停靠/浮动这回事。
- 参照的文件面板（`.side-panel--file`）初始只有文件树，预览 / 子智能体 / 调试分区**随操作累积**；本仓一开始就摆上「文件 / 状态 / 调试」三个 tab。
- 参照的状态面板有「刷新状态」入口；本仓没有手动刷新状态的入口。
- **用量环接错了**：`onContextRingClick` 走的是 `panel.toggleWithDebugSection`，打开的是**调试分区**；参照的环 `@click="toggleStatePanel"` 打开的是状态面板。对非超管尤其明显——页头的「调试」按钮他们看不到，点环却落到调试分区上。

## 决策

1. **状态拆成独立表面**（`chat-page-view.tsx` 的 `.statePanel`），按参照的规则决定呈现方式：文件面板**关着**且 `容器宽 - 340 > 800` 时停靠成 340px 窄列（`flex: 0 0 340px` + `align-self: flex-start` + `margin: 8px 8px 8px 0`，主列靠 flex 自然收窄）；否则浮动成卡片（`right: calc(var(--file-panel-width) + 8px)`、`width: min(340px, …)`）。两个面板因此不会同时占横向空间。
2. **文件面板初始只有文件树**；调试分区由调试入口按需追加（`toggleWithDebugSection` 保持原样），预览与子智能体分区照旧按操作追加。`STATE_SECTION` 常量与 `'state'` 分区类型一并删除——状态不再是分区。
3. **页头三按钮的分工照参照**：调试 → 调试分区、状态 → 状态面板、文件 → 文件面板。
4. **用量环改为开状态面板**（`toggleStatePanel`），修掉上面那处接线。
5. **状态面板补「刷新状态」**：头部右侧的刷新按钮调 `fetchAgentState`，在途时禁用并转圈；打开面板时按参照补拉一次（「有会话但还没有状态」时），否则新开的空面板要等下一次运行时回调才有内容。
6. 状态面板的内容仍是 `StatePanel`（上下文使用情况 / 待办 / 附件·文件 / 产物 / 子智能体，已有折叠与计数），只是换了个宿主表面。
7. **状态面板各行的细节逐项对齐参照**：附件·文件与产物行改用**按扩展名着色的文件类型图标**（复用 `shared/lib/file-icon`，与参照 `FileTypeIcon` 同源，替换原来的通用文档图标），提示文案改为「打开 {名称}」；子智能体行的 24px 头像框里放**首字母兜底头像**（按种子哈希取一组渐变底，见 `lib/avatar.ts`）而不是通用的机器人图标；待办的脉冲点只在「进行中」出现；分区标题的折叠箭头 14px → 15px。
8. **两处控件的样式照参照重画**：文件树的作用域 tab 从「灰底药丸」改成参照的**纯文字**（12px、未选中 `--gray-500`/500、选中 `--main-600`/700、`padding: 0`、相邻之间一根 1px 竖线）——**这一半后来被下一份记录换成 antd `Segmented`**，见 `2026-10-14-file-tree-antd-and-breadcrumb.md`；用量卡改成参照的排布——**整张卡就是展开开关**（`padding: 10px 12px`、radius 10px、gap 8px），卡头是「大号占比（18px/600，tabular-nums）在左、`上下文占用` 小标签 + 已用/上限 + 箭头在右」的 baseline 行，轨道从 6px 收到参照的 **5px**（`--gray-100` 底 + `--main-500` 填充，警告/危险换色）。轨道仍用原生 `<progress>`：参照是 `span` + `role="progressbar"`，但本仓的 a11y 规则与 lint 都要求原生语义元素，填充色靠 `::-webkit-progress-value` / `::-moz-progress-bar` 两套伪元素给。
9. **文件树工具栏补上刷新钮**：参照的 `.tree-toolbar-actions` 里有一个常驻的刷新图标（标题「刷新个人空间」/「刷新文件」），本仓此前只有树的错误态里才有重试入口，刷新动作（`refreshThreadTree` / `refreshWorkspaceTree`）接好了却没有常驻入口。

## 替代方案

**保留单面板、状态仍是 tab**：与参照不同构，且看状态必须占满整个面板宽度；参照把状态做成窄列/浮卡的意图就是让它与文件工作区并存。

**用面板宽度比例做状态面板**：参照是固定 340px 窄列 + 浮卡，不是比例；比例会让窄列随窗口变化。

**让状态与文件同时停靠**：参照明确不同时——`statePanelCanDock` 在文件面板打开时直接返回 false，正是为了不让两个面板一起挤掉聊天列。

**给停靠/浮动加手动开关**：参照没有这个开关，是按可用宽度自动决定；加一个只会多出一个需要解释的状态。

**精确复刻参照的 max-height JS 计算**：参照用容器 rect 与输入区 rect 算出停靠/浮动的最大高度。本仓用 CSS 的 `calc(100% - 16px)`（停靠）与 `calc(100vh - 16px)`（浮动）近似，可见效果一致（内容超出时面板内部滚动），少一处需要 ResizeObserver 同步的布局度量。

## 后果

- 右侧不再只有「一个面板 + 若干 tab」：状态是常驻可开关的窄列/浮卡，文件面板是贴右缘的工作区。用户可以在看文件的同时看状态。
- 文件面板的 tab 不再有「状态」与「调试」的初始占位；调试入口仍然只在超管可见，且点击后才追加分区。
- 用量环的行为变了：从「开调试分区」变成「开状态面板」。这是本批唯一的行为修复。
- 状态面板没有关闭按钮（与参照一致）：关它要走页头的「状态」按钮；`onClose` 因此没有消费者，没有加。
- 状态面板的刷新按钮是本仓新增的交互入口（参照有，本仓此前没有）。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 状态与文件是两个独立表面 | 两者仍互相顶替 | `chat-page-view.tsx` | `chat-page.test.tsx`「「状态」开独立的状态面板，「文件」开文件面板，两者互不干扰」 | 状态仍是 tab 时开文件面板会连带打开状态 | Passed |
| 用量环开状态面板而不是调试分区 | 点环落到调试分区 | `chat-page.tsx` | `chat-page.test.tsx`「用量环开的是状态面板，不是调试分区」 | 用 `toggleWithDebugSection` 时该用例取不到状态面板（改动前即此行为） | Passed |
| 文件面板初始只有文件树 | 多出无内容的占位 tab | `panel-sections-store.ts` | `chat-page.test.tsx`「文件面板初始只有文件树一个分区」断言 tab 文本为 `['文件']` | 初始塞三个分区时断言失败（改动前即此行为） | Passed |
| 停靠/浮动按参照规则切换 | 两个面板同时挤占横向空间 | `panel-sections-store.ts` | `chat-page.test.tsx`「容器放得下时状态面板停靠，文件面板开着时浮动」读 `[data-mode]` | 文件面板打开仍停靠时聊天列被压到不可用 | Passed |
| 状态面板能手动刷新 | 状态只能等运行时回调 | `chat-page.tsx` | `chat-page.test.tsx`「状态面板的刷新按钮拉一次 agent_state」 | 无刷新入口时用例取不到「刷新状态」按钮 | Passed |
| 状态面板的行与参照同构 | 文件行用通用图标、头像用机器人图标 | `state-panel.tsx` / `lib/avatar.ts` | `state-panel.test.tsx`「文件条目用按扩展名着色的类型图标」「待办的脉冲点只在「进行中」出现」 | 两个不同扩展名落到同一个图标资源时该用例失败（通用图标即如此） | Passed |
| 用量卡样式与参照同值（作用域 tab 那一半已被 `Segmented` 取代） | 占比是小号标题 | `token-usage-card.tsx` | 真实页面读计算样式：用量卡渲染为「`--` 大号在左、`上下文占用 0 ›` 在右 + 5px 轨」 | 药丸样式时选中态带底色与内边距（改动前即此形态） | Passed |
| 文件树有常驻刷新入口 | 只能等错误态才刷新 | `chat-side-panel.tsx` | 真实页面点「刷新文件」不报错且树重拉；按钮的可访问名随作用域切换 | 无该按钮时 `getByRole('button', { name: '刷新文件' })` 取不到 | Passed |
| 真实页面形态与参照一致 | 窄列/浮卡几何走样 | `chat-page.module.css` | 真实页面截图：1440 宽下开状态面板为 `data-mode="docked"`（340px 窄列，含「状态」头部与刷新）；再开文件面板转 `data-mode="floating"`；与参照 `127.0.0.1:5175` 同视口截图比对（参照为 `is-docked`、340px、x=1092） | — | Passed |
| 旧能力不存在： 文件面板里的「状态」分区、`STATE_SECTION` 常量、`'state'` 分区类型、状态面板的 `onClose` 已删除 | 半套体系共存 | 本记录 | `grep STATE_SECTION src` 为空；`panel-sections.ts` 的类型联合无 `'state'` | — | Passed |
| 重新引入条件： 仅当状态需要成为可拖拽的独立窗口时，才考虑把停靠/浮动改成手动开关 | 无条件回归 | 本记录 | — | — | — |

## 风险

- 停靠判据依赖 `ResizeObserver` 给出的容器宽度；观察器未就绪时宽度为 0，面板会先以浮动形态出现再切到停靠。参照同样按容器宽度判定，接受这一帧差异。
- 状态面板停靠时主列收窄 340px；窄窗口下会走浮动分支，但 800px 的聊天列下限是按参照定的，未在 1024/768 两档断点上重新标定。
- 状态面板的 max-height 是 CSS 近似（见「替代方案」），极端矮窗口下的可见高度可能与参照差几像素。

## 证据

- `pnpm run check-types`、`pnpm run lint:check`（22 warnings / 0 errors；比本批开始前少 2 条，因为删掉了自绘控件）、`pnpm run check:tokens`、`pnpm run lint:fsd`、`pnpm run arch:check`、`pnpm run format:check`、`pnpm run build` 全部通过。
- `pnpm run test:unit`：188 文件 / 2155 例全过（本批开始前 187 / 2138）。
- 真实页面：`127.0.0.1:5173`（本仓）截图覆盖状态面板的停靠与浮动两态、文件面板的初始分区与作用域；参照 `Yuxi/web` 的 vite 起在 `127.0.0.1:5175` 同视口截图比对状态面板（`side-panel--state is-visible is-docked`、340px、x=1092）。
- 参照的几何与判定规则（`.side-panel--state` 的三态、`statePanelDockWidth = 340`、`statePanelDockMinChatWidth = 800`、`statePanelCanDock` 在文件面板打开时返回 false）来自 `Yuxi/web/src/components/AgentChatComponent.vue` 的源码读取，不是猜测。

## 已知未验证范围

- **文件面板的搜索仍是内联输入框**：参照点工具栏的搜索图标打开的是 `GlobalSearchModal`（`modes=['file']`），而本仓的全局搜索弹窗目前只有会话模式。这一处是结构性差异，未在本次改动（需要把 468 行的全局搜索弹窗改成按模式分流）。
- 状态面板的文件/产物/子智能体三类行没有在真实页面上用真实数据看过：当前账号的会话 `agent_state` 只有 token 用量，这几行只由单元用例覆盖（图标资源随扩展名变化、脉冲点计数）。
- 状态面板在窄窗口（< 1140px）下转浮卡的真实表现未截图（只覆盖了 1440 宽下的两态切换）。
- 状态面板内容的五个分区在真实 agent_state 下的渲染未逐项走查；本批只验证了「上下文使用情况」段在真实页面渲染。
- 深色模式未逐像素对照。
- 移动端（768 断点以下）两面板的覆盖式行为未走查。
- 对照用的 Yuxi dev server 期间发现 `5174` 端口曾被一个残留实例占用（其 `/api` 代理指向容器内主机名，页面报「服务端连接失败」）；已清掉，与本批改动无关。
