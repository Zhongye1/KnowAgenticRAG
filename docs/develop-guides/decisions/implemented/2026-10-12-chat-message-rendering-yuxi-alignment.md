# 对话消息渲染对齐 Yuxi

状态：implemented
类型：feature
Owner：web/src/features/chat/ui/message-item.tsx

事实分工：`web/src/features/chat/lib/message-grouping.ts` 拥有渲染项拆分与中间过程折叠；`web/src/features/chat/lib/message-attachments.ts` 拥有附件展示归一；`web/src/features/chat/lib/clipboard.ts` 归 `web/src/shared/lib/clipboard.ts` 拥有（`shared` 是 `shared/ui/markdown.tsx` 能引用的最低层）；`web/src/features/chat/ui/message-list.tsx` 拥有「哪一条消息算正在处理」的判定；`web/src/shared/ui/markdown.tsx` 拥有代码块复制。

## 问题

对话切片的第一片是消息渲染。参照实现由 `AgentMessageComponent.vue`（720 行）、`ThreadMessageList.vue`（103 行）与 `ConversationProcessGroupComponent.vue`（121 行）承担；本仓对应 `features/chat/ui/message-item.tsx`（145 行）与 `message-list.tsx`（148 行）。

逐条比对后发现：**渲染项拆分与中间过程折叠的逻辑层已经完全等价**（本仓 `message-grouping.ts` 与参照的 `messageGrouping.js` + `conversationProcessGrouping.js` 逐行同构，含 `formatProcessDuration` 四档文案与时长计算）。缺口集中在呈现层，另有两条判定口径不同。

## 决策

**补齐的呈现层**：

- 用户消息加复制按钮：成功把图标换成对勾并保持 2 秒，失败只写 `console.error`、不改按钮状态——按钮上的对勾是「已复制」的唯一凭据。
- 用户消息加附件列表，展示文件名与「类型 · 大小」。归一在 `features/chat/lib/message-attachments.ts`，字段取自后端 `serialize_attachment` 的输出。
- `shared/ui/markdown.tsx` 加**可选**的 `codeCopy`：打开时渲染完成后往每个 `<pre>` 里插一个复制按钮，监听直接挂在按钮上。默认关闭，知识库预览与技能详情等既有调用点不受影响。

**对齐的判定口径**：`message-list.tsx` 的「正在处理」改为按 `conversation.status === 'streaming'` 判定，不再用「是不是最后一个会话」。参照的 `isDisplayMessageProcessing` / `isToolGroupActive` 都要求 `conv.status === 'streaming'`；本仓此前的写法在「流刚起、还没有流式分片」时会把上一条历史消息标成处理中并显示 `Thinking...`。

**空态文案**改成参照的「暂无消息」。

**不搬参照的三处死代码**（逐条给证据）：

| 参照实现 | 为什么不搬 |
|---|---|
| `isReasoningActive = message.status === 'reasoning'` | 全仓没有任何地方把 `status` 设成 `'reasoning'`（消息上的取值是 `running` / `streaming` / `queued`，后端 `Message` 模型只有 `delivery_status`）。这是个恒假条件，参照的「Thinking... + 转圈」分支永远不会显示。本仓用 `isProcessing && !content` 达成同一个意图，保留。 |
| `class="empty-block"` 占位 | `.empty-block` 只出现在模板里，样式段里没有任何规则，是个空标记。 |
| 「重新编辑问题」链接 | 组件 `emit('retryStoppedMessage', ...)`，但全仓没有任何监听者，点了没有任何反应。本仓保留原有的「你停止生成了本次回答」提示，不加死链接。 |

**留到阶段二**：思维链折叠动画（参照的 `CollapseTransition`）与 antd/Yuxi token 的重绘。本仓对话页目前仍是 Tailwind 工具类，按迁移规范「阶段一稳定后再进阶段二」，本片只补行为。

**留到后续切片**：`@` 提及渲染（第 4 片）、`enrichToolCalls` 注入点（第 2 片的注册表）、来源与引用（第 7 片）。

## 替代方案

- **照搬参照的 `status === 'reasoning'`**：会让本仓失去「正文还没到时的 Thinking 提示」，把参照的死条件当成行为契约。
- **照搬「重新编辑问题」链接**：参照里是死控件，搬过来会多一个点了没反应的入口。
- **把 `formatBytes` 从 `features/knowledge-base` 提到 `shared/lib` 复用**：两者格式不同——参照是「两位小数后去尾零」（`2048` → `2 KB`），本仓是固定一位小数（`2.0 KB`），未知值一个是 `-` 一个是 `—`。复用会把两套语义混成一套，因此附件 meta 在 chat 切片内自带格式化。
- **把代码复制做成全局默认**：会让知识库预览、技能详情等调用点一起多出按钮，超出本片范围；改为显式 `codeCopy` 开关。
- **复制失败时弹通知**：本仓其他复制点（知识库列表）会弹通知，参照只写控制台。本片按参照保真，差异记在台账。

## 后果

`shared/ui/markdown.tsx` 多了一个可选 prop 与一段 DOM 注入；注入的按钮不经过 DOMPurify（它是本组件自己创建的静态元素），监听在清理函数里逐个摘除。代码块被高亮拆成多个 span，复制取的是 `<code>` 的 `textContent`。

附件归一自带格式化，与知识库的 `formatBytes` 是两套语义：改其中一处不会影响另一处，这是有意的。

对话页的呈现层仍是 Tailwind 工具类，与参照的 antd 加 CSS Modules 不同构；阶段二统一时本片的样式会再动一次。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 「正在处理」只认流式那一轮 | 流刚起、还没分片时把历史消息标成 `Thinking...` | `web/src/features/chat/ui/message-list.tsx` | `test/unit/features/chat/message-list.test.tsx` 的「流刚起、还没有流式分片时不把历史消息标成处理中」 | 退回按「是否最后一个会话」判定后该用例必须失败（已做变异验证） | Passed |
| 复制按钮的成功反馈只由真实成功驱动 | 剪贴板不可用或写入失败时仍显示「已复制」 | `web/src/features/chat/ui/message-item.tsx` | `test/unit/features/chat/message-item.test.tsx` 的三条复制用例 | 把失败分支也置为已复制后「复制失败时不显示已复制」必须失败（已做变异验证） | Passed |
| 附件归一按后端字段投影并丢掉空壳 | 空记录渲染成名为「附件」的条目 | `web/src/features/chat/lib/message-attachments.ts` | `test/unit/features/chat/message-attachments.test.ts`（15 例）与 `message-item.test.tsx` 的两条附件用例 | 去掉标识过滤后「附件字段缺失的条目被丢掉」必须失败（已做变异验证） | Passed |
| 代码复制是显式开关 | 所有 Markdown 调用点一起多出按钮 | `web/src/shared/ui/markdown.tsx` | `test/unit/shared/markdown-code-copy.test.tsx`（3 例） | 忽略 `codeCopy` 开关后「默认不插复制按钮」必须失败（已做变异验证） | Passed |
| 不回归既有门禁与页面 | 共享 Markdown 的改动波及知识库与技能详情 | `web/src/shared/ui/markdown.tsx` | `pnpm run test:unit`（136 文件 / 1516 例）、`check-types`、`check:tokens`、`lint:fsd`、`arch:check`（328 模块 / 1202 依赖）、`build` | — | Passed |

已知未验证范围：真实浏览器里的复制按钮观感、附件列表版式、代码复制按钮在代码块上的定位（本机没有浏览器）；思维链折叠动画与 antd 重绘留到阶段二。
