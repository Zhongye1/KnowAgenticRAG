# 状态面板的用量卡与产物行还原参照

状态：implemented
类型：feature
Owner：web/src/features/chat/ui/token-usage-card.tsx

事实分工：本记录拥有**用量卡的信息结构与分段着色**（两列指标、模型卡、构成卡、最近调用）与**产物行的类型描述**。`web/src/features/chat/ui/state-panel.tsx` 拥有状态面板的分区与行渲染；`web/src/features/chat/ui/panel-sections.module.css` 拥有行、列表与分区骨架的样式；`web/src/features/chat/lib/token-usage.ts` 拥有数值与分段的计算（本批未改）；`web/src/features/chat/lib/artifacts.ts` 拥有 `artifactMetaLabel`，产物卡片与产物行共用它。

## 问题

1. **用量卡的信息结构与参照不同**：两项指标挤在一行、没有分隔线；展开后的构成明细没有「最近上下文构成」小标题；堆叠条所有分段都是同一个主色、图例是单列且没有颜色对应；模型统计是一行文字而不是标签在上、值在下的三列；明细顺序是「条 → 图例 → 模型 → 最近调用」，参照是「模型 → 构成 → 最近调用」。
2. **产物行只有文件名**：参照的产物行是两行——文件名 + `交付文件 · MD`（`state-list-item-meta`）。
3. **同一个文件在同一页有两种描述**：本仓 `artifactMetaLabel` 把扩展名映射成中文友好名（md → 「Markdown 文档」），而参照（产物卡片与状态面板共用一条规则）给的是 `交付文件 · MD`。
4. **列表没有重置**：本仓不引 Tailwind preflight，全局重置由 antd 的 `reset.css` 主导，而它只给了 `ol/ul/dl` 的 `margin-bottom`（`antd/dist/reset.css:71-74`），没有清 `list-style` 与 `padding-left`。于是状态面板里每个 `<li>` 都带 UA 的圆点、整列右移 40px（实测 `list-style-type: disc`、`padding-left: 40px`）。

## 决策

1. **用量卡按参照重排**：占比行与进度条不动；两项指标改成两列（第二格 `border-left: 1px` + `padding-left: 12px`）；展开后是三段——按模型分桶的调用统计、最近上下文构成、最近调用。数值与分段的**计算**不动，只改呈现。
2. **分段与图例色点共用一张 tone 表**：`system/tools/messages/tool-messages/summary/cut/overhead` → `--chart-palette-2/3/1/6/5`、`--main-500` 叠斜纹、`--gray-300`，与参照的 `.is-*` 一组同值；认不出的分段用中性灰。分段本身带 `key`，因此不必改 `lib/token-usage.ts`。
3. **模型卡成组**：一张卡片内多条用分隔线（`border-bottom`，最后一条去掉），头部是模型名（可带「响应 <模型>」）+ 调用次数胶囊，下面是标签在上、值在下的统计格（有推理时三列，否则两列）。
4. **产物行改成两行**：`.stateRowBody` 改为列排，标题 + `artifactMetaLabel(path)` 的 meta；附件/文件行保持只有文件名（与参照一致）。
5. **`artifactMetaLabel` 收敛成参照的一条规则**（`交付文件 · 大写扩展名`，无扩展名时 `交付文件`），删掉中文友好名映射。产物卡片与产物行从此同一套文案。
6. **状态面板的列表显式重置** `margin: 0; padding: 0; list-style: none`。
7. **删掉 `panel-sections.module.css` 里无人引用的 `.stateUsageCard`**：它与 `token-usage-card.tsx` 里用 Tailwind 写的那份是同一张卡的副本，改一处会留下另一处失效样式。

## 替代方案

**给状态面板单写一个「扩展名 → 交付文件 · EXT」的标签函数**，保留产物卡片的中文友好名：同一个文件在对话流的产物卡片与状态面板里会是两种描述；`artifactMetaLabel` 已经有一个 Owner，收敛比新增第二条规则更少表面。

**改 `formatTokenCount` 的进制**：查过参照的 `TOKEN_COUNT_K_UNIT = 1024`、`M_UNIT = K × 1000`，与本仓完全一致，不需要改。截图里的 `45K / 200K` 对应 204800 / 46080 这类 1024 的倍数，不是 1000 进制；`getTokenUsagePercentLabel` 也是取整百分比（与参照的卡一致）。

**子智能体头像换成参照的默认头像**：参照的默认头像是 DiceBear（`https://api.dicebear.com/10.x/glyphs/svg?seed=…`）远程生成的像素头像，换过去等于给状态面板加一个第三方运行时依赖（离线、隐私、可用性都要另行处理）。本仓保留首字母 + 渐变底的本地兜底。

**把折叠段换成 antd `Collapse`**：rc-collapse 的头部是 `div[role="button"]`（`rc-collapse/es/Panel.js:45`），会把现在的原生 `<button aria-expanded>` 降级，且它不提供 `aria-controls`。本批不动。

## 后果

- 用量卡与参照同构：两列指标带分隔线、构成明细带小标题、堆叠条与图例按类型着色、模型统计三列、明细顺序一致。
- 产物卡片上的「Markdown 文档」变成「交付文件 · MD」，与状态面板一致；csv/json/txt 同理。
- 状态面板的列表不再有 UA 圆点与 40px 缩进。这条对以后新增的原生 `<ul>` 同样成立——同族的既有坑还有原生 `<button>` 的灰底与 `<a>` 的下划线。
- `.stateUsageCard` 删除后，用量卡只有一份样式来源（`token-usage-card.tsx`）。

## 验证

- 单测：`token-usage-card.test.tsx` 新增「构成明细带小标题，图例按分段类型着色」（断言色点类名含 `--chart-palette-2`）；`state-panel.test.tsx` 新增「产物条目带类型描述，文件条目不带」（断言产物行文本含 `交付文件 · MD`、文件行只有文件名）；`artifacts.test.ts` 与 `artifacts-card.test.tsx` 的标签断言按新规则更新。
- 真实页面：用一份贴近参照截图的 `agent_state`（上限 204800、已用 46080、6 条待办、2 个产物、4 个子智能体）经 `GET /api/chat/thread/{id}/state` 喂给真实组件树，逐项比对——`23% / 上下文占用 45K / 200K / 当前对话累计 1.34M`、模型卡三列（`1.31M / 28.4K`、`1.22M · 93%`、`0`）、`最近上下文构成` + 四段着色堆叠条 + 两列色点图例、`最近调用 输入 69.8K · 输出 2.71K`、`待办 6/6`、`产物 2`（两行，含 `交付文件 · MD` 与 `交付文件 · HTML`）、`子智能体 4`。
- 量测：指标区 `grid-template-columns: 131px 131px`、第二格 `border-left-width: 1px`；列表 `list-style: none`、`padding-left: 0`、`margin: 0`。
- 命令：`vitest run`（188 文件 / 2162 用例通过）、`tsc --project tsconfig.json --noEmit`、`oxlint src`（22 warning / 0 error）、`prettier --check`、`node scripts/check-design-tokens.mjs`、`steiger ./src`、`depcruise`、`vite build` 均通过；并确认斜纹的 arbitrary 属性已进产物 CSS（`repeating-linear-gradient(135deg,var(--main-30)…`）。
