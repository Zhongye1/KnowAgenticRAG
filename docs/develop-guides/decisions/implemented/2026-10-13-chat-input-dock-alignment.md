# 对话页的布局结构对齐（输入停靠与输入面板形态）

状态：implemented
类型：feature
Owner：web/src/pages/chat/ui/chat-page.module.css

事实分工：本批扩展 `chat-page.module.css`（`.inputDock` sticky 停靠、`.inputPanel` grid 四区、`.greeting` 空态问候、`.bottomActions` 底部提示）并重排 `chat-page.tsx` 的 JSX 结构；MessageList、AgentPanel、各选择器的内部实现不变。

## 问题

与参照截图对照后发现四处结构性差异（逐块核对 `.chat-container` → header / content-container / chat-main / bottom 的模板与样式得出）：

1. **输入区没有停靠**：参照的 `.bottom` 是 `position: sticky; bottom: 0`——长对话滚动时输入框始终贴底可见；本仓的 form 在滚动列外静态放置，消息一长就滚出视口。
2. **输入区形态不同**：参照是 `.input-box` 大胶囊容器（1.4rem 圆角、`--gray-0` 底、边框阴影、grid 四区：top/编辑/选项/发送），本仓是一行裸控件平铺。
3. **空态没有问候语**：参照在输入框上方有随机标语（`chat-greeting-input`，7vh 下边距）。
4. **没有底部提示**：参照有「请注意辨别内容的可靠性」提示行。

## 决策

1. **输入停靠区移进 `chatMain` 滚动流**：dock 作为 chatBox 的兄弟节点放在滚动列内，`sticky bottom-0` + 渐变白底（`linear-gradient(transparent, var(--gray-0) 10%)`）——与参照同构，而不是 `position: fixed` 的浮层方案。
2. **form 换 grid 四区**：`inputOptions`（左下：智能体/审批/用量环/模型/引导/附件/图片按钮）、编辑区（中）、`inputSend`（右下：发送/停止）。参照的 `.expand-options` 是「+」号展开面板，本仓的选项直接平铺——能力等价，交互形态的进一步对齐（收进「+」面板）登记为后续项。
3. **空态问候语对齐参照**：五条语析标语随机取一条，仅在无消息且无流式输出时渲染。
4. **底部提示只保留可靠性半句**：参照是「当前智能体：X；请注意辨别内容的可靠性」——智能体名本仓已由触发按钮展示（AgentSelector），不重复。
5. **top 区预留**：`.inputTop` 的 grid 区已建（图片预览与附件堆叠的目标位置），当前 form 内没有可放入的元素——`ImageAttachmentPreview` 与附件确认流程仍走页面级弹窗，迁入 top 区归后续（行为不变，纯位置）。

## 替代方案

**fixed 浮层输入框**：视觉上也能「始终贴底」，但滚动内容会被输入框遮挡且需要手工算 padding；sticky 是文档流内的方案，参照同款。

**输入控件保持一行平铺、只加圆角容器**：选项按钮放不进容器（它们在参照里是容器内部的左下区），一行形态与参照的「大输入面板」差异依旧明显。

## 后果

- 长对话滚动时输入面板始终可见；面板内选项按钮与发送按钮的可用性随 `canSend` / `isStreaming` 的既有逻辑不变。
- 空态页面：问候语 + 输入面板（无对话内容），与参照的开屏结构一致。
- `AgentPanel` 保持在 `contentRow` 内、`chatMain` 之后（本批重组中曾错误地移到外面，已修正）。
- JSX 深度经脚本核算为 0；TSC/vitest 全过。
- 过程记录：一次大规模重排脚本因块边界取错导致 JSX 结构损坏，回滚后改为「dock 移入 → form 重排 → 嵌套修正」三步小步提交式编辑，每步 tsc 验证。

## 旧能力不存在

form 的 `flex items-center gap-2` 一行布局类、页面级静态输入区（无停靠）已删除；输入区的样式只有 `chat-page.module.css` 一个来源。

## 重新引入条件

仅当 sticky 方案在真实浏览器出现层叠上下文问题（如面板 z-index 冲突）时评估 fixed 方案并记录；当前 z-index 1000 与参照同值。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| dock 在 chatMain 滚动流内 sticky 贴底 | 长对话时输入框滚走 | `chat-page.module.css` | 截图 `evidence/b7-layout-refactor-light-1440x900.png`；JSX 深度核算 0 | — | Passed |
| 输入面板 grid 四区（选项/编辑/发送分离） | 控件挤回一行 | 同 | tsc 通过 + 截图 | — | Passed |
| 空态问候语随机展示 | 空态只有「暂无消息」 | `chat-page.tsx` | 截图（GREETINGS 五选一） | — | Passed |
| AgentPanel 在 contentRow 内 chatMain 之后 | 面板脱离双栏布局 | `chat-page.tsx` | JSX 深度核算 + AgentPanel 位置断言（人工核对行号） | 曾错误移出（本次复现并修正） | Passed |
| 交互行为不变（发送/停止/引导/附件/图片/审批/模型/项目） | 重排破坏回调 | `chat-page.tsx` | 全量 2095 例（page 61 例覆盖发送与建线程链路） | — | Passed |
| 旧能力不存在： 一行平铺的 form 布局类与静态输入区已删除 | 半套布局共存 | 本记录 | form 无 `flex items-center gap-2` | — | Passed |
| 重新引入条件： 仅当 sticky 出现层叠上下文问题时评估 fixed 并记录 | 无条件回归 | 本记录 | — | — | Passed |

## 风险

- sticky 在 contentRow 有 `overflow` 祖先时失效——当前 contentRow 是 `overflow: hidden`、滚动在 chatMain 上，sticky 相对 chatMain 生效；若未来把滚动上移需重验。
- 引导/附件/图片三个按钮进了面板选项区后，窄屏（390px）下可能换行挤压编辑区；`.inputPanel` 用 grid 而非 flex，行为是选项区换行、编辑区保持全宽——真实窄屏截图已归档核对。
- 参照的「+」展开面板未做：选项平铺在窄屏的可用性待真实走查确认。

## 证据

- 全量门禁：`oxlint src test` 0 errors、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`vitest run`（184 文件 / 2095 例全过）、`vite build` 通过；根 `verify_engineering_contracts.py` 通过。
- 真实页面：`evidence/b7-layout-refactor-light-1440x900.png` 与 `b7-layout-refactor-narrow-390x844.png`。
- 逐块核对的参照源码坐标：`.bottom`（`AgentChatComponent.vue:4195`）、`.input-box`（`MessageInputComponent.vue:1346`）、`.chat-greeting-input`（161）、`.bottom-actions`（323）。

## 已知未验证范围

- 长对话（多屏滚动）下的 sticky 行为未用真实数据验证；空态截图不含滚动。
- 「+」展开面板的交互对齐（把选项按钮收进面板）未做，登记为后续项。
- ImageAttachmentPreview / 附件确认迁入面板 top 区未做（行为不变，纯位置），登记为后续项。
