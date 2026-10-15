# 卡片列表工具栏统一为智能体页的一套控件词汇

状态：implemented
类型：simplification
Owner：web/src/shared/ui/list-toolbar.tsx

事实分工：`web/src/shared/ui/list-toolbar.tsx` 拥有这套控件词汇（`ListToolbar` 的搜索框 + 筛选位 + 右侧动作组、`ListRefreshButton`、`ListPrimaryButton`）；四个面板各自只提供搜索状态、筛选控件与动作，不再自己拼类名。词汇的事实源是 `/agent-manage` 的「搜索智能体 + 新增智能体 + 刷新」那一行（`web/src/features/agents/ui/agent-manage-panel.tsx`）。

## 问题

1. **同一类工具栏在扩展页写了两遍**：知识库、技能、工具、MCP 四个面板各有一行「搜索框 + 筛选 + 右侧动作」，但搜索框高度、图标定位、刷新钮的形态都不一样——知识库的输入框没有固定高度（继承 16px 行高）、图标是 `absolute left-2` 没有垂直居中、刷新是 `outlined` 小按钮；技能面板的图标同样没有垂直居中；四个面板的刷新图标尺寸在 3.5 与 4 之间不一致。
2. **`/agent-manage` 已经把这类工具栏调对了**：输入框显式 `h-8 pl-8 leading-8`（antd 的 reset 在 base 层压过了组件层的 font，不写就继承 16px 行高）、图标 `top-1/2 left-2 z-10 -translate-y-1/2`（`z-10` 是因为图标是绝对定位的兄弟节点，会被后绘的不透明输入框盖住）、刷新是 `type="text" size="small"` 且取数时转动、主操作 `type="primary"` 带 `text-color-white shadow-none`（antd 非线框主按钮自带 2px 底部投影）。这些约束在智能体页都有注释，但扩展页的四个面板各写各的。
3. **主操作缺位**：知识库的「新建知识库」是默认按钮而不是主按钮，技能的「上传 Skill」也是默认按钮（参照 `SkillCardList.vue` 里它是 `type="primary"`）。

## 决策

1. **抽 `shared/ui/list-toolbar.tsx`，四个面板共用**：`ListToolbar` 接 `search`（值、onChange、placeholder、无障碍名）、可选的 `filters`、以及 `actions`（右侧动作组，整组 `ml-auto` 靠右）。刷新与主操作各自是一个小组件，形态固定在词汇里。
2. **`/agent-manage` 暂不改为使用它**：那一行是这套词汇的事实源、已由独立评审过，本轮只做「扩展页向它对齐」。它成为第五个消费方时再收拢。
3. **主操作按参照定位**：知识库的「新建知识库」与 MCP 的「添加 MCP」用 `ListPrimaryButton`；技能的「上传 Skill」从默认按钮改为主按钮（参照里就是 `type="primary"`）。工具面板是只读面板，没有主操作，右侧只有刷新。
4. **动作顺序与智能体页一致**：搜索 → 筛选 → （靠右）主操作 → 刷新。知识库原先的「刷新在前、新建在后」一并调换。
5. **显式偏离参照**：无。这是本仓内部的词汇统一，与 Yuxi 的 `PageShoulder` 是两套实现，但视觉结果同向（搜索在左、动作在右）。

## 替代方案

**只在四个面板里把类名抄成一样的，不抽组件。** 改动的行数更少，但五处（含智能体页）同样的类名会在下一次调整时再次漂移；搜索框那一段有 10 行，抄四遍的成本高于一个组件的维护成本。

**把智能体页也改成用 `ListToolbar`。** 更彻底，但那一行有 `ml-auto` 与 `max-w-[33vw]` 两个细节是为它的统计徽标行服务的，本轮改动面会扩到一个与本任务无关的页面。

## 后果

- **`shared/ui/list-toolbar.tsx` 是新增的公共控件**：它带的是布局词汇（高度、图标定位、靠右、投影），不含业务语义；将来若有第五个列表页要同一套形态，直接复用而不是再抄一遍。
- **技能面板的「上传 Skill」变成主按钮**：这是相对本仓上一版的变化（对齐参照），批量模式下「批量删除」仍是危险主按钮。
- **刷新钮不再 `disabled`**：与智能体页一致（取数中只转动不禁用），重复点击只会重复取数。

## 验证

**单测与门禁（本机 Node 26）**

| 命令 | 结果 |
|---|---|
| `NODE_ENV=test vitest run` | 227 文件、2429 例通过（本批未新增用例：改的是控件形态，行为断言由既有用例覆盖——搜索框与刷新钮的无障碍名、筛选按钮的选中态、批量模式的动作组都还在；`model-provider-panel` 的既有装载失败与本批无关） |
| `tsc --noEmit` / `oxlint src` / `steiger` / `depcruise` / `check:tokens` / `prettier --check` / `vite build` | 全部通过（oxlint 0 error / 28 warning，与改动前同数） |

**真实页面走查（zwj / superadmin，真实后端 `localhost:5173`）**

以 `/agent-manage` 那一行为基准，逐个面板量了四个属性：搜索框渲染高度、搜索框外层类名、刷新钮类名、主操作类名。四个 tab 的搜索框高度都是 32px、外层类名都是 `relative w-full max-w-[33vw] sm:w-auto sm:flex-1`、刷新钮都是 `ant-btn-text ... ant-btn-sm`；知识库与 MCP 的主操作分别是「新建知识库」「添加 MCP」（`ant-btn-primary ... text-color-white shadow-none`），工具面板没有主操作。

截图：`web/alembic/pages/extensions/evidence/agent-manage-toolbar-reference-1440x900.png` 与 `toolbar-{knowledge,skills,tools,mcp}-1440x900.png`。

**未验证范围（不计为通过）**

- 深色主题与窄屏下的工具栏（`max-w-[33vw]` 在窄屏的回退未逐屏走查）。
- 技能面板批量模式下的动作组在真实页面上的排布（只在单测里覆盖）。

**被删能力**（simplification 记录要求显式列出）：

- 旧能力不存在： 四个面板各自的工具栏 markup（知识库的 `min-w-56 flex-1` 搜索框 + `outlined` 刷新钮、技能与 MCP 的无垂直居中图标、工具面板的独立筛选行）全部删除，类名只存在于 `shared/ui/list-toolbar.tsx` 一处。
- 重新引入条件： `ListToolbar` 的 props 开始只为某一个消费方增加时（例如给它加一个只有 MCP 面板用的开关），说明它已经不是共同词汇——那一处退回面板自己拼类名，而不是把特例塞进共享组件。
