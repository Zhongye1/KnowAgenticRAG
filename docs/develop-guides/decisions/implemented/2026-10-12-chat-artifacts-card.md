# 对话页的产物卡片

状态：implemented
类型：feature
Owner：web/src/features/chat/lib/artifacts.ts

事实分工：本批新增 `web/src/features/chat/lib/artifacts.ts`（提取与归一）、`web/src/features/chat/api/artifacts-api.ts`（下载与保存端点）、`web/src/features/chat/ui/artifacts-card.tsx`（卡片渲染）；`web/src/features/chat/ui/message-list.tsx` 通过 `renderArtifacts` 槽位把卡片挂到每轮对话尾部；`web/src/pages/chat/ui/chat-page.tsx` 拥有预览、下载、保存三个动作与在途保存状态。

## 问题

`present_artifacts` 在 `lib/tool-call.ts` 的 `HIDDEN_TOOL_CALL_IDS` 里被有意隐藏，但参照里它是被隐藏后**换一种方式呈现**的：`MessageProcessor.extractArtifactsFromConversation`（`utils/messageProcessor.js:105`）从每轮对话提取已成功登记的交付物路径，`AgentArtifactsCard.vue`（326 行）把路径渲染成对话流里的卡片，条目可预览、下载、保存到个人空间。本仓隐藏了调用却没有任何替代呈现——agent 说「我生成了报告」，用户在界面上找不到这个文件。

后端事实：`GET /api/chat/thread/{thread_id}/artifacts/{path}` 下载（Content-Disposition 带文件名）、`POST /api/chat/thread/{thread_id}/artifacts/save` 保存（body 是 `{path, destination_path}`，返回 `{saved_path}`）；路径已由后端按 workdir 归一（`backend/package/ars/services/chat_service.py` 的 `_normalize_agent_artifact_path`）。

## 决策

1. **提取规则对齐参照**：只认 AI 消息的 `present_artifacts` 调用；`tool_call_result` 存在或 `status === 'success'` 才算交付；`args` 是字符串时 JSON 解析，失败跳过该调用；`filepaths` 里丢弃空白与非字符串，路径 trim 后去重并保持首次出现顺序。落 `lib/artifacts.ts` 的 `extractArtifactsFromConversation`。
2. **展示归一单独一层**：`normalizeArtifactItems` 把路径数组转成 `{path, name}` 条目，文件名取最后一段，连文件名都取不出（如 `/`）的路径不渲染；`artifactMetaLabel` 给类型描述（与参照同一条规则：`交付文件 · 大写扩展名`，无扩展名时 `交付文件`）。这条文案现在也由状态面板的产物行共用，见 [状态面板的用量卡与产物行还原参照](./2026-10-14-state-panel-usage-card-align-yuxi.md)。
3. **卡片用回调槽位，不自带请求**：`ui/artifacts-card.tsx` 只渲染条目与触发回调（打开预览、下载、保存），fetch 与通知都在页面层——与现有 `FileTree` / `FilePreview` 的编排方式一致，卡片保持纯展示可单测。
4. **挂载点走 `MessageList` 的 `renderArtifacts` 槽位**：每轮对话渲染完显示项后追加卡片，与参照 `AgentChatComponent.vue:111` 的位置一致（产物卡片在对话流里，不在面板内）。
5. **端点落 `api/artifacts-api.ts`**：下载复用 `lib/panel-preview.ts` 的 `parseDownloadFilename`（RFC 5987）与 `saveBlobAsFile`；保存的响应 `saved_path` 按不可信数据校验，缺失时显式抛错。
6. **在途保存状态按路径记**：页面持有一个 `Set<string>`，卡片按钮据此禁用并显示加载态；保存成功用通知展示 `saved_path`。
7. **「打开预览」复用面板文件分区**：与文件树的节点点击同一套 `upsertSection` + `panelPreview.open`，作用域固定 `thread`（产物路径归 workdir）。

## 替代方案

**保留工具行渲染 present_artifacts**：参照明确把它从工具流里隐藏，工具行会打断消息阅读；路径列表的可操作性（预览/下载/保存）也放不进工具行摘要。

**在卡片里内置目录选择器保存**：参照有 `WorkspacePathPicker` 弹窗选目标目录；本仓没有对应组件，引入一个树形选择器只为填一个默认目录不值得。本仓直接用后端默认（`destination_path` 传 null），成功后用 `saved_path` 通知实际落点。阶段二对齐交互时若需要目录选择，再评估引入 picker。

**提取逻辑并进 `message-processor.ts`**：那个文件的职责是历史消息到会话分组的转换；产物提取是面向呈现的独立查询，放同文件会让两个消费方向（分组渲染 / 状态聚合）互相牵动。

## 后果

- `present_artifacts` 继续留在 `HIDDEN_TOOL_CALL_IDS`，它的呈现者现在明确是产物卡片。
- 卡片出现在**每一轮**有交付的对话尾部；流式中的那一轮只要提取到成功调用也会即时出现，与参照一致。
- 「打开预览」对文本类文件直接可用；二进制类（图片以外）落预览的下载提示分支，这是 `lib/panel-preview.ts` 的既有口径，不是本批新增的限制。
- 保存没有目录选择；需要指定目录的用户要等阶段二的 picker 评估。
- `MessageList` 新增一个可选槽位 prop；不传时行为与之前完全一致。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 只认成功的 `present_artifacts`，路径去重保序 | 失败调用也出现，或重复路径重复渲染 | `lib/artifacts.ts` | 单测：去重保序、无结果丢弃、success 无结果算交付 | 去掉 `isSuccessfulToolCall` 判定后用例失败 | Passed |
| 参数解析失败跳过该调用 | 半截 JSON 渲染出垃圾条目 | 同 | 单测：坏 JSON 返回空 | 改坏 catch 后用例失败 | Passed |
| 空白与非字符串路径丢弃 | 渲染空条目或 `42` 这样的路径 | 同 | 单测：混合类型列表 | 去掉类型守卫后用例失败 | Passed |
| 卡片空列表不渲染、保存中禁用按钮 | 空卡片占位；保存连点重复请求 | `ui/artifacts-card.tsx` | 组件测试：空渲染、禁用、无线程禁用 | 去掉 return null / saving 禁用后用例失败 | Passed |
| 下载文件名走 Content-Disposition | 中文文件名乱码 | `lib/panel-preview.ts`（复用） | 既有用例覆盖 RFC 5987 分支 | — | Passed |
| 保存响应缺 `saved_path` 时显式失败 | 把未保存伪装成成功 | `api/artifacts-api.ts` | 单测路径待补 integration（见未验证范围） | — | 部分 |

## 风险

- 「打开预览」「保存」是新增的接口消费路径，jsdom 只覆盖回调时序；真实 HTTP 语义（下载头、保存落盘）未验证。
- 卡片即时性依赖流式消息里的 `tool_call_result` 形态；后端若在流式分片里延迟填结果，卡片会晚于工具完成才出现。
- 保存用后端默认目录，与参照的目录选择交互不同构；阶段二对齐时再动。

## 证据

- 全量门禁：`oxlint src` 0 warnings / 0 errors（342 文件）、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`depcruise`（389 模块 / 1406 依赖）、`vitest run`（2040 例全过）、`vite build` 通过。
- 变异验证：五处「改坏 → 用例失败 → 还原」并核对 md5（基线 17 例）——去掉成功判定（1 例失败）、JSON 解析失败不跳过（1 例）、类型标签恒返回「交付文件」（1 例）、空列表不 return null（1 例）、保存不禁用（1 例）。

## 已知未验证范围

- 真实链路未走查：需要一个带 `present_artifacts` 成功调用的会话（本机线程 workdir 多为空），验证卡片出现、预览打开、下载与保存的真实落盘。补走查时随 `pages/agent/evidence/` 一起归档。
- `saveThreadArtifact` 的响应校验分支（缺 `saved_path`）没有单测，需要真实或 mock 的 HTTP 层。
