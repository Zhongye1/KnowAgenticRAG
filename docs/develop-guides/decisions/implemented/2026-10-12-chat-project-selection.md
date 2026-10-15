# 对话页的项目选择

状态：implemented
类型：feature
Owner：web/src/pages/chat/ui/chat-page.tsx

事实分工：`web/src/features/chat/lib/project-selection.ts` 拥有候选过滤、相对时间、当前项文案与路径归一；`web/src/features/chat/api/projects-api.ts` 拥有三个端点与归一；`web/src/features/chat/model/project-queries.ts` 拥有查询、创建与防抖；`web/src/features/chat/ui/project-selector.tsx` 拥有入口、三个视图与创建用的幂等键；`web/src/features/chat/model/chat-runtime.ts` 拥有 `project_id` 的传递与建线程单飞；`web/src/pages/chat/ui/chat-page.tsx` 拥有入口位置与编排。

## 问题

参照在**还没有会话时**把 `ProjectSelectionSection` 渲染在输入框上方（`AgentChatComponent.vue` 的 `#extra` 插槽，`v-if="!currentChatId"`），用它为新会话选一个项目目录；选中的 id 随建线程请求下发，默认值 `AUTO_PROJECT_ID`（`'__auto__'`）表示「不使用项目，发送时创建独立目录」，此时下发空串交给后端决定。

组件里还有两条路径：从历史对话里挑一个目录（`/api/projects/history-candidates`，**后端**按 `workdir_path` 去重），以及新建项目（需要名称与目录路径，`mode: 'linked'`）。新建项目的幂等键在进入创建视图时生成一次，失败重试复用它——后端按它去重，超时重试不会建出两个项目。

本仓没有项目选择入口，`createThread` 也没有 `projectId` 参数——虽然契约的 `ThreadCreate` 早已接受 `project_id`。

## 决策

**纯逻辑落 `lib/project-selection.ts`**：`AUTO_PROJECT_ID`、`filterProjects`、`formatRelativeTime`（六档与参照同值）、`canCreateProject`、当前项文案与提示、`resolveProjectId`（自动与空都归一成空串）、`normalizeWorkdirPath`。

**三个端点落 chat 切片的 api 段**：列出、创建（请求体 `{request_id, name, workdir: {mode, path}}`，`linked` 的路径去掉前导斜杠）、历史候选（搜索参数名是 `q`）。响应没有声明模型，字段按不可信数据处理：缺 `id` 的项目、缺 `thread_id` 或 `workdir_path` 的候选都丢掉。

**建线程单飞与幂等键都按「智能体 + 项目」判定**：项目换了就是另一次创建。只按智能体判定的话，用户改了项目再发会拿回上一条已经绑了别的目录的线程；失败后复用旧 `request_id` 还会让后端把上一次的创建意图回放回来。

**历史候选的迟到响应由查询键隔离**：按查询词分 key，旧响应落在旧 key 上，因此不需要参照那套请求序号；防抖 250ms 抽成 `useDebouncedValue`（与参照同值）。

**建线程成功后把选择重置回 `AUTO_PROJECT_ID`**：项目只对这一次新会话有效。重置紧跟在建线程成功之后、上下文校验之前——用户在建线程期间切走时那条分支会提前返回，重置放在它后面就永远走不到，下一条新会话会带着上一个项目。

**项目列表里同时提供「新建项目」与「从历史对话选择」两个入口**：只能从历史候选进创建视图的话，历史为空时用户建不出第一个项目。

**入口用对话框承载三个视图**（项目列表 / 历史对话 / 新建项目）。参照是带内嵌搜索框的下拉面板，本仓换成对话框：下拉里放输入框会和菜单的键盘导航抢事件，而外观本来就要在阶段二重做。

**过滤用 `toLowerCase()` 而不是参照的 `toLocaleLowerCase()`**：后者不带 locale 时随运行环境变化，同一个项目名在不同机器上可能命中不同结果。与 `lib/message-time.ts` 固定时区同一个理由。

**非字符串的查询按「没有查询词」处理**：参照会先 `String(query)`，传 `null` 时会拿 `"null"` 去过滤，结果是空列表。本仓把 `null`、数字这类输入当成空查询。

## 替代方案

**把项目选择放到侧边栏或会话设置里**：参照把它放在输入框上方且只在新会话时出现，因为它的作用是决定这条会话的工作目录；会话建出来之后再改，等于要迁移已经产生的文件。

**不做「从历史对话选择」与「新建项目」**：少两条路径，但前者是复用旧工作目录的主要入口，后者是 `linked` 模式存在的意义；缺了它们用户只能手打路径。

**把项目 id 写进会话 metadata 而不是建线程参数**：契约里 `ThreadCreate` 有 `project_id` 字段，而 metadata 是自由字段；用前者才能让后端在建线程的同一事务里确定工作目录。

## 后果

- 建线程的幂等键多了一个维度：同一个 `request_id` 不再跨项目复用。这是对的行为，但意味着「换项目重试」会真的新建一条线程。
- 历史候选按查询词分 key，缓存里会按词留几份结果（有 staleTime 兜底）。
- 选择器只在没有会话时出现，因此它的状态（选中值、搜索词）在进入会话后即失效；这与参照一致。
- 真实链路核对留下了一个本地项目（`e2e 项目核对`）与它绑定的会话：项目端点没有删除接口，无法用 API 清理。也正因如此，创建失败后的重试必须复用幂等键，否则会攒下删不掉的项目。
- `canCreateProject` 与提交都按 trim 后的值判定与下发；参照只 trim 名称，路径原样下发。这是本仓的收紧。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 当前结果 |
|---|---|---|---|---|
| 默认不指定项目 | 默认值被当成项目 id 下发 | `lib/project-selection.ts` | `test/unit/features/chat/project-selection.test.ts` 的 `resolveProjectId` 与 `isAutoProject` 用例 | Passed |
| 选中的项目随建线程下发 | 选了项目但请求里没有 `project_id` | `model/chat-runtime.ts` | `test/unit/features/chat/queue-runtime.test.ts` 的「建线程把 project_id 透传给创建请求」 | Passed |
| 项目换了就是另一次建线程 | 换项目后拿回上一条线程，或复用旧幂等键 | 同 | 同文件的「项目不同就是另一次建线程，不复用同一次创建」 | Passed |
| 项目被后端绑定到会话 | 只改了界面，后端仍建独立目录 | 契约 `ThreadCreate.project_id` | 真实链路：用 API 建一个 `linked` 项目（`cb4cb2e9`），headless Chrome 在 `/agent` 选中它并发送，回读会话列表得到 `project_id = "cb4cb2e9-8237-4624-ac33-3d849b696303"` 与 `workdir_path = "projects/dad483cd-…"` | Passed |
| 项目列表按名称过滤 | 搜索不生效或大小写敏感 | `lib/project-selection.ts` | `project-selection.test.ts` 的 `filterProjects` 三例 | Passed |
| 历史候选的搜索防抖 | 每敲一个字发一次请求 | `model/project-queries.ts` | `test/unit/features/chat/use-debounced-value.test.ts` 三例（含窗口内继续输入只算最后一次） | Passed |
| 历史候选缺目录时被丢掉 | 选中没有目录的候选，挂到空路径上 | `api/projects-api.ts` | `test/unit/features/chat/projects-api.test.ts` 的 `normalizeHistoryCandidates` | Passed |
| 新建项目要求名称与目录 | 缺目录也能提交 | `lib/project-selection.ts`、`ui/project-selector.tsx` | `project-selection.test.ts` 的 `canCreateProject` 与 `test/unit/features/chat/project-selector.test.tsx` 的「新建项目要求名称与目录都有」 | Passed |
| 创建请求体正确 | 幂等键没下发，或 `linked` 的路径带着前导斜杠 | `api/projects-api.ts` | `test/unit/features/chat/projects-api.test.ts` 的「请求体带幂等键，linked 的路径去掉前导斜杠」与「创建结果没有 id 时抛错」 | Passed |
| 失败重试复用同一个幂等键 | 超时重试建出两个删不掉的项目 | `ui/project-selector.tsx` | `project-selector.test.tsx` 的「创建失败后重试复用同一个幂等键」 | Passed |
| 项目列表里能直接进新建项目 | 历史为空时建不出第一个项目 | 同 | 同文件的「项目列表里能直接进新建项目」 | Passed |
| 建线程期间切走也不留下旧项目 | 下一次新会话带着上一个项目 | `pages/chat/ui/chat-page.tsx` | `test/unit/pages/chat-page.test.tsx` 的「建线程期间切走，回到新会话时项目选择已经重置」 | Passed |
| 历史目录归一后预填进新建 | 路径少一个斜杠，挂到别的目录 | `lib/project-selection.ts` | `project-selector.test.tsx` 的「从历史对话选一条会把它的目录归一后预填」 | Passed |
| 没有会话时才有入口 | 进了会话还能改项目 | `pages/chat/ui/chat-page.tsx` | `test/unit/pages/chat-page.test.tsx` 的「没有会话时显示项目选择器，有会话时不显示」 | Passed |
| 建线程后选择回到默认 | 下一条新会话沿用上一个项目 | 同 | 同文件的「建线程后项目选择回到「不使用项目」」 | Passed |
| 守卫的负向案例能失败 | 守卫被删后测试仍然全绿 | 上述文件 | 十一处「改坏 → 用例失败 → 还原」并核对 md5，基线 127 例：`resolveProjectId` 不归一（3 例失败）、`filterProjects` 去掉小写化（3 例）、`canCreateProject` 不看目录（1 例）、`normalizeWorkdirPath` 不归一（5 例）、`createThread` 不透传 `projectId`（1 例）、单飞不按项目区分（1 例）、页面建线程不带 `projectId`（3 例）、建线程后不重置项目（2 例）、历史候选不丢缺 workdir 的（1 例）、每次提交新生成幂等键（1 例）、重置挪回提前 return 之后（1 例）；防抖另测（该文件 3 例基线，改成立即生效 2 例失败） | Passed |
| 全量门禁 | — | — | `oxlint`（326 文件 0/0）、`tsc`、`check-design-tokens.mjs`、`steiger`、`depcruise`（373 模块 / 1347 依赖）、`vitest`（168 文件 / 1913 例）、`vite build` | Passed |

已知未验证范围：三套视觉走查（浅色 / 暗色 / 窄屏）与截图归档未做，本批只做了浅色 1440×900 的功能核对；新建项目的真实链路只走了「用 API 建、在页面选」这一半，页面里的创建对话框只有单测覆盖（本机没有可用于 `linked` 的干净目录，且创建会留下无法删除的本地数据）；历史候选的真实链路未走（列表里只有我核对时产生的会话）。
