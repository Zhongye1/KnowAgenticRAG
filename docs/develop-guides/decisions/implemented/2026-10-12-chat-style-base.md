# 对话页的样式基座（阶段二 B1）

状态：implemented
类型：simplification
Owner：web/src/pages/chat/ui/chat-page.module.css

事实分工：本批新增 `web/src/pages/chat/ui/chat-page.module.css`（页面外层骨架）与 `web/src/features/chat/ui/message-list.module.css`（消息列表骨架）；`pages/chat/ui/chat-page.tsx` 与 `features/chat/ui/message-list.tsx` 的外层容器从 Tailwind 工具类换成这两个模块。消息项、输入区、面板内部的样式不在本批。

## 问题

阶段二按 [migration-standards.md](../../../alembic/migration-standards.md) 要求组件样式走 CSS Modules、颜色走 `yuxi-tokens.css` 的 `--gray-*` / `--main-*`。对话页此前 0 处 CSS Modules，外层骨架（页面容器、消息主列、正文限宽）是 Tailwind 工具类拼的，与参照 `AgentChatComponent.vue` 的 `.chat-container` / `.chat-content-container` / `.chat-main` / `.chat-box` 不同构：参照的正文限宽 800px 居中、滚动在消息主列上，本仓是外层卡片 + 整页滚动。

## 决策

1. **骨架类的值对齐参照**：`.chatBox` 的 `max-width: 800px`、`padding: 1rem 2rem`、横向居中与 `.chat-box` 同值；消息主列 `overflow-y: auto` + 隐藏滚动条（`scrollbar-width: none`）与 `.chat-main` 同值；`contain: layout` 也照搬。
2. **外层卡片壳退场**：原先消息区外面套的 `rounded-large border bg-color-bg-1` 卡片是本仓自创的容器，参照没有；去掉后页面直接是内容区，与参照的平面结构一致。
3. **MessageList 的三处布局类换模块**：列表纵向间距（`gap: 1rem` 对齐参照的轮间距）、空态文案、每轮 `conversation` 容器（`.conv-box`）。消息项内部的 Tailwind 不动——那是 B2 的范围。
4. **颜色只出现在 `--gray-*` 上**（空态与底部提示的 `--gray-500`），浅色与暗色都由 yuxi-tokens 的双段定义承载。

## 替代方案

**整页一次换完**：27 个 `ui/` 文件 4207 行一批改完没有中间可验证状态，B2–B4 分面推进各自可截图对照。

**保留卡片壳只换令牌**：卡片壳是阶段一为 Tailwind 布局做的容器，阶段二的目标形态里没有它；留着它等于每个后续批次都要绕开一层嵌套。

## 后果

- `/agent` 的正文限宽 800px 居中，窄屏下与参照一致地自适应；输入区仍在消息列底部随内容流。
- 面板打开时消息主列由 flex 压缩（`flex: 1 1 0` + `min-width: 0`），不再需要参照的 `margin-right` 布局技巧——本仓面板是 flex 兄弟节点而非浮层。
- 阶段一骨架的 `py-4`、`gap-4`、卡片边距消失；消息调试按钮的位置不变（它挂在消息列顶部）。
- 暗色截图本批未产出：主题切换是交互动作（`toggleTheme` 走 View Transition），headless 单帧截图切不了主题；三套视觉对照归 B7。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 正文限宽 800px 居中 | 宽屏下消息拉满全宽 | `chat-page.module.css` | 截图 `evidence/b1-light-1440x900.png`；`check:tokens` 通过 | — | Passed |
| 滚动在消息主列 | 输入区随内容滚出视口 | 同 | headless DOM：页面可达、`暂无消息` 渲染 | — | Passed |
| 轮间距与空态走模块 | 类名漂移回 Tailwind | `message-list.module.css` | `message-list.test.tsx` 74 例全过（`data-testid` 不受类名迁移影响） | — | Passed |
| 旧能力不存在： 阶段一的卡片容器壳与外层 Tailwind 布局类已删除，消息列表布局类改为模块类，无第二个来源 | 壳回来会把 B2–B4 的每批都绕进一层嵌套 | `chat-page.module.css` | `grep -rn "rounded-large border bg-color-bg-1" src/pages/chat` 无结果 | — | Passed |
| 重新引入条件： 只有阶段二后期证明「消息区需要一个与参照不同的视觉边界」时才回来，且必须用 CSS Modules 实现 | 无条件回归 | 本记录 | — | — | Passed |

## 风险

- 隐藏滚动条让长对话没有滚动位置指示；参照同（`scrollbar-width: none`），接受。
- `chatBox` 的 1rem 纵向 gap 是新增的（阶段一用 `gap-4` 在外层），消息区顶部的调试按钮与生成中状态条现在也在这个限宽列内——与参照的排版一致。

## 证据

- 全量门禁：`oxlint src test` 0 errors（539 文件）、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`vitest run`（184 文件 / 2095 例全过）、`vite build` 通过。
- 真实页面：headless Chrome 在 `http://localhost:5173/agent`（开发栈已起、后端可达），浅色 1440×900 与窄屏 390×844 各一张，存 `pages/agent/evidence/`；DOM 断言页面渲染的是对话页（`智能体对话` / `消息输入` / `暂无消息`）而非登录页。

## 已知未验证范围

- 暗色截图未产出（主题切换是交互动作），三套视觉的完整对照归 B7。
- 有消息时的排版（气泡宽度、工具组、产物卡片在限宽列内的表现）需要真实运行数据；本批只有空态可截。
