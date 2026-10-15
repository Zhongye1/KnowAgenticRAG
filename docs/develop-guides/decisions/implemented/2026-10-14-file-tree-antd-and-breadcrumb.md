# 文件树面板的控件换成 antd，并补路径面包屑

状态：implemented
类型：feature
Owner：web/src/pages/chat/ui/chat-side-panel.tsx

事实分工：本记录拥有**文件树面板的控件选型**（作用域 / 搜索 / 树）、**面包屑**与**面板内各行的次序**；「拖拽把手的单击阈值」一条的语义 Owner 是 `web/src/features/chat/ui/agent-panel.tsx`（面板外壳，不是文件树面板），记在这里是因为它与本批同属面板交互。`web/src/features/chat/ui/file-tree.tsx` 拥有树与 antd `Tree` 的适配；`web/src/features/chat/ui/file-tree.module.css` 拥有 `.ant-tree-*` 的局部覆盖；`web/src/features/chat/lib/panel-tree.ts` 拥有 `pathBreadcrumbs`；`web/src/pages/chat/ui/chat-page.tsx` 拥有 `onSelectPath` 的接线。

## 问题

文件树面板此前是整套自绘控件，缺语义与键盘能力，也没有路径显示：

- **作用域**是原生 `<div role="tablist">` + `<button role="tab">`：语义正确，但没有 ←/→ 方向键导航（tablist 按规范应有 roving tabindex）。
- **搜索**是原生输入框 + 自绘的 `<ul>/<li>` 候选：没有 `role="listbox"/"option"`、输入框没有 `aria-expanded`/`aria-controls`，也没有 ↑↓/Enter/Esc。键盘用户无法从候选里选中一条，读屏也不知道那是一组可选项。
- **文件树**是递归的 `ul role="tree"`：没有键盘导航（↑↓/←→/Home/End），`role="treeitem"` 的焦点管理要自己维护。
- 面板**不显示当前路径**：用户只能从缩进层级里自己数。

## 决策

1. **作用域换成 antd `Segmented`**。换来内建的方向键导航与选中滑块。**代价明确接受**：语义从 `tablist/tab` 变成 radio（`radiogroup/radio`），外观也不再是参照的纯文字 tab——这是与「样式对齐参照」相抵的一处，由使用者选定。
2. **文件搜索换成 antd `AutoComplete`**。拿到组合框语义（listbox/option）、↑↓/Enter/Esc 与弹层定位。候选仍来自页面的防抖搜索，因此 `filterOption={false}`，组件不再本地过滤；选中即打开该文件的预览。
3. **文件树换成 antd `Tree`**。键盘导航、`role="tree"`、焦点管理由组件给；**节点行仍自绘**（类型图标、自绘 chevron、hover 显示的 24px 动作钮），antd 自带的 switcher 与行样式在 `file-tree.module.css` 里用 `.tree :global(.ant-tree-*)` 局部覆盖——全局覆盖仍只归 `antd-overrides.css`。缩进改由 antd 的 `indent-unit` 给（14px/级），行高 32px、6px 圆角、hover `--gray-50`、选中 `--gray-100` 保持参照的值。
4. **面板顶部加面包屑**：显示当前选中项的路径（首段是作用域名），点某一段**展开它的祖先并选中它**，不动其它分支。路径拆分是新加的纯逻辑 `pathBreadcrumbs`（目录段带尾斜杠、文件段不带、根返回空），`onSelectPath` 在页面侧落到 `panelFilesystem.setScopeState`。
5. **面包屑用 antd `Breadcrumb`**：item 传 `{ title, onClick }`。antd 在无 `href` 时把 item 渲染成 `<span>`（不是 `<button>`），因此顺带消掉了自绘版本里那两个按钮的浏览器默认灰底；与参照的差异（12px、分隔线间距、末段加重、超长段截断）用外层 arbitrary variant 收口。
6. **原生按钮一律显式声明背景**：本仓不引 Tailwind preflight（`src/index.css` 只引 theme 与 utilities，重置交给 antd 的 `reset.css`），而 antd 的 reset 没有清 `<button>` 的默认底色，因此**任何不声明 `background` 的原生按钮都会露出浏览器的 `#efefef` 灰底**。本次给文件树的刷新钮补上 `bg-transparent`；这也解释了为什么切片里其它原生按钮都写着 `background: transparent`。
7. **面板内各行按「作用域 → 搜索 → 面包屑」排序**：作用域在最上（先定看哪套树），搜索次之，面包屑贴着树（它描述的是树的当前位置）。
8. **拖拽把手同时充当面板左右两侧的分界，改成整高的 1px 虚线**：原来是一根 32px、4px 宽的实心灰条，现在 `top: 0; bottom: 0`、`border-left: 1px dashed var(--gray-200)`，元素本身留 6px 命中区（虚线画在左边框上，1px 太细抓不住）；hover/拖动时虚线变 `--main-400`。
9. **拖拽把手加位移阈值**：`pointerdown` 原本立刻把面板宽度改成指针位置，于是**单击把手会让宽度跳到点击处**（配合把手点亮，看起来就是闪一下）。改成记下起点、等指针位移超过 3px 才第一次回写宽度，并把把手的点亮也延后到真正开始拖动；没移动过的 `pointerup` 不回写（否则会把宽度算成 `pendingXRef` 的初值 0）。
10. **拖拽锚点改用面板当前宽度**：`onResize` 的首次锚点原本取 `rowRef.current.offsetWidth`——那是**内容行**的宽度（约 1147px），不是面板的宽度（约 605px）。于是第一次移动算出的 `rawWidth = 内容行宽度 - 0` 直接顶到上限，`reanchored` 又把锚点重置成上限值，表现为「一抓住就跳到左侧固定距离，之后只相对鼠标保持固定偏移」。改为取面板当前的像素宽度（新增 `panelWidthPxFromRatio`，与 `panelWidthFromRatio` 同源，避免调用方自己解析 `'600px'` 这种 CSS 值）；量不到宽度时直接不改宽度，而不是拿 0 当锚点把面板压没。
11. **修一处既有失效样式**：`.nodeDeleteBtn:hover` 用的 `--color-error-600` 在本仓 token 里不存在（只有 500/700），那条规则一直是死的（`var()` 解析失败即 `unset`），改为 `--color-error-500`。

## 替代方案

**作用域保持原生 tab，只补 ←/→**：与参照同形且保留 `role="tab"` 语义，约 20 行；本次选了 antd 词汇，代价是语义与外观都变。

**搜索搬进 `GlobalSearchModal` 的 file 模式**：与参照一致（参照点工具栏的搜索图标就是打开那个弹窗），还能顺带把工具栏并成一行；代价是要把 468 行、目前只有会话模式的弹窗改成按模式分流。本次选了 `AutoComplete`，搜索留在原位。

**文件树保留自绘、只补键盘与性能**：能保住现有视觉与手写的 `aria-selected`；换成 antd Tree 后这两点都要额外处理（见「后果」）。

**面包屑只做只读展示**：点它没有去处，等于多一行装饰；这里做成可点回到那一层。

## 后果

- **原生按钮的灰底是个陷阱**：不声明背景的原生按钮会露出 `#efefef`（见「决策 6」）。这条对以后新增的原生按钮同样成立，写 Tailwind 类时不能想当然地认为「没写背景就是透明」。
- 面包屑是 antd `Breadcrumb`，因此带上了它的 `<ol>/<li>` 结构与分隔线元素；视觉差异靠外层 arbitrary variant 收口，没有为它单独建 CSS Module。
- **`aria-selected` 要自己补**：rc-tree 只在节点显式声明 `selectable` 时才渲染这个属性，而且渲染的是「这个节点**可选**」而不是「这个节点**已选**」——两个都不对。本仓改为在节点上按真实选中态给 `aria-selected`（rc-tree 会把节点的 `aria-*` 透传到 `treeitem` 上）。
- **行的点击目标变了**：antd 把点击处理挂在内容包装元素（`.ant-tree-node-content-wrapper`）上，`role="treeitem"` 在更外层的节点 div（还含左侧缩进），点缩进不触发选中。`file-tree.test.tsx` 因此改成点内容区。
- 三个控件都带上 antd 的外观：作用域不再是纯文字 tab、候选列表不再是内联 `ul`、树的缩进与动画由 antd 给。这是本次选择的方向，与「样式对齐参照」在该面板上不再同时成立。
- 树仍是「点目录行展开」而不是「点 switcher 展开」：antd 的 switcher 被隐藏，展开走 `onSelect`，与替换前的交互一致。
- 面包屑只在有选中项时出现；没有选中时不占高度。

## 独立 Review 后的修复

本批提交后由不继承开发上下文的 Reviewer 审过完整需求、diff、测试与规范，据其结论修掉：

1. **浮动状态面板定位错**（major）：`.statePanelFloating` 的 `right` 引用 `--file-panel-width`，而这个变量原来无条件取文件面板的比例宽度（约 600px）——面板关着时它应该是 `0`。于是容器不够宽（≤1140）时打开状态面板，浮卡会落到聊天列中间。改为面板关着时给 `'0px'`（与参照 `filePanelWidthStyle` 同）。
2. **状态面板里的文件/产物/子智能体点了没反应**（major）：两个回调只调 `openSection`，它改分区列表与激活键但不打开面板。改为同时 `setOpen(true)` 并收起状态面板（参照 `openPanelPreview` / `openSubagentThread`）。
3. **状态按钮的高亮与 `aria-expanded` 绑在文件面板上**（major）：`activeSectionKey === 'state'` 在状态不再是分区类型后永不成立，`aria-expanded` 报告的是文件面板的状态。改为跟 `statePanel.open`，并补 `aria-controls` 指向 `#agent-state-panel`。
4. **键盘 ←/→ 展不开目录**（minor）：展开态是受控的，而 `Tree` 没接 `onExpand`，受控模式下 rc-tree 不会自己改键。补上 `onExpandedKeysChange` 由页面写回，并在展开时按需拉子项；用例覆盖这条路径。
5. **打开文件面板没收起状态面板**（minor）：参照里两块面板不同时占横向空间，改为一致。
6. **收尾时未取消排队的那一帧**（minor，既有）：它若在 `endResize` 之后执行，会把已清零的锚点当成「第一次移动」，面板永远停在「拖拽中」。`stopResize` 里补 `cancelAnimationFrame`。
7. **状态面板头部与参照不一致**（minor）：标题改 14px/400/`--gray-500`、去掉下边框，刷新钮默认 `opacity: 0` + `pointer-events: none`，悬停面板、焦点进入或自身获得键盘焦点时才露出（触屏 `@media (hover: none)` 常显）。
8. **面包屑首段重复**（minor）：作用域名原来跳到第一段那个目录，与第一段同目标。改为回到作用域根（清掉选中）。
9. **死表面**（minor）：`panel.toggleStatePanel` 没有消费者、`SECTION_ICONS.state` 与 `Gauge` 导入、`.stateListItemIcon` 三处删掉。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 作用域用 Segmented 且切换生效 | 换控件后切不动 | `chat-side-panel.tsx` | 真实页面点「个人空间」后树加载出真实目录；`data-mode` 无关，改为看 `aria-selected` 的 `radiogroup` | — | Passed |
| 搜索换成组合框 | 候选选不中 | 同 | 真实页面渲染出 `.ant-select` 组合框（`role="combobox"` + `aria-expanded`） | 原来的 `ul/li` 没有 listbox 语义（改动前即此形态） | 部分：**「选中即打开预览」这条路径没有验证**——页面用例的 `fileSearchResults` 是空数组，真实页面也没走通 |
| 文件树换 antd Tree 后行为不变 | 展开/选中/动作回归 | `file-tree.tsx` | `file-tree.test.tsx` 9 例（加载/错误/空态/选中态/点文件/点目录/动作/禁用） | 点 `treeitem`（含缩进）不触发选中，用例因此点内容区 | Passed |
| 选中态可被读屏感知 | 只有视觉高亮 | 同 | `file-tree.test.tsx` 断言 `aria-selected="true"`；真实页面该属性存在 | 不显式给 `aria-selected` 时该属性为 null（rc-tree 只在 `selectable` 显式时渲染，且语义不对） | Passed |
| 面包屑显示选中项路径且可回到上层 | 点一段没反应或跳错层 | `lib/panel-tree.ts` / `chat-page.tsx` | `panel-tree.test.ts` 3 例（文件路径/目录路径/根）；真实页面显示「个人空间 / agents」 | 根与空路径返回空数组，面包屑不渲染 | Passed |
| 删除按钮 hover 用有效 token | hover 无颜色变化 | `file-tree.module.css` | 真实页面样式表里该规则解析出 `--color-error-500` | `--color-error-600` 不存在，`var()` 失败即 `unset`（改动前即此形态） | Passed |
| 面包屑用 antd Breadcrumb 且无灰底 | 原生 button 露出默认灰底 | `chat-side-panel.tsx` | 真实页面：`.ant-breadcrumb-link` 是 `SPAN`；整页扫描 `background-color === rgb(239,239,239)` 的按钮数为 **0** | 用原生 button 且不声明背景时该计数为 2（本次复现） | Passed |
| 面板内容不重复渲染 | 分区内容渲染两份 | 同 | 真实页面计数：`.ant-segmented` = 1、`.ant-select` = 1、`.ant-tree` = 1 | 编辑切片切错位置时曾渲染成两份（本次复现并修掉） | Passed |
| 拖拽锚点是面板宽度而不是内容行宽度 | 一抓住就跳到上限、之后只相对鼠标偏移 | `panel-sections-store.ts` / `panel-width.ts` | `panel-sections-store.test.tsx` 2 例（第一次移动宽度不变、再拖 100px 恰好 ±100；量不到宽度时不改宽度）；真实页面向右拖 100px：605 → 565，与送达的指针位移 1:1，且**没有**先跳到上限 | 把锚点换回 `rowRef.current.offsetWidth` 时该用例第一次移动即变成 850（本次复现） | Passed |
| 单击把手不改宽度、拖动仍有效 | 单击让宽度跳到点击位置 | `agent-panel.tsx` | 真实页面：单击把手前后宽度 605 → **605**；向左拖 120px 后 605 → **860** | 去掉阈值时单击即改宽度（本次复现过） | Passed |
| 行序为作用域 / 搜索 / 面包屑 | 次序不对 | `chat-side-panel.tsx` | 真实页面截图：Segmented 在最上、搜索次之、面包屑贴着树 | — | Passed |
| 把手是整高虚线分界 | 仍是 32px 实心条 | `agent-panel.module.css` | 真实页面读计算样式：`border-left: dashed 1px rgb(228,230,230)`（`--gray-200`）、元素高 780px 覆盖面板整高 | — | Passed |
| 浮动状态面板定位正确 | 浮卡落到聊天列中间 | `chat-page-view.tsx` | 容器不够宽（1000px）时 `data-mode` 为 `floating`；面板关着时 `--file-panel-width` 为 `0px` | 变量取比例宽度时浮卡会偏到列中间（Review 复现） | Passed |
| 状态面板里的文件会打开文件面板 | 点了没有可见变化 | `chat-page.tsx` | `chat-page.test.tsx`「点状态面板里的文件会把文件面板打开」 | 只 `openSection` 不 `setOpen` 时面板不出现（Review 复现） | Passed |
| 状态按钮的展开态跟着状态面板 | 报告的是文件面板 | `chat-page-view.tsx` | `chat-page.test.tsx`「状态按钮的高亮与展开态跟着状态面板，而不是文件面板」 | 用 `sidePanel.open` 时开状态面板而文件面板关着会报 false（Review 复现） | Passed |
| 打开文件面板收起状态面板 | 两块面板同时占位 | `chat-page.tsx` | `chat-page.test.tsx`「打开文件面板会收起状态面板」 | — | Passed |
| 键盘展开能把新键交回调用方 | 受控模式下 ←/→ 空操作 | `file-tree.tsx` | `file-tree.test.tsx`「键盘 → 展开目录时把新的展开键交回调用方」 | 不接 `onExpand` 时受控展开态不会被改写（Review 复现） | Passed |
| 旧能力不存在： 自绘的 `role="tablist"` 作用域、原生输入框 + `ul/li` 候选、递归 `ul role="tree"`、自绘 `<nav>` 面包屑已删除 | 半套体系共存 | 本记录 | `chat-side-panel.tsx` 已无 `role="tab"`/`<ul>` 候选；`file-tree.tsx` 无 `role="treeitem"` 手写 | — | Passed |
| 重新引入条件： 仅当需要与参照的纯文字 tab 完全同形时，才把作用域换回原生 tab 并自行补方向键 | 无条件回归 | 本记录 | — | — | — |

## 风险

- `Segmented` 是 radio 语义，`Tree` 的选中态用 `aria-selected`：同一个面板里两种选中语义并存（作用域是 radio、节点是 treeitem），读屏用户的播报会比原来更"杂"。这是选用 antd 词汇的固有代价。
- antd Tree 的虚拟滚动（`virtual` + `height`）没有启用：它需要给树一个确定的高度，而面板的高度是 flex 撑出来的。大目录下仍是全量渲染，与替换前一致。
- 面包屑的祖先展开是就地并集，不做「收起其它分支」：用户点深层的面包屑时，之前展开的其它分支仍留着。

## 证据

- `pnpm run check-types`、`pnpm run lint:check`（22 warnings / 0 errors；比改动前少 2 条，因为删掉了自绘控件）、`pnpm run check:tokens`、`pnpm run lint:fsd`、`pnpm run arch:check`、`pnpm run format:check`、`pnpm run build` 全部通过。
- `pnpm run test:unit`：188 文件 / 2155 例全过（本批开始前 187 / 2138）。
- 真实页面（`127.0.0.1:5173`）：文件面板截图确认 AutoComplete + 刷新钮、Segmented 的两个作用域、antd Tree 渲染真实个人空间目录（agents / skills / AGENTS.md / MEMORY.md / USER.md / projects）以及选中行的底色；点 `agents` 后面包屑显示「个人空间 / agents」。
- rc-tree 的 `aria-selected` 行为来自 `rc-tree@5.13.1` 的 `es/TreeNode.js` 源码读取（`aria-selected: !!selectable` 挂在 `role="treeitem"` 的节点上），不是猜测。

## 已知未验证范围

- 键盘导航（Segmented 的 ←/→、Tree 的 ↑↓←→/Home/End）未在真实浏览器里逐个按键走查；只依赖组件实现与单元用例的点击路径。
- 深色模式下三个 antd 控件与 `.ant-tree-*` 局部覆盖的表现未核对。
- 面包屑在超长路径下的换行与截断未逐档走查（只做了 `max-w-[10rem]` + truncate）。
- 移动端（768 断点以下）面板覆盖式布局下三处控件的表现未走查。
