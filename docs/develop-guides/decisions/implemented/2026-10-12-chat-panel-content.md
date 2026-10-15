# 对话页的面板内容线

状态：implemented
类型：feature
Owner：web/src/pages/chat/ui/chat-page.tsx

事实分工：本批将新增 `web/src/features/chat/lib/panel-tree.ts`（树模型、排序、刷新门与轮询判定）、`web/src/features/chat/lib/panel-preview.ts`（预览缓存与对象 URL 生命周期）、`web/src/features/chat/api/filesystem-api.ts`（两套树的读、预览、删除、搜索）、`web/src/features/chat/model/panel-filesystem.ts`（查询与删除）、`web/src/features/chat/ui/file-tree.tsx`、`web/src/features/chat/ui/file-preview.tsx`；`web/src/features/chat/ui/agent-panel.tsx` 拥有内容段的分发；`web/src/pages/chat/ui/chat-page.tsx` 拥有分区的打开与轮询开关。

## 问题

右侧面板的外壳已经落地（`ui/agent-panel.tsx` + `lib/panel-sections.ts` + `lib/panel-width.ts`），但**内容段没接**：children 里只挂了 `MessageDebugPanel`，`'file-tree'` 与 `'file'` 两类分区有图标、有特判，没有渲染。

参照的面板内容是三块：

1. **文件树**（`FileTreeComponent.vue` 307 行 + `AgentPanel.vue` 里约 300 行脚本）：两套互相独立、切换保活的树——**对话目录**（线程 workdir）与**个人空间**；目录懒加载；根刷新会预取 `outputs` 与 `uploads` 来决定空目录是否展示；静默刷新保留展开状态并重载已展开目录；删除节点；按当前作用域搜索文件。
2. **文件预览**（`AgentFilePreview.vue` 1159 行）：按文件类型分发渲染（文本、图片、PDF、Office、下载兜底），带预览缓存与对象 URL 回收。
3. **面板内容容器**（`AgentPanel.vue` 模板 1–239）：把上面两块与子智能体视图、调试分区按 `activeSection` 分发；并且决定**什么时候轮询文件系统**。

轮询的判定在 `utils/agentPanelSections.js` 的 `shouldPollAgentPanelFilesystem`：面板打开、页面可见、正在生成三者同时成立，且（当前分区是文件树，或当前是对话目录里的文件预览）才轮询。本仓没有对应物。

后端事实：`GET /api/viewer/filesystem/tree?thread_id&path` 与 `GET /api/workspace/tree?path` 都返回 `{entries: [{path, virtual_path, name, is_dir, size, modified_at}]}`，目录的 `path` 带尾斜杠；`GET /api/viewer/filesystem/file?thread_id&path` 与 `/api/workspace/file?path` 取内容；`DELETE` 对应删除；`GET .../search?query` 搜索。

## 决策

1. **树模型落 `lib/panel-tree.ts`**：`buildDisplayName`、`sortEntries`（目录在前，再按名称用 `zh-Hans-CN` 排序）、`createTreeNode`（含把文件名拆成 `nameStart` / `nameEnd` 的中间省略样式）、`updateTreeChildren`、`removeTreeNode`、`normalizePathKey`、`isSameOrChildPath`、`treeContainsKey`、`refreshExpandedTree`、`expandedKeysAfterFilesystemRefresh`、刷新门 `createFilesystemRefreshGate`（按线程单飞 + 合并待办 + 只在请求线程仍是当前线程时提交）、轮询判定 `shouldPollPanelFilesystem`。
2. **两套树的作用域模型落同一个文件**：`PANEL_TREE_SCOPES`（`thread` / `workspace`）、`treeScopeSearchPlaceholder`、以及 `isWorkspaceScope` 这类判定；两套树各自的选中与展开状态由调用方持有。
3. **端点落 `api/filesystem-api.ts`**：两套树的列出、预览、删除、搜索；响应没有声明模型，字段按不可信数据处理（缺 `path` 的条目丢掉）。
4. **查询与删除落 `model/panel-filesystem.ts`**：按「作用域 + 路径」分 key 的目录查询；删除用 mutation，成功后只做局部移除（与参照一致），失败如实提示。
5. **预览缓存与对象 URL 落 `lib/panel-preview.ts`**：缓存条目按「作用域 + 路径」为键，带 `lastAccessed`；超过上限时按最近使用淘汰，淘汰与替换都要 `revokeObjectURL`；重载前先作废旧条目。
6. **UI**：`ui/file-tree.tsx`（两套树共用一个组件，靠 props 区分作用域与是否带节点动作）、`ui/file-preview.tsx`（按类型分发），并把它们接进 `ui/agent-panel.tsx` 的内容分发。
7. **页面编排**：从树里选中文件时打开（或激活）一个 `file` 分区；轮询由「面板打开 + 页面可见 + 正在生成 + 当前分区」决定，页面只负责把这几项交给判定函数。

## 替代方案

**只做对话目录一棵树**：个人空间是参照里查看自己文件的主入口，砍掉它等于面板只能看当前会话的产物。

**不做轮询**：生成过程中 agent 会往 workdir 写文件，不轮询的话用户看不到新产物，只能手动刷新；参照的轮询是有条件的，代价可控。

**把预览内容也塞进树的状态里**：预览有缓存与对象 URL 生命周期，混进树会让树的每次刷新都可能牵动 URL 回收。

**预览不做缓存**：来回切换文件会重复请求并反复创建对象 URL，后者不回收就是内存泄漏。

## 后果

- 预览缓存是 `model/panel-preview.ts` 的私有 Map：离开线程整份作废并回收全部对象 URL；跨线程不存在共享缓存。
- 轮询判定交给页面算好再传给 hook，hook 只按 1000ms 间隔触发；判定错了就是后台标签页持续打接口，这一条有专门的真值表用例。
- 文件树的展开状态在静默刷新后保留、非静默刷新回到全收起（与参照一致）；因此「生成中看到新文件」依赖轮询而非整棵重拉。
- 预览只支持后端能返回的类型；office 类型与不支持的类型都落在下载提示上。
- 参照的 HTML 预览（iframe srcdoc + 缩放）没有做：本仓的 HTML 文件在预览里落到文本分支，等阶段二与 markdown 渲染一起对齐。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 目录排在文件前，再按名称排 | 顺序随接口返回抖动 | `lib/panel-tree.ts` | 单测：目录在前、名称排序、空列表 | 去掉目录优先后用例必须失败 | Passed |
| 节点把文件名拆成中间省略的两段 | 长文件名在窄面板里被截掉尾部 | 同 | 单测：长名拆两段、短名不拆、目录不拆 | 去掉拆分后用例必须失败 | Passed |
| 展开的目录在静默刷新后重载子项 | 生成中的新文件不出现 | 同 | 单测：`refreshExpandedTree` 按层级顺序重载、单个目录失败保留上一轮 | 去掉「失败保留」后用例必须失败 | Passed |
| 刷新门按线程单飞并合并待办 | 并发刷新互相覆盖，或切线程后旧结果盖住新树 | 同 | 单测：`begin` / `finish` / `canCommit` 的四条路径 | 去掉 `canCommit` 的线程比较后用例必须失败 | Passed |
| 轮询只在面板打开、页面可见、正在生成且当前分区需要时进行 | 后台标签页也在轮询，或生成中看不到新文件 | 同 | 单测：`shouldPollPanelFilesystem` 的真值表（含「个人空间的预览不轮询」） | 去掉「正在生成」判定后用例必须失败 | Passed |
| 删除成功后只局部移除该节点 | 整棵树重拉，展开状态丢失 | `model/panel-filesystem.ts` | 单测：`removeTreeNode` 移除目标与子节点 | 去掉递归移除后用例必须失败 | Passed |
| 预览缓存按最近使用淘汰并回收对象 URL | 来回切换文件泄漏对象 URL | `lib/panel-preview.ts` | 单测：超过上限淘汰最旧、淘汰与替换都调用 `revokeObjectURL`、当前条目不被淘汰 | 去掉 `revokeObjectURL` 后用例必须失败 | Passed |
| 树只展示有内容的 `outputs` / `uploads` | 空目录占位，用户以为有东西 | `lib/panel-tree.ts` | 单测：空的关键目录被隐藏，非关键空目录保留 | 去掉隐藏判定后用例必须失败 | Passed |
| 真实链路：树能列出、懒加载并预览一个文件 | 只改了界面，接口没接对 | 契约 `/api/viewer/filesystem/*` | 真实链路：在有产物的会话里打开文件树、展开目录、点开一个文件，读到内容 | — | Passed |

## 风险

- 本机多数会话的 workdir 是空的，真实链路要先用一次带产物的运行造出文件，或者用个人空间那棵树核对。
- 预览的类型分发（PDF / Office）依赖浏览器与后端返回的 `supported` / `previewType`；没有样本时只能用构造的响应覆盖。
- 对象 URL 的回收在 jsdom 里只能用 spy 断言调用，不能证明浏览器真的释放了内存。
- 面板轮询会打接口；判定写错就是后台标签页持续请求，属于要重点覆盖的负向路径。

## 证据

- 全量门禁：`oxlint src` 0/0（339 文件）、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`depcruise`（386 模块 / 1394 依赖）、`vitest run`（175 文件 / 2023 例）、`vite build`；`python3 scripts/verify_engineering_contracts.py` 通过。
- 真实链路（文件树）：headless Chrome 在 `/agent` 打开面板、切到文件分区与「个人空间」作用域，树列出 agents 与 projects；点击 projects 懒加载出子目录 dad483cd-…，`aria-expanded` 与 `aria-selected` 均为 true。
- 真实链路（文件预览）：点击 AGENTS.md，面板出现新分区 tab，预览区展示后端返回的 markdown 内容（previewText 以 "# AGENTS" 开头），走 JSON 分支。
- 真实链路（搜索）：搜索框输入 "AGENTS"，结果列出 AGENTS.md / MEMORY.md / USER.md（后端搜索真实返回）。
- 变异验证：十三处「改坏 → 用例失败 → 还原」并核对 md5，基线 63 例（panel-tree / panel-preview / panel-filesystem / file-tree 四个测试文件）：目录不优先（2 例失败）、名称不拆段（1 例）、重载失败清空子项（1 例）、刷新门不看线程（1 例）、轮询不看生成态（1 例）、空关键目录不隐藏（2 例）、删除不递归（1 例）、迟到响应照收（2 例）、发布失败不回收 URL（1 例）、淘汰不回收 URL（2 例）、重载不作废旧条目（1 例）、文件名解析不走 UTF-8 分支（1 例）、删除后整棵重拉（1 例）。

## 已知未验证范围

- 图片与 PDF 的二进制预览分支只有归一逻辑与单测覆盖，本机没有样本文件走真实链路；真实链路只验证了 JSON 分支（markdown）。
- 删除节点与下载文件的真实链路未走（本机的对话目录没有可删可下的文件；下载的动作链路有单测：临时对象 URL 建立即回收）。
- markdown 的渲染当前是等宽文本，与参照的代码高亮渲染在阶段二（B 批次）对齐。
- 三套视觉走查（浅色 / 暗色 / 窄屏）与截图归档未做，本批只做了浅色 1440×900 的功能核对。
- 面板内容容器的「子智能体分区」由 A5 落地；「调试分区」沿用既有 children 路径。
