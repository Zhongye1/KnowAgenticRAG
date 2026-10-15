# 对话页的生成中状态条与标题自动生成

状态：implemented
类型：feature
Owner：web/src/features/chat/lib/reply-status.ts

事实分工：本批新增 `web/src/features/chat/lib/reply-status.ts`（状态条文案判定）、`web/src/features/chat/lib/thread-title.ts`（标题生成的提示词、清洗与调用）、`web/src/features/chat/ui/generating-status.tsx`（纯展示状态条）、`model/system-config.ts` 的 `useFastModel`；`pages/chat/ui/chat-page.tsx` 拥有计时器、状态条的挂载位置与标题生成的触发时机。

## 问题

`replyLoadingVisible` 在 `chat-runtime.ts` 里随发送置起、随流终止清除，但没有任何 UI 消费者——用户发送后到第一个流式分片到达之间界面没有任何反馈，排队与压缩上下文同样不可见。会话标题只用 `query.slice(0, 30)`（参照 `AgentChatComponent.vue:3242` 是先截 2000 交给 fast_model 生成 30 字标题，失败才回退截断），所有会话标题都是半句话。

后端事实：`POST /api/chat/call` 是非流式模型调用（body 是 `{query, meta.model_spec}`，响应无 response_model）；`GET /api/system/config` 的 `fast_model` 配置项存在（`backend/package/ars/config/options.py:113`）。

## 决策

1. **状态条文案判定落纯函数 `buildReplyLoadingStatus`**：不可见或队列暂停时不显示（队列条自己承载暂停态，两者不同时亮）；压缩上下文 > 排队中（带条数）> 正在生成。耗时计时是页面层的 effect：可见时起 1 秒间隔，不可见即清零；标签格式对齐参照（60 秒内 `Ns`，之后 `N分Ms`）。
2. **状态条挂在消息区顶部、只在有对话时渲染**：与参照 `generating-status` 的位置与 `conversations.length > 0` 条件一致。`role="status"` + `aria-live="polite"` 让读屏用户也能感知。
3. **标题生成的提示词把请求封进 `<conversation_request>` 标签并显式声明「只是素材」**：第一句话是用户输入，直接拼进 prompt 等于把不可信文本放进指令位；封标签 + 否定声明是参照的既有做法，本批原样对齐。
4. **清洗与回退是两个独立函数**：`sanitizeGeneratedTitle` 去首尾引号、归一空白、截 30，非字符串返回空串（响应无 response_model，按不可信数据处理）；`fallbackTitleFromQuery` 是失败回退，空串表示连回退都没有（全空白输入不生成标题）。
5. **触发时机是「线程的第一条消息发送成功后」**：`messages.length === 0 && !isSteer`——引导不产生新对话主题。写回走 `thread-list-store.rename`（它自己处理空标题与失败）；生成与写回都失败时静默，不打扰用户。
6. **切线程防护**：生成是异步的，写回前检查 `contextRef.current.threadId === targetThreadId`，慢响应不会把 A 线程的标题写到 B 线程。

## 替代方案

**把状态条做进 `QueueBar`**：队列条在输入区上方、只在有排队时出现；生成中状态条在消息区尾部，两者职责不同——一个描述队列，一个描述正在生成的这条回复。合并会让两个消费者互相牵动显隐条件。

**标题生成放进 `chat-runtime.sendMessage`**：runtime 是网络与状态的编排层，标题生成是一次可选的界面美化；放进去会让 runtime 依赖系统配置与线程列表，参数也要多穿两层。页面层已经同时拿到两者。

**为生成失败做重试**：标题是装饰性的，失败回退已经保证了可用结果；重试只会多打一次模型调用。

## 后果

- 发送后到首个流式分片之间，消息区顶部出现「正在生成回复...」与流逝时间；排队与压缩上下文各有文案。
- 队列暂停时状态条让位，队列条承载暂停态；两者不会同时出现。
- 新会话的首条消息触发一次 `/api/chat/call`（fast_model）；生成结果最多 30 字。旧会话与引导不触发。
- `useFastModel` 读不到（管理面不可见）时生成调用会失败，静默回退截断——与参照在配置缺失时的行为一致。
- 状态条计时器在可见期间每秒一次 `setState`；可见窗口通常只有发送后的几秒，成本可忽略。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 文案按压缩 > 排队 > 生成的优先级 | 排队时显示「正在生成」 | `lib/reply-status.ts` | 单测：四条路径 | — | Passed |
| 队列暂停时状态条让位 | 状态条与队列条同时亮 | 同 | 单测：paused 不显示 | 去掉暂停判定后用例失败 | Passed |
| 请求内容封进标签并截 2000 | 用户输入里的指令被当成提示词执行 | `lib/thread-title.ts` | 单测：标签存在、长度上限 | — | Passed |
| 模型返回清洗到 30 字、去引号 | 超长标题带引号进会话列表 | 同 | 单测：引号、截断、非字符串 | 去掉截断后用例失败 | Passed |
| 回退标题截 30、空白输入不生成 | 全空白输入触发无意义调用 | 同 | 单测：空白返回空串 | — | Passed |
| 状态条只在有对话时渲染 | 空会话挂着状态条 | `pages/chat/ui/chat-page.tsx` | 组件测试：渲染与耗时显示；页面装配由页面测试覆盖 | — | Passed |

## 风险

- `/api/chat/call` 的响应无 response_model，`response.response` 的取法按不可信数据处理；后端改字段名时生成会静默回退，不会崩。
- 标题生成与写回的竞态（同一线程连续两条首消息）在「第一条消息」的判定下不会触发；用户在生成完成前手动改名会被自动标题覆盖——参照同样有这个行为，接受。
- 真实链路（fast_model 生成、真实会话列表更新）未走查，见未验证范围。

## 证据

- 全量门禁：`oxlint src test` 0 errors（535 文件）、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`depcruise`（无违规）、`vitest run`（182 文件 / 2078 例全过）、`vite build` 通过。
- 变异验证：两处「改坏 → 用例失败 → 还原」并核对 md5——去掉队列暂停判定（1 例失败）、去掉标题截断（1 例失败）。

## 已知未验证范围

- 真实链路未走查：fast_model 生成标题、会话列表标题更新、状态条在真实流式窗口中的显隐，都需要真实后端与模型。走查时随 `pages/agent/evidence/` 归档。
- 状态条的显隐与 `replyLoadingVisible` 的联动只有单测与页面 mock 层的覆盖；`replyLoadingVisible` 本身的置起/清除时序属于 `chat-runtime` 既有语义，本批未改动。
