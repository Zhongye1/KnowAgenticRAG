# 样式还原一：对话页向 Yuxi 参照逐值对齐（R1 批次）

状态：implemented
类型：bug-fix
Owner：web/src/pages/chat/ui/chat-page.module.css

事实分工：呈现层样式与 JSX 结构由本批次六个提交（`942356c`…`903eb1a`）承载，Owner 是对话页样式与页面组件（`web/src/pages/chat`、`web/src/features/chat/ui`、`web/src/styles`）；走查证据归档在本地台账 `web/alembic/`（被 gitignore，不入库，见 `web/alembic/pages/agent/evidence/`），台账契约见 `web/alembic/pages/agent/contracts.md`。

日期：2026-10-13 ｜ 范围：`web/src/pages/chat`、`web/src/features/chat`、`web/src/shared`、`web/src/styles`

## 问题

alembic 台账在阶段二（B1–B7）宣布「样式复刻完成」后，按「样式完全一致」目标做逐代码评审（对照 Yuxi `AgentChatComponent.vue` 等参照，四个面向并行），发现约 168 处差异：包括 6 处装配级错误（页面高度链断裂、编辑区 grid-area 缺失、空态不居中、面板非 absolute 覆盖、工具行卡片形态、markdown 零排版）、十余处整组形态不符（发送区、antd 下拉皮肤、动作条、状态分区、调试面板、全局搜索、附件弹窗等）与百余处逐值偏差。B1–B7 的验收口径（换 CSS Modules + 令牌清零 + 控件换 antd）没有逐值 diff 环节，「结构对齐、几何走样」系统性通过了验收。

## 决策

按 P0（装配级）→ P1（整组形态）→ P2（逐值）分六个批次重做，每批跑全量门禁并真实页面走查，跳过「样式完全一致」验收口径下不再成立的 B 批次结论：

1. `942356c` 收口此前暂存的布局重构批次（Reviewer 指出三处必须修复：tokens 实败、发送冷却吞 409 重发、sync effect 依赖）。
2. `aeab464` 骨架：ContentLayout `fullHeight` 档贯通高度链、页头移出滚动容器、面板 absolute 全高覆盖、宽度改容器比例（0.25–0.75）、空态 start-screen 居中、审批卡 grid 同格叠放、QueueBar 与底部提示入停靠区、1024/768 响应式。
3. `c6b7306` 输入面：32px 圆形主色发送钮（发送/暂停双态）、编辑区 grid-area: input、提及芯片完整形态（主色+图标+截断）、提及弹窗参照皮肤（hover main-10/active gray-50、金橘命中高亮）、三个选择器对齐 `.input-action-btn` 并向上弹、antd 下拉弹出层皮肤落 `antd-overrides.css`（`.chat-dropdown-overlay`）。新增 `shared/lib/file-icon`（参照 23 个彩色 SVG 原样复制 + 扩展名映射）。
4. `2e3a21d` 消息面：`styles/markdown-preview.css` 承接 `.yk-markdown-preview` 全段、气泡/附件卡/系统消息/错误条对齐、工具行切 timeline 形态（无边框、border-left 详情、单状态图标、2s 旋转）、工具组 grid-rows 动画、动作条 chip 化、生成中状态条（6px 主色渐变圆点 + 呼吸文案）。
5. `f2100cb` 面板内容：文件树彩色类型图标 + 32px 行 + 24px 动作钮、状态分区卡片化（空心圆环待办指示器、24px 子智能体头像框、grid-rows 折叠动画）、文件预览 32px 灰底头部 + 等宽正文、子线程 800px 居中。
6. `6cf6d11` + `903eb1a` 弹窗类：调试面板贴边行式、全局搜索 680px + 白 blur 遮罩 + 62px 输入行、附件弹窗 dragger 拖拽区 + 卡片条目、项目选择器改 300px 向上面板（Dialog 移除）。

## 替代方案

- **只修 P0 逐条**：评审清单上 P1 的整组形态（发送钮、下拉皮肤）用户一眼可辨，逐条修会让「完全一致」目标长期不达成；按面整批重做成本更低。
- **保持 antd 组件 + 覆盖层**：下拉弹出层皮肤走全局 `.chat-dropdown-overlay` 而不是弃用 antd——适配层已收口词汇，弃用等于回退 B5 的决定。

## 后果

- 对话页向参照的视觉差异从评审的约 168 项收敛到已知的少量声明偏离（模型名省略、重新生成条件渲染、点踩用 Dialog 替代 Modal 等，见 alembic contracts.md）。
- `check-design-tokens` 的硬编码校验沿用：参照的金橘命中色 `#fa8c16` 收编为 `--query-match-color` 变量。
- jsdom 测试基建补齐（Element.scrollTo、双参 getComputedStyle），unhandled rejection 从 118 降到基线 1。
- 遗留：`thread-title.ts → sdk.gen.ts` 的依赖边界违规在基线即存在（阶段 0 引入），独立批次处理；18 界面状态矩阵的流式中/审批中断等状态仍需真实模型会话走查。

## 验证

- 每批提交前：oxlint 0 错、tsc、vitest 2105 例、vite build、check:tokens、steiger、`git diff --check`。
- 真实页面走查（Chrome 157 headless，zwj 会话）：空态居中、页头固定、面板覆盖、发送钮、芯片插入、@ 弹窗高亮、彩色文件树、状态卡片、全局搜索弹窗、附件拖拽区、项目下拉，证据见 `evidence/r1-*.png`（浅色空态/会话、暗色、窄屏四张）。
- 阶段 0 批次经不继承开发上下文的 Reviewer Agent 审查，3 条必须修复项全部处理后提交。
