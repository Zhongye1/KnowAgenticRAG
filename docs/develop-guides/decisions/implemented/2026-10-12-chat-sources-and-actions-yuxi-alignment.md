# 第 7 片的来源提取改写与消息底部工具条

状态：implemented
类型：feature
Owner：web/src/features/chat/lib/sources.ts

事实分工：`web/src/features/chat/lib/sources.ts` 拥有知识库与网络来源的提取与去重；`web/src/features/chat/ui/message-actions.tsx` 拥有来源展开区与消息底部工具条（反馈、复制、时间）；`web/src/features/chat/ui/kb-chunk-groups.tsx` 以 `showSummary` 开关同时服务工具结果与来源面板两个消费方。

## 问题

参照 `MessageProcessor.extractKnowledgeChunksFromConversation`（`messageProcessor.js:145-229`）按「每个知识库就是一个同名工具」的假设提取来源：拿工具调用名与知识库名集合比对。本仓知识库检索是 `query_kb` 一个工具，知识库是它的 `kb_name` / `kb_id` 参数——参照口径在本仓一条都提取不到，且静默返回空数组。另外参照的去重键用 `kbName::chunkId`，`kb_name` 解析不出来时不同知识库的片段会误判成重复。

同一批落地的还有消息底部工具条（参照 `RefsComponent.vue` 493 行）：点赞 / 点踩 / 复制 / 耗时 / 来源展开。

## 决策

1. **提取按本仓工具模型分派**：知识库来源认 `query_kb` 工具调用，从参数与结果里取 `kb_id` / `kb_name` / 片段列表；网络来源认三个搜索工具（`web_search` / `tavily_search` / `doubao_search`），按链接去重、分数降序（与参照等价）。
2. **去重键改用 `kb_id`**：`kbId::chunkId`，无片段 id 时退回内容哈希。`kb_name` 可能解析不出来，用它做前缀会把不同知识库的片段误判成重复——`kb_id` 是稳定标识。
3. **来源入口与工具条合进同一行**（`ui/message-actions.tsx`）：两者共用图标行与展开状态，分成两个组件会把「来源 N」的展开状态提升到消息项里再传下来，多一条(props)链没有换来任何复用。
4. **时间按上海日历分五档**：判断「昨天」「今天」用固定时区，按运行机器时区算会让同一条消息在不同机器上显示不同结果。
5. **反馈错误里带 `already` 时按「已提交」处理**：重复提交是幂等成功，不改写成「请稍后重试」。
6. **不渲染模型名与重新生成**（声明偏离）：参照读 `response_metadata.model_name`，本仓消息没有这个字段；重新生成没有对应的重发机制——渲染一个点了没反应的入口比不渲染更糟。两个入口等对应能力出现后再补。

## 替代方案

**照搬参照的按名比对**：在本仓一条都提取不到，等于来源功能整体缺失；修法只能是改数据，改不了的就是重写。

**来源面板独立组件**（参照 `KnowledgeSourceSection` / `WebSearchSourceSection` 是两个文件）：本仓两类来源共用「来源 N」一个入口，拆两个文件是把一个展开区分裂成两份状态。

## 后果

- 来源面板只对带 `query_kb` 或搜索工具调用的消息出现；两类都空时整个入口不渲染。
- `ui/kb-chunk-groups.tsx` 的 `showSummary` 开关服务两个消费方：工具结果里报片段总数，来源面板里由标题报数量。
- 模型名与重新生成是本片仅有的两个声明偏离；已在 `alembic/pages/agent/contracts.md` 第 7 片逐条记录。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| `query_kb` 的片段按 `kb_id` 提取并去重 | 来源面板空或误判重复 | `lib/sources.ts` | `sources.test.ts`：提取、去重、无 id 退内容 | — | Passed |
| 网络来源按链接去重、分数降序 | 重复链接出现两次 | 同 | 同上 | — | Passed |
| 两类都空时入口不渲染 | 空的「来源 0」按钮 | `ui/message-actions.tsx` | `message-actions.test.tsx` | — | Passed |
| 反馈重复提交按已提交处理 | 幂等成功被报成失败 | 同 | 同上 | — | Passed |

## 风险

- 来源提取依赖 `query_kb` 结果里的片段形状；后端改字段名时来源面板静默变空（与参照同病），需要负向用例守住「不是所有消息都带来源」的判断口径。
- 时间档位写死上海时区；海外部署会显示偏移的「昨天」，参照同。

## 证据

- 单测：`sources.test.ts`、`message-actions.test.tsx` 全过；本片与第 1、2 片同批做过变异验证（见 report.md 负向用例表）。
- 全量门禁与变更时的提交见 git 历史（`5a8aa3f` `ffdc82d` `fdbb1db` `4b37b8b` `ce21a06` 五批）。

## 已知未验证范围

- 来源面板在真实模型返回下的片段形状未走查（需要真实知识库检索）；阶段二视觉走查时一并归档。
