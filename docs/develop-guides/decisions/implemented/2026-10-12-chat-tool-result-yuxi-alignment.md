# 对话工具结果渲染对齐 Yuxi

状态：implemented
类型：feature
Owner：web/src/features/chat/lib/tool-header.ts

事实分工：`web/src/features/chat/lib/tool-header.ts` 拥有工具头部的分派与文案；`web/src/features/chat/lib/tool-result.ts` 拥有结果视图的分派；`web/src/features/chat/lib/tool-call.ts` 拥有工具调用的纯逻辑（显示名、隐藏工具、参数与结果解析）；`web/src/features/chat/ui/tool-call-row.tsx` 拥有通用外壳的渲染；`web/src/features/chat/ui/tool-icons.ts` 拥有图标表。

## 问题

对话切片的第 2 片是工具结果渲染。参照实现由 `ToolCallingResult/` 承担：`toolRegistry.js`（209 行）负责纯逻辑，`ToolCallRenderer.vue`（120 行）按工具 id 分派，`BaseToolCall.vue`（482 行）是通用外壳，`tools/*.vue` 是 28 个专用渲染器（共 3625 行）。

本仓 `lib/tool-call.ts` 已经移植了 `toolRegistry.js` 的大部分纯逻辑，`ui/tool-call-row.tsx` 已经是 `BaseToolCall` 的简化版（头部三档文案、参数与结果的默认渲染都对得上），`ui/tool-icons.ts` 的图标表与参照逐条一致。缺的是分派层、专用渲染器，以及若干纯逻辑辅助。

## 决策

**专用渲染器用数据表表达，不写 28 个近似组件。** 参照的 28 个渲染器里绝大多数只是「主文案 + `|` + 关键参数」的头部变体（`ExecuteTool` 42 行、`GlobTool` 38 行、`ListDirectoryTool` 40 行）。本仓用 `buildToolHeader(toolCall, context)` 返回 `{note, segments, hideParams}`，通用外壳只消费它；没有专用头部时返回 `null`，回落到「工具 X 执行完成」。少数需要自定义结果的工具另走 `buildToolResultView(toolCall)`，返回 `image` / `web-search` / `todo` / `memory` / `text` 五种视图之一。

**跨切片数据用注入，不用反向依赖。** 知识库名属于 `features/knowledge-base`，`features/chat` 不能引用它，因此 `buildToolHeader` 接受可选的 `resolveKbName(kbId)`；拿不到名称时对应的片段不渲染，避免出现「知识库: <一串 id>」这种半截标签。`query_kb` 与 `search_file` 的参数里本来就带 `kb_name`，优先用它。

**运行状态对辅助技术可见。** 专用头部只渲染主文案与参数，状态由图标传达，而图标带 `aria-hidden`；因此额外渲染一份 `sr-only` 的纯文本状态，视觉与参照一致。

**已覆盖**：命令类（`bash`/`cmd`/`execute`/`run_shell_command`）、文件类（`glob`/`list_directory`/`ls`/`grep`/`search_file_content`/`read_file`/`write_file`/`edit_file`/`replace`/`ocr_parse_file`）、网络（`web_search`/`tavily_search`/`doubao_search`）、数据库（`mysql_*`）、知识库（`query_kb`/`search_file`/`find_kb_document`/`open_kb_document`/`get_mindmap`/`list_kbs`）、其余（`calculator`/`remember_memory`/`write_todos`/`text_to_img_qwen_image`/`chart`/`ask_user_question`）的头部；以及图片、图表、网络搜索、任务清单、记忆、计算器的结果视图。

## 替代方案

- **逐文件复刻 28 个渲染器**：保真最高，但其中 20 多个只差头部文案，等于把同一段外壳复制 20 遍。
- **把 `kb_id` → 名称的查询放进 `features/chat`**：会构成同层切片互相依赖，Steiger 会拒；注入是唯一不需要新中间层的做法。
- **把专用头部也用在「运行中」状态上**：运行中看不到工具名（专用头部不含它），因此状态改用 `sr-only` 文本补足，而不是放弃专用头部。
- **给没有数据源的工具造数据**：见下。

## 后果

**参照里被判为死代码、因此没有搬的部分**（逐条给证据）：

| 参照实现 | 证据 |
|---|---|
| `isReasoningActive = message.status === 'reasoning'`（消息渲染片） | 全仓没有任何地方把消息 `status` 设成 `reasoning`；取值只有 `running`/`streaming`/`queued`，后端模型只有 `delivery_status` |
| `class="empty-block"` 占位（消息渲染片） | 该 class 只出现在模板里，样式段没有任何规则 |
| 「重新编辑问题」链接（消息渲染片） | 组件 `emit('retryStoppedMessage')`，全仓没有监听者 |
| `String.slice(0, 60)` 的内容预览（本片） | 会把代理对截成半个字符；本仓改用 `Array.from` 切分 |
| `task` 与 `subagent_*` 的专用渲染器（`TaskTool` 218 + `SubagentLifecycleTool` 398 行） | 依赖子智能体运行态（`subagentRunById` / `subagentRunByThreadId` / `subagentOptionBySlug`），而本仓 OpenAPI **没有任何子智能体端点**——没有数据源可接，不是「还没做」 |
| 网络搜索结果的空条目与解析失败 | 参照把标题与链接都没有的条目也渲染成一行空结果、把解析失败当成「没有结果」；本仓丢掉空条目、保留原文兜底 |
| `chart` 的图表结果 | 参照无条件渲染 `<img>`，形状不符时会渲染空 `src`；本仓只在形状匹配时画图 |

**尚未覆盖**：`query_kb` 的知识库检索结果、`ask_user_question` 的提问交互、`KbDocumentPreview` 的知识库文档预览三处自定义主体；`find_kb_document` 与 `open_kb_document` 的「知识库: X」片段（参数里只有 `kb_id`，要等页面层注入 `resolveKbName`）。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 工具头部按 id 分派且无专用头部时回落 | 所有工具都被套上专用文案，或专用文案丢失 | `web/src/features/chat/lib/tool-header.ts` | `test/unit/features/chat/tool-header.test.ts`（28 例） | 无独立负向用例：该行的失败面由其余各行的分派用例与 `check-types` 的返回类型收窄共同覆盖 | Passed |
| 参数为空时不产生悬空分隔符 | 头部出现孤立的 `|` | 同上 | 同文件的「参数为空时不产生空片段」 | 去掉空片段过滤后该用例必须失败（已做变异验证） | Passed |
| 知识库名拿不到时不渲染半截标签 | 显示「知识库: kb-xxxx」 | 同上 | 同文件的「搜索知识库：解析不出名称时不渲染半截标签」 | 让 `kbName` 退回原始 `kb_id` 后该用例必须失败（已做变异验证） | Passed |
| 结果视图按工具分派且形状不符时不接管 | 把失败原因当图片、把空结果当列表 | `web/src/features/chat/lib/tool-result.ts` | `test/unit/features/chat/tool-result.test.ts`（16 例） | 去掉 `http` 前缀判断后「结果不是链接时不画图」必须失败（已做变异验证） | Passed |
| 任务清单的五档状态与头部优先级 | 未登记状态被当成待处理 | `web/src/features/chat/lib/todo-list.ts` | `test/unit/features/chat/todo-list.test.ts`（9 例） | 去掉状态白名单后「未登记的状态归到 unknown」必须失败（已做变异验证） | Passed |
| 记忆工具不猜未知状态的文案 | 未知状态被当成成功 | `web/src/features/chat/lib/memory.ts` | `test/unit/features/chat/memory.test.ts`（8 例） | 让状态判定永远走 `updated` 分支后「状态未知时不猜文案」必须失败（已做变异验证） | Passed |
| 网络搜索解析失败时保留原文 | 把「搜索服务不可用」显示成没有结果 | `web/src/features/chat/lib/web-search-results.ts` | `tool-result.test.ts` 的「结果不是 JSON 时保留原文兜底」 | 去掉 `rawText` 分支后该用例必须失败（已做变异验证） | Passed |
| 运行状态对辅助技术可见 | 专用头部下状态只剩图标，屏幕阅读器读不到 | `web/src/features/chat/ui/tool-call-row.tsx` | `test/unit/pages/streamed-chat.test.tsx` 的「工具结果分片到达后工具行离开「进行中」」 | 去掉 `sr-only` 状态后该用例必须失败 | Passed |
| 不回归既有门禁与页面 | 共享渲染路径的改动波及消息列表与页面 | `web/src/features/chat/ui/tool-call-row.tsx` | `pnpm run test:unit`（140 文件 / 1577 例）、`check-types`、`check:tokens`、`lint:fsd`、`arch:check`、`build` | — | Passed |

已知未验证范围：真实浏览器里的头部版式、徽标间距、结果列表与图片尺寸（本机没有浏览器）；`resolveKbName` 的页面接线与三处未覆盖的自定义主体。
