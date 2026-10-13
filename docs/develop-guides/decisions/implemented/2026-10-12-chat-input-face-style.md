# 对话页的输入面样式（阶段二 B3）

状态：implemented
类型：feature
Owner：web/src/features/chat/ui/mention-editor.module.css

事实分工：本批新增 `web/src/features/chat/ui/mention-editor.module.css`（提及编辑器与候选弹窗）与 `web/src/features/chat/ui/input-selector.module.css`（输入区四个选择器与附件弹窗共用一份）；`mention-editor.tsx`、`mention-popup.tsx`、`agent-selector.tsx`、`tool-approval-mode-selector.tsx`、`model-selector.tsx`、`project-selector.tsx`、`attachment-upload.tsx` 七个文件的呈现层类从 Tailwind 换成模块类。

## 问题

输入面七个文件仍是 Tailwind + 语义 token 类。参照侧 `MessageInputComponent.vue` 的 `.user-input` / `.mention-popup` 段（462 行样式）定义了编辑器与弹窗的既定形态：15px/1.5 行高的透明编辑器、`::empty::before` 占位符、带阴影的分组弹窗。

## 决策

1. **编辑器对齐 `.user-input.mention-editor`**：透明底、无内边距的文本层、15px/1.5、占位符走 `:empty::before` + `attr(data-placeholder)`（与参照同一机制，而不是 Tailwind 的 `empty:` 变体）；禁用态 `cursor: not-allowed`。拖放高亮从 `ring-1` 换成 `outline: 1px solid var(--main-color)`。
2. **候选弹窗对齐 `.mention-popup`**：`--gray-0` 底、8px 圆角、双段阴影（本仓收敛为 `0 0 16px var(--shadow-2)`，颜色取自 yuxi-tokens 的阴影令牌，`check:tokens` 才能过）、分组标题带下边线、候选条目 6/10 内边距 + 4px 圆角 + 悬停高亮。
3. **选择器共用一份模块**：agent / tool-approval / model 三个触发按钮同构（`--gray-200` 边框、12px、图标 + 省略标签），共享 `.trigger` 系；project 的下拉列表与 attachment 的条目列表是另外两段。审批模式的警告态用 `--second-600`（yuxi 的辅助金色系），参照的语义是「宽松模式需要引起注意」。
4. **错误提示统一 `.optionError`**（`--color-error-500`）：项目选择三处、附件条目两处、上传失败一处。

## 替代方案

**每个选择器一份独立模块**：三个触发按钮的样式逐值相同，拆三份会漂移；共用一份让「触发按钮长什么样」只有一个答案。

**弹窗阴影硬编码 rgba**：被 `check-design-tokens.mjs` 拒绝（这是该门禁的正确行为）；改用 `--shadow-2` 颜色令牌后视觉略浅于参照的双段阴影——参照用的是 `--gray-0` 底上的浮层阴影，本仓令牌体系里最接近的是单段 16px。

## 后果

- 输入面七个文件语义 token 类清零；`--gray-*` / `--main-*` / `--second-*` / `--color-error-*` / `--shadow-*` 五类令牌。
- 弹窗阴影是单段（`--shadow-2` = rgba(0,0,0,0.08)），比参照的双段柔和；阶段二收口时如需逐像素对齐再评估。
- 候选弹窗的分组结构与 ARIA（listbox/option）不变，测试选择器全保留。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 七文件语义 token 类清零 | B6 收口漏拆 | 七个 tsx | `grep` 计数全为 0 | — | Passed |
| 弹窗阴影走令牌 | 门禁拒绝硬编码颜色 | `mention-editor.module.css` | `check:tokens` 通过 | — | Passed |
| 编辑器占位符机制与 aria 不变 | 提及编辑交互回归 | `mention-editor.tsx` | `mention-editor-component.test.tsx`、`mention-popup.test.tsx` 全过（184 文件 / 2095 例） | — | Passed |
| 旧能力不存在： 七个文件的呈现层 Tailwind 类已删除，样式只有两份模块一个来源 | 半套体系在 B5/B6 爆炸 | 本记录 | 上述 grep | — | Passed |
| 重新引入条件： 仅当 antd 组件自带样式无法承载某条视觉（B5）时按组件粒度回退并记录 | 无条件回归 | 本记录 | — | — | Passed |

## 风险

- `contenteditable` 的 `:empty::before` 占位符在浏览器粘贴空段落（`<br>`）时可能不显示；参照同机制，同病。
- 单段阴影视觉偏浅；真实弹窗打开时的对照截图要等有候选数据（B7 补）。

## 证据

- 全量门禁：`oxlint src test` 0 errors（539 文件）、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`vitest run`（184 文件 / 2095 例全过）、`vite build` 通过。
- 真实页面：headless Chrome 截图 `evidence/b3-light-1440x900.png`。

## 已知未验证范围

- 候选弹窗打开态、附件弹窗打开态、项目下拉打开态的真实截图未做（需要交互）；B7 走查归档。
- `contenteditable` 的真实光标与输入法组合依旧只能真实页面验证。
