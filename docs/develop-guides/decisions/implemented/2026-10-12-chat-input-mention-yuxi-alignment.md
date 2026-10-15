# 对话输入区（含 @ 提及）对齐 Yuxi

状态：implemented
类型：feature
Owner：web/src/features/chat/ui/mention-editor.tsx

事实分工：`web/src/features/chat/lib/mention-token.ts` 拥有令牌格式；`lib/mention-text.ts` 拥有文本解析、展示名映射与删除扩边；`lib/mention-resources.ts` 拥有候选归一；`lib/mention-config.ts` 拥有按智能体配置的资源过滤；`lib/agent-config.ts` 拥有智能体配置的默认值补全；`model/agent-config.ts` 拥有配置的查询投影；`lib/mention-query.ts` 拥有过滤、分组与选中移动；`lib/mention-editor.ts` 拥有 DOM 与文本互转；`ui/mention-editor.tsx` 拥有输入框组件；`web/src/pages/chat/ui/chat-page.tsx` 拥有候选数据源与提交动作。

## 问题

输入区在参照里是 `MessageInputComponent.vue`（1808 行），其中提及机器 597 行（`mention_utils` 189 + `useMention` 162 + `useAgentMentionConfig` 164 + `mention_resource_items` 56 + `mention_icon_utils` 18 + `mention_api` 8）。本仓原本是普通 `input`，没有任何提及能力。

参照的输入框是 `contenteditable`：提及显示成一个整体芯片，`textarea` 只能放纯文本。**第 3 片（输入区）与第 4 片（`@` 提及）因此无法分开做**——提及的弹窗、解析、图标全部长在输入组件内部，拆开等于把编辑器建两遍。

## 决策

**合并第 3、4 片为一片**，按「令牌格式 → 文本解析 → 候选归一 → 过滤分组 → 编辑器 DOM → 组件 → 页面接线 → 拖放」九批落地。

**依赖方向**：候选配置属于 agent 配置与工作区文件树，知识库列表属于 `features/knowledge-base`，`features/chat` 都不能反向依赖；因此候选数据由页面组装后作为 props 传入，切片内只做归一与过滤。

**文件搜索走契约生成物**：端点 `GET /api/mention/search` 本仓已有 SDK 生成物，不手写请求（`web/AGENTS.md` 禁止 api 段之外出现 `/api` 字面量）。

**编辑器的 DOM 规则**：React 只在外部值变化时重建内容，打字期间不碰 DOM。`contenteditable` 的 DOM 由浏览器拥有，React 每帧重写会让光标在每次按键后跳。

## 替代方案

- **把输入框留在 `textarea`，提及只做纯文本补全**：无法显示整体芯片，退格会把令牌拆成两半；参照的交互（芯片不可编辑、整体删除）做不到。
- **拆成两片**：见「问题」——编辑器要建两遍。
- **把提及候选做成全局 store**：候选是页面级数据（依赖当前 thread 与当前 agent 配置），放进全局 store 会引入跨页面的生命周期问题，而它没有跨页面消费者。
- **搬 `useMention`**：该模块全仓零消费者，且只按两个字段匹配，与 `MessageInputComponent` 里活的实现不是一套（见「后果」表）。搬它等于给一份死代码配上消费者。
- **只补技能 / MCP / 子智能体三类，知识库继续用全局列表**：四类候选走两套口径，用户会看到「配置里没勾的技能不出现、没勾的知识库却仍在列表里」；而且参照的语义是「智能体用得到的资源」，保留全局列表等于把这条语义拆成两半。

## 后果

**参照里被判为死代码、没有搬的部分**：

| 参照实现 | 证据 |
|---|---|
| `composables/useMention.js`（162 行） | 全仓零消费者；且只匹配标签与值两个字段，活实现匹配六个字段（标签 / 值 / 描述 / 资源 id / 令牌文本 / 类型） |
| `query.includes('@')`（`findActiveMentionQuery`） | 查询起点取自 `lastIndexOf('@')`，查询词里不可能再出现 `@`，该分支恒假 |

**提及候选按当前智能体配置过滤**（对齐参照的 `useAgentMentionConfig`）：

候选取自当前智能体配置里可用的资源。`GET /api/agent/{agent_id}`（路径参数实际是 slug）下发两份数据：`configurable_items` 是每个种类的可选项，`config_json.context` 是当前选中值。选中值为 `null` 且该种类属于「默认全部」时全部可选项参与；为数组时只取数组里的值；其余情况该配置项不贡献候选。

四类候选的数据源（2026-10-12 复核更正，此前的记法不成立）：

| 候选类型 | 数据源 |
|---|---|
| 文件 | 提及搜索端点 |
| 知识库 | agent 配置项 `knowledges` 的可选项 |
| 技能 | agent 配置项 `skills` 与 `preload_skills` 的可选项（两者 `kind` 都是 `skills`，合并后取值） |
| MCP | agent 配置项 `mcps` 的可选项，后端只列已启用的服务器 |
| 子智能体 | agent 配置项 `subagents` 的可选项 |

原记录写「技能端点未声明响应模型 / MCP 只有系统管理面 / 子智能体没有任何端点」，实际三者也都不经独立端点：可选项由 `resolve_agent_resource_options` 统一填充进 `configurable_items`（`backend/package/ars/agents/context.py`），子智能体走 `list_visible_subagents`。

**知识库候选来源随之改变**：此前用 `useKnowledgeBases` 的全局列表，现在按智能体配置过滤。被显式限定过的智能体只列出它勾选的知识库；配置为 `null` 时列出当前用户可见的全部。

**空数组的读法按后端语义，此处与参照不同**：后端把两组集合分开登记——`_DEFAULT_ALL_CONTEXT_FIELDS` 是 `tools / knowledges / mcps / skills`，`_EMPTY_ALL_CONTEXT_FIELDS` 只有 `subagents`（`backend/package/ars/agents/context.py`）。因此 `subagents: []` 与 `null` 同义（都表示当前用户可见的全部子智能体），而 `skills: []` 是一个都不选。参照的 `useAgentMentionConfig` 把两类空数组都读成「一个都不选」，本仓按后端事实处理；这是与参照的声明偏离，`EMPTY_MEANS_ALL_RESOURCE_KINDS` 是它的事实 Owner。

**取配置前先补默认值**：`config_json.context` 只存被改过的那几项，不补默认值会让没动过的种类读成 `undefined`，四类候选全部落空。`null` 表示「默认全部」的种类保留 `null`，其余种类补配置项里的 `default`（对齐参照 `applyConfigDefaults`）。

**文件候选仍是远程搜索**：参照的文件候选取自 `agent_state.files` 与线程附件，本仓用提及搜索端点按查询词取，与参照同为用户可见结果。

**收紧的三处**：目录不可提及（参照会插一个指向目录的令牌）；本地文件只在有查询词时参与（一打出 `@` 就铺满整个文件列表没有意义）；键盘上下越界停在边界不回绕（回绕会让用户以为候选消失）。

**与 Yuxi 的 UI 差异（待阶段二对齐）**：输入框与候选弹窗目前是 Tailwind 工具类，未换 antd；参照的候选弹窗有分组标题与图标，本仓已对齐分组标题（文件 / 知识库 / MCP / Skills / Subagents）与图标，但**版式细节（间距、圆角、悬停态）未逐像素核对**。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 当前结果 |
|---|---|---|---|---|
| 令牌格式与参照一致（含引号转义） | 含空格的令牌被拆开 | `lib/mention-token.ts` | `test/unit/features/chat/mention-text.test.ts` | Passed |
| 令牌识别与去转义 | 带引号的令牌解析出错误的值 | `lib/mention-text.ts` | 同文件 | Passed |
| 删除跨过芯片时整块删除 | 退格把芯片拆成两半 | `lib/mention-text.ts` | 同文件的六条删除扩边用例 | Passed |
| 光标偏移换算包含芯片长度 | 光标落在芯片后时 `@` 查询判定错误 | `lib/mention-editor.ts` | `test/unit/features/chat/mention-editor.test.ts`（16 例） | Passed |
| 构建后再序列化还原原文 | 切换线程后令牌丢失或变形 | `lib/mention-editor.ts` | 同文件的「构建后序列化还原原文」 | Passed |
| 外部值变化时才重建 DOM | 打字时光标跳到开头 | `ui/mention-editor.tsx` | `test/unit/features/chat/mention-editor-component.test.tsx` | Passed |
| 迟到的文件搜索响应不覆盖新查询 | 快速输入时候选回退到旧结果 | `ui/mention-editor.tsx` | 请求序号与 `refreshPopup` 的实现；**无独立用例** | Inspected |
| 不回归既有页面行为 | 草稿、图片、发送流程被破坏 | `pages/chat/ui/chat-page.tsx` | `test/unit/pages/chat-page.test.tsx`（37 例） | Passed |
| 候选按智能体配置过滤 | 列出该智能体用不到的资源 | `lib/mention-config.ts` | `test/unit/features/chat/mention-config.test.ts`（14 例） | Passed |
| 没存过的配置项补默认值 | 空 context 下四类候选全空 | `lib/agent-config.ts` | `test/unit/features/chat/agent-config.test.ts`（10 例） | Passed |
| 真实后端下发的形状能产出候选 | 契约漂移后候选静默变空 | `lib/mention-config.ts` | `test/unit/features/chat/agent-config-fixture.test.ts`（6 例，夹具取自 `GET /api/agent/default-chatbot` 的实测响应） | Passed |
| 页面按当前会话的 slug 取配置 | 取到别的智能体的配置 | `pages/chat/ui/chat-page.tsx` | 同页面测试的「提及候选按当前智能体的配置取，传的是会话里的 slug」 | Passed |
| 新守卫的负向案例能失败 | 守卫被删后测试仍然全绿 | `lib/agent-config.ts`、`lib/mention-config.ts` | 四处「改坏 → 用例失败 → 还原」并核对 md5，基线 32 例：删掉默认值补全（7 例失败）、删掉 `null` 保留规则（1 例）、`optionValue` 去掉 `key` 优先（12 例）、删掉子智能体空数组规则（1 例） | Passed |
| 子智能体的空数组按后端语义读成「全部」 | 未勾选任何子智能体时提及候选全空，而后端会启用全部 | `lib/mention-config.ts` | `test/unit/features/chat/mention-config.test.ts` 的「子智能体的空数组与 null 同义，列出全部」与「知识库与 MCP 的空数组仍然是一个都不选」 | Passed |
| 真实页面能看到配置里的技能与子智能体 | 候选只在单测里成立，页面上没有 | `pages/chat/ui/chat-page.tsx` | headless Chrome 打开 `/agent` 并输入 `@`：弹窗出现「文件 / Skills / Subagents」三组，5 个技能（`mysql reporter` / `knowledge-base` / `deep-research` / `html-preview` / `image-gen`）与 4 个子智能体（事实核查员 / 网页检索 / 调研探索员 / 通用任务）全部渲染；「知识库」与「MCP」两组不出现，与该环境没有知识库、没有启用 MCP 服务器一致 | Passed |
| 配置限定后候选随之收窄 | 过滤只对「默认全部」生效，显式限定被忽略 | `lib/mention-config.ts` | 真实链路：把该智能体的 `config_json.context.skills` 置为 `['image-gen']`，重开 `/agent` 输入 `@` 后弹窗只剩 `image-gen` 一个技能，子智能体（配置为 `null`）仍列出全部 4 个；随后 PUT 还原为原始的空 `context` 并回读确认 | Passed |
| 全量门禁 | — | — | `oxlint` / `tsc` / `check:tokens` / `steiger` / `depcruise` / `vitest`（161 文件 / 1819 例）/ `build` | Passed |

已知未验证范围：三套视觉走查（浅色 / 暗色 / 窄屏）与截图归档未做，本批只做了浅色 1440×900 的功能核对；`contenteditable` 的输入法组合、真实光标与选区、候选弹窗定位仍要人工看；拖放高亮与多文件拖入的观感未验证（图片槽本身只支持一张）；候选弹窗的分组版式未逐像素核对。首次落地时的两批未做变异验证，本轮新增的三处守卫补上了。
