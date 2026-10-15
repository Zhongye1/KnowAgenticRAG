# 对话页右侧面板覆盖整高，页头让位与拖拽冻结回到参照的层级

状态：implemented
类型：feature
Owner：web/src/pages/chat/ui/chat-page-view.tsx

事实分工：本记录拥有**文件面板在 `.chat` 下的层级位置**（决定它覆盖整高还是只覆盖内容行）、**拖拽期间的过渡冻结范围**，以及**页头入口按钮的图标**。`web/src/pages/chat/ui/chat-page.module.css` 拥有 `.sidePanel` / `.chatResizing` 的具体声明；`web/src/features/chat/model/panel-sections-store.ts` 拥有拖拽宽度与收尾的比例回写；`web/src/features/chat/model/panel-preview.ts` 拥有按分区取预览内容；`web/src/features/chat/ui/agent-panel.module.css` 拥有分区 tab 的底色与分隔线；`web/src/features/chat/ui/file-preview.tsx` 拥有预览区自身的内边距。

## 问题

1. **面板不是整高**。文件面板挂在内容行（`.contentRow`）里，而内容行在页头之下：面板的 `top: 0; bottom: 0` 因此只覆盖内容行（780px），页头那一行（40px）横跨到右缘，底边线一直画到面板底下。参照的层级不同——`.side-panel--file` 是 `.chat` 的直接子级（与 `.chat-header`、`.chat-content-container` 并列），覆盖的是 `.chat` 的整高。
2. **拖拽时页头按钮滞后**。冻结过渡的类挂在内容行上（`.contentRowResizing`），而页头是内容行的**兄弟**：`.contentRowResizing .chatHeader` 匹配不到任何元素，`.contentRowResizing .chat` 同理（`.chat` 是它的父级）。参照把 `is-resizing-file-panel` 挂在 `.chat` 上，`.chat-header` 与 `.chat-main` 都是它的子级，因此都吃得到 `transition: none`。本仓少冻结了页头的 `padding-right`（0.3s），于是拖拽中面板跟手、页头按钮按 0.3s 慢慢追。
3. **松手后还会挪一步**。收尾把拖拽像素回写成持久比例时读的是 state（`dragWidth`），而收尾与最后一次 `onResize` 常落在同一批更新里，读到的其实是**上一帧**的宽度：比例比最后一帧差一步，面板松手后自己再动一段，页头按钮随之落后。参照的 `handleResizingChange(false)` 读的是 `filePanelDragWidth.value`（Vue 的 ref 天然取最新值），移植成 React state 后语义变了。
4. **预览分区串内容**。各文件分区都取 `panelPreview.current`（最后打开的那一个），同时开两个文件分区时切 tab 显示的还是同一个文件。
5. **入口按钮只有「调试」带图标**，「文件 / 状态」是纯文字。

## 决策

1. **文件面板移出内容行，成为 `.chat` 的直接子级**（紧跟内容行之后），与参照同层。它的 `top: 0; bottom: 0` 于是相对 `.chat`，覆盖整高（含页头那一行）；页头继续靠 `padding-right: calc(var(--file-panel-width) + 8px)` 让位，三颗按钮停在分栏虚线左侧 8px。面板 `z-index: 30` 高于页头 `10`，页头那一段底边线被面板自身的不透明底盖住——顶栏视觉上只属于左侧。
2. **拖拽冻结类改挂 `.chat`**（`styles.chatResizing`），CSS 改为 `.chatResizing .chatHeader, .chatResizing .chatMain { transition: none }`，并删掉匹配不到任何元素的 `.contentRowResizing` 两条规则。
3. **拖拽宽度另存一份 ref**（`dragWidthRef`），收尾回写比例读 ref 而不是 state，回到参照「用最后一次真正应用的宽度」的语义。
4. **分区带 `scope`，`previewFor({ scope, path })` 按分区取内容**；页面按当前激活分区取预览文件，`current` 只留给没有分区上下文的地方。
5. **「文件」用 `Folders`、「状态」用 `ListCollapse`**（与参照 `.agent-state-btn` / `.file-entry-btn` 同图标），14px 与既有「调试」的 `Bug` 同尺寸。
6. **面板内的三处细节**：分区 tab 的激活底色改 `--gray-200` 并挂在外层包装上（挂在按钮上会被 `.sectionTabMain` 的 `background: transparent` 盖掉），相邻 tab 之间加 1px 分隔线，没有关闭钮的常驻分区在右侧补 7px（否则激活底色贴着文字）；预览区根节点加 4px 内边距。

## 替代方案

- **面板留在内容行里，只遮住页头右段**（给页头补背景或 `clip-path`）：能凑出「顶栏只到分栏」的外观，但面板依旧不是整高，分栏虚线也只能从页头下方开始——与参照的实际层级不符。
- **把 `.chat` 塞进内容行**：要改整页骨架与 `--file-panel-width` 的作用域，收益与上一项相同。
- **只把页头的 `padding-right` 过渡时长对齐面板的 0.24s**：能减轻松手后的错位，但拖拽中仍整体滞后；跟手来自冻结，不是来自时长。
- **面板宽度只留像素、不做比例回写**：会丢掉「容器变宽时面板按比例跟着变」的既有行为。

## 后果

- 面板覆盖页头那一行：面板自己的头部（分区 tab 与折叠/最大化/关闭）就在页面最顶端，与参照一致。最大化时面板盖住整页（含页头三颗按钮），退出最大化走面板自己的还原钮。
- 页头的 `padding-right` 过渡只在开合面板时生效；拖拽期间被 `.chatResizing` 冻结，按钮与虚线逐帧同位置。
- 收尾回写用 ref 后，松手时的持久比例等于最后一帧的像素宽，面板不会再自己挪一步。
- 状态面板（`.statePanel`）仍在内容行内，它的停靠/浮动与对 `--file-panel-width` 的引用不变。

## 验证

- **结构**：`web/test/unit/pages/chat-page.test.tsx` 新增用例断言面板外壳与页头同级、位于页头之后、且其父级正是定义 `--file-panel-width` 的那个元素。负向：把视图回退到改动前的层级，该用例失败（`expected <div …>…(2)</div> to be <div …>…(2)</div>`）。
- **回写**：`web/test/unit/features/chat/panel-sections-store.test.tsx` 新增用例断言同一批里连拖两下再收尾后宽度等于最后一下（700）。负向：把 store 回退成读 state，用例失败（`expected 600 to be 700`）。
- **真实页面**（Chromium 1440×820，`http://127.0.0.1:5173`）：面板 `y=0 h=820`、拖拽把手 `y=0 h=820`；页头 `padding-right=613px`（= 605 + 8），三颗按钮右缘 827 = 虚线 835 − 8。拖拽逐帧采样（20ms 一次）：冻结生效时按钮与虚线间距恒为 8px（滞后 0，松手后仍为 0）；用一条 `!important` 规则模拟未冻结时，滞后最大 90px，松手后约 300ms 才追平。
- **命令**：`vitest run`（188 文件 / 2160 用例通过）、`tsc --project tsconfig.json --noEmit`、`oxlint src`（22 warning / 0 error）、`prettier --check .`、`node scripts/check-design-tokens.mjs`、`steiger ./src`、`depcruise`、`vite build` 均通过。
