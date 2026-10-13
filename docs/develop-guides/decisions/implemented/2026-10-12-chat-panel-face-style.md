# 对话页的面板面样式（阶段二 B4）

状态：implemented
类型：feature
Owner：web/src/features/chat/ui/agent-panel.module.css

事实分工：本批新增 `web/src/features/chat/ui/agent-panel.module.css`（面板外壳，对齐参照 `AgentPanel.vue` 的 `.panel-header` / `.section-tab`）与 `web/src/features/chat/ui/panel-sections.module.css`（文件预览、状态分区、生成中状态条、子线程视图共用一份，对齐 `AgentFilePreview.vue` 的头部与状态分区骨架）、`web/src/features/chat/ui/file-tree.module.css`（对齐 `FileTreeComponent.vue`）；`agent-panel.tsx`、`file-tree.tsx`、`file-preview.tsx`、`state-panel.tsx`、`generating-status.tsx`、`subagent-thread-view.tsx` 六个文件的呈现层类换模块类。

## 问题

面板面六个文件仍是 Tailwind + 语义 token 类。参照侧：面板头 `--gray-25` 底 + 40px 最小高、分区 tab 悬停变 `--gray-100`、动作按钮 28px 方块；文件树节点 13px、文件夹图标 `--main-500`、动作区悬停展开——这些形态在阶段一都是 Tailwind 近似。

## 决策

1. **面板外壳对齐 `.panel-header`**：`--gray-25` 底、`--gray-100` 下边线、40px 最小高；分区 tab 走 `--gray-*`（激活 `--gray-100` 底 + `--gray-900` 字），动作按钮 28px 方块、悬停变色、focus-visible 主色描边（照搬参照）。
2. **文件树对齐 `FileTreeComponent`**：节点 13px / 2rem 行高、文件夹图标 `--main-500`、名称尾部（省略段）`--gray-400`、动作区默认隐藏 + 悬停展开（`&:hover .nodeActions`，替代 Tailwind 的 `group-hover`）。
3. **预览头与状态分区共用 `panel-sections.module.css`**：两者都是面板内的一块骨架（头行 + 可折叠段 + 列表），拆两份会让「面板内的一行/一段」有两种写法。生成中状态条与子线程空态也落在这一份。
4. **状态点与状态图标走语义类**：`.dotRunning` / `.statusIconRunning` 用 1.5s 脉冲动画（对齐参照的 spin/pulse 形态），`--main-*` 主色系；未知/失败走 `--color-error-500`。

## 替代方案

**只换 agent-panel、树与预览留给 B5**：面板是本页唯一有「外壳 + 分区」结构的面，拆开做没有独立的可验证状态。

**工具行组、结果渲染器一并做**：它们在消息面（B2 已做外壳），渲染器内部是 antd 替换的领地（B5）。

## 后果

- 面板面六个文件语义 token 类清零；`--gray-*` / `--main-*` / `--color-error-*` 三类令牌。
- 面板头与参照同构：`--gray-25` 底色在本仓的 yuxi-tokens 里有定义（浅色 `#fcfefe` 近白），暗色走同段暗色定义。
- 全部 `data-testid`、`aria-*` 与测试选择器保留。
- 测试基建：`message-actions.test.tsx` 补了 `vi.setSystemTime` 冻结时钟——「昨天/今天」分档跟着真实时钟走，跨午夜跑测试会把 09:00 断言成「昨天 09:00」。这是测试自身的时区缺陷，本批顺带修复。

## 旧能力不存在

面板外壳、文件树节点、预览头、状态分区四处的 Tailwind 呈现层类已删除；这些形态的样式只有三份模块一个来源，`grep` 计数为零。

## 重新引入条件

仅当 B5 的 antd 组件（Tree 等）自带样式能整体替代某段时按组件粒度替换并记录；不回退 Tailwind。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 六文件语义 token 类清零 | B6 收口漏拆 | 六个 tsx | `grep` 计数全为 0 | — | Passed |
| 面板 tab 的激活与关闭入口行为不变 | 面板交互回归 | `agent-panel.tsx` | `agent-panel.test.tsx` 全过 | — | Passed |
| 树的悬停动作区与节点点击不变 | 树交互回归 | `file-tree.tsx` | `file-tree.test.tsx` 9 例全过 | — | Passed |
| 时间分档测试与时钟解耦 | 跨午夜跑测试随机挂 | `message-actions.test.tsx` | 冻结时钟后 10 例全过 | 不冻结时跨午夜必挂（已在本次复现） | Passed |
| 旧能力不存在： 面板面六文件的 Tailwind 呈现层类已删除 | 半套体系在 B5/B6 爆炸 | 本记录 | 上述 grep | — | Passed |
| 重新引入条件： 仅当 B5 的 antd 组件自带样式能整体替代某段时按组件粒度替换并记录 | 无条件回归 | 本记录 | — | — | Passed |

## 风险

- `--gray-25` 在暗色段的存在性以 yuxi-tokens 双段并入为准；暗色截图归 B7。
- 节点动作区的显隐从 `group-hover` 换成 CSS 后代选择器，键盘用户仍靠 tab 聚焦按钮（显隐只影响鼠标），行为面不变。

## 证据

- 全量门禁：`oxlint src test` 0 errors（539 文件）、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`vitest run`（184 文件 / 2095 例全过）、`vite build` 通过。
- 真实页面：headless Chrome 截图 `evidence/b4-light-1440x900.png`。

## 已知未验证范围

- 面板打开态（树、预览、状态分区有数据）的真实截图未做；B7 归档。
- 阴影、滚动条等细节与参照的逐像素差异留待 B6 令牌收口。
