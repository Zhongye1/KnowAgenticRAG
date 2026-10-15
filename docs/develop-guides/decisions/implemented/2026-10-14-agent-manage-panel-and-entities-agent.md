# 智能体管理面板接入，智能体读取上移到 entities/agent

状态：implemented
类型：feature
Owner：web/src/features/agents/ui/agent-manage-panel.tsx

事实分工：本记录拥有**管理面板的组成**（搜索、统计、分组、卡片）与**智能体读取的归属**。`web/src/entities/agent` 拥有领域读取（wire → `Agent`）、列表端点与 query key；`web/src/features/agents/lib/agent-view.ts` 拥有过滤/排序/分组/统计与共享范围标签；`web/src/pages/agent-manage/ui/agent-manage-page.tsx` 拥有「去对话」的接线；`web/src/features/chat` 的候选列表改为消费 `entities/agent`（`buildAgentOptions` 只做映射）；`web/src/shared/lib/avatar.ts` 拥有首字母 + 渐变兜底；`web/steiger.config.ts` 拥有本切片的结构规则例外。

## 问题

1. **`/agent-manage` 的「智能体」tab 一直是占位**（`PagePlaceholder`「该面板随对应分片接入」）。后端侧其实已经就绪：`GET/POST /api/agent`、`GET/PUT/DELETE /api/agent/{slug}`、`GET /api/agent/backends`，`serialize()` 已返回 `can_manage / is_builtin / permission_locked / share_config(v2) / icon / capabilities`，带 `include_configurable_items=true` 时还给 `configurable_items`（含已解析好的 tools/knowledges/mcps/skills/subagents 选项）。缺的只有前端面板。
2. **智能体列表的读取口径只存在于 `features/chat`**（`api/agents-api.ts` + `lib/agent-options.ts` 的 wire 归一）。管理面板若照抄一份，就会出现两套「agent 长什么样」，改一处必漏一处。
3. **首字母头像兜底在 `features/chat/lib/avatar.ts`**，别的切片要用只能跨切片导入，而 FSD 禁止同层切片互引。
4. **共享范围的缺省语义会被读错**：后端对没设共享范围的智能体下发 `read_scope: null`（语义是「仅所有者」），而 `shared/lib/share-config.ts` 的 `normalizeShareConfig` 把缺失读范围补成 **global**——直接用它的标签会把私有智能体显示成「全局共享」。

## 决策

1. **新增 `entities/agent`**（智能体是业务名词，按 `web/ARCHITECTURE.md` 属于 entities）：`toAgent` 逐字段读不可信 wire 数据（缺 `slug` 丢弃、名称退到 `slug`、`share_config` **保留原文**不补默认值）、`listAgents({ includeSubagents })`、`agentsQueryKey` / `useAgents`（列表与 query key 的唯一事实）。
2. **`features/chat` 改为消费它**：`useAgentOptions` = `useAgents()` + 映射；`buildAgentOptions` 只做领域对象 → 选项的映射；删除 `features/chat/api/agents-api.ts`、`features/chat` 的 `listAgents` 再导出与旧的 `AGENTS_QUERY_KEY`。
3. **新增 `features/agents`**：`lib/agent-view.ts` 放纯逻辑，`ui/agent-card.tsx` 与 `ui/agent-manage-panel.tsx` 放渲染。面板只收一个 `onOpenChat` 回调，不依赖对话切片。
4. **「去对话」由页面接线**：`useThreadList().selectAgent(slug)` 后跳 `/agent`。对话页的智能体来自那份 store 而不是 URL，所以只跳转不选中等于没切。
5. **`features/chat/lib/avatar.ts` 上移到 `shared/lib/avatar.ts`**：它没有业务类型，只有首字母与按种子哈希的渐变底，两个切片共用一处实现。
6. **共享范围标签按读范围档位给**：`global/department/user` → 全局共享 / 部门共享 / 指定人；**没设读范围时是「仅所有者」**，与参照 `getShareConfigLabel` 同口径。档位读取走 `agentReadAccessLevel`，不用 `normalizeShareConfig` 的补默认值结果。
7. **本批不做新增/编辑/删除**：没有对应对话框就不渲染入口——点不动的按钮比没有更差。`can_manage` 留给阶段二那些入口的显隐。
8. **卡片图标先试配置里的图标**（上传接口给的 URL），取不到再落到首字母兜底。
9. **页面 tab 的样式收口**：原来只有一条 nav 底边与 `rounded-b-none`，激活态没有任何视觉区分（两页都是如此）。改为激活态 2px 主色下划线压在 nav 底边上（`-mb-px` 让两者重合，未激活态留同宽的透明下划线，切换时按钮高度不跳），文字按 `color-text-1` / `color-text-3` 区分，悬停变深色。`/extensions` 里那段逐字重复的 nav 一并改成同一套——同一形态的 tab 条在全应用只有一种样式。
10. **页头与卡片进一步对齐参照**（第二轮）：页头改成参照 `PageHeader` 的排布——标题 + 内联药丸式 tab（两者之间一条 1px 竖分隔线，激活态是 `gray-50` 浅底而不是下划线）+ 右侧四个统计芯片（N 个智能体 / N 个全局 / N 个内置 / N 个可管理）；统计从面板移到页头，与面板读同一份 `useAgents` 缓存，不发第二个请求。卡片改成参照 `InfoCard` 的结构：32px 图标 + 名称/等宽标识 + 两行截断描述 + 标签行（共享范围标签在左，「去对话」在右）+ 右上角「更多操作」菜单（编辑/删除）；可管理的卡片整块可点开编辑。卡片网格用参照的 `auto-fill minmax(320px, 1fr)`。
11. **补上新增 / 编辑 / 删除三个入口**：参照这一屏有「新增智能体」按钮与卡片菜单，空有布局却没有这两个入口等于死按钮。`entities/agent` 补 `createAgent / updateAgent / removeAgent / uploadAgentIcon` 与三个 mutation（统一失效 `AGENTS_QUERY_ROOT`），`features/agents` 补 `lib/agent-form.ts`（表单 ↔ 请求体换算与校验）与 `ui/agent-form-dialog.tsx`。表单只收「基本信息」：**`is_subagent` 由后端按后端 id 推导、`share_config` 未指定时由后端落成「仅创建者可读」**（两者都与参照初值一致），客户端不重复表达；编辑不改标识与后端。删除走确认框，内置智能体的删除项禁用（后端也会拒）。
12. **共享范围标签按参照 `getShareConfigLabel` 的口径**：只读 X / 读 X · 管 Y / 仅所有者，其中 X、Y 是「全局」「部门(n)」「用户(n)」。上一轮给的「全局共享 / 部门共享 / 指定人」三档是错的——它没有区分读管两段，也没表达「仅所有者」。
13. **图标上传复用通用的 `/api/user/upload-image`**（与参照同一条路径），响应里读不到地址时显式抛错，不把空串写进 `icon`。
14. **两类小标签各收成一处，取值对齐参照**：此前「卡片上的共享范围标签」与「页头统计芯片」各写了一份圆角浅底 `<span>`，取值互不相同也都与参照对不上。现在放在 `features/agents/ui/agent-chip.tsx`：`AgentCardTag` 对齐参照 `.card-tag` + `.tag-gray`（min-height 22px、`padding: 0 8px`、11px/600、`line-height: 1`、无边框、`gray-100` 底 / `gray-600` 字、4px 圆角）；`AgentSummaryChip` 对齐参照 `.summary-strip span`（`padding: 6px 10px`、1px `gray-100` 边框、`gray-10` 底、12px/18px、`gray-700` 字、7px 圆角）。两处不再各写一份。
15. **页头三处细节（第三轮）**：① 同行元素改 `items-baseline`——标题 16px 与 tab 14px 字号不同，`items-center` 对齐的是盒子，两条文字底会错开 2px。② tab 的两种状态改回参照 `.tab-item` 的口径：**悬停 `gray-50`、选中 `color-mix(in srgb, gray-800 6%, gray-0)`（比悬停更深的灰）**，并显式 `border-0 outline-none`（此前选中用的是 `gray-50`，等于把悬停色当成了选中色）。③ 页面自己补纵向留白：`ContentLayout` 只给水平 padding，两层容器的 y 方向 padding 都是 0，内容会贴到外壳顶端；两页各加 `py-4`，页头从 `pb-3` 改成 `py-3`。

16. **`/extensions` 与本页同形态**：这一页的页头是同一段结构的复制，三轮改动都同步过去了，两页不出现两种形态。

## 替代方案

**把智能体读取放进 `shared`**：FSD 的判据是「换个产品它还能用吗」——智能体是业务名词，`entities` 才是它该在的层（`shared/lib/share-config.ts` 这种跨业务的基础件才是 shared 的用法）。

**只在客户端补 `is_subagent` 与 `share_config`**：后端 `create` 已经按后端 id 推导前者、并给后者落「仅创建者可读」的默认值（与参照初值一致），客户端再表达一遍就是第二处事实。

**编辑弹窗里也带上共享范围表单**（复用 `shared/ui/share-config-form`）：能一步改完，但 `PUT /agent/{slug}` 的 `AgentUpdate` 里没有 `share_config`，接上去要先改后端契约；本批不做，卡片标签改为如实反映后端下发的值。

**保留上一轮的下划线 tab**：已经能区分激活态，但参照 `PageHeader` 的 tab 是药丸（标题右侧、带竖分隔线、激活态浅底），本轮按参照改；下划线 tab 退为 `/extensions` 之外不再使用（该页与本页同形态）。

**让 `features/agents` 直接导入 `features/chat` 的 store 做「去对话」**：同层跨切片引用被 steiger 与 dependency-cruiser 禁止；回调 + 页面接线是同一效果的合规写法。

**管理面板自己再写一份 agent 归一**：两套口径迟早不一致，且 chat 那边已经有测试在钉它。

**引入参照的默认头像（DiceBear 远程像素头像）**：多一个第三方运行时依赖，离线与隐私都要另行处理；本仓保留首字母兜底（与状态面板同一取舍）。

**把 `features/agents` 并进 `pages/agent-manage`**：搜索/分组/统计/卡片是一体的，并进去会让页面同时持有卡片渲染与请求装配。

## 后果

- `/agent-manage` 的智能体 tab 从占位变成可用面板：搜索、统计、分组、卡片、「去对话」。新增/编辑/删除仍缺，卡片因此不显示这些入口。
- 智能体的读取口径收敛到一处：chat 的候选列表与管理面板读同一份 `useAgents` 缓存（`includeSubagents` 不同就是两份 key），不再有两套 wire 归一。
- **steiger 的一个陷阱（实测）**：对某切片用 `files` + `rules: { 'fsd/insignificant-slice': 'off' }` 关规则时，steiger 会把匹配的文件从**该规则的树**里摘掉（`steiger/dist` 的 `prepareVfsForRuleRun` 对 `severity: 'off'` 的 glob 取反），于是这些切片对其它切片的引用也不计数。把 `import … from '@/entities/agent'` 放进 `widgets/app-sidebar` 会被计入，放进 `features/chat` 不会。因此 `entities/agent` 需要一条同样的例外，而不是把切片并进页面。这条对以后新增「单页面消费的切片」同样成立。
- 首字母头像现在归 `shared/lib`，两个切片各用一次；`features/chat/lib/avatar.ts` 删除。
- `features/chat` 的缓存键由 `['chat','agents']` 变成 `['agents', { includeSubagents: false }]`；数据仍只有一份缓存。

## 验证

- 单测：`test/unit/entities/agent/agent-types.test.ts`（wire 归一、缺标识丢弃、名称退到 slug、共享范围保留原文、不把缺失读范围补成全局）、`test/unit/features/agents/agent-view.test.ts`（过滤/排序/分组/统计/共享标签）、`test/unit/features/agents/agent-manage-panel.test.tsx`（分组、统计条、搜索、空态、去对话、子智能体无入口、加载中、失败重试）、`test/unit/pages/agent-manage-page.test.tsx`（tab 判定 + 「去对话」先选中再跳转）、`test/unit/features/chat/agent-options.test.ts` 改为消费归一后的领域对象。
- 真实页面（`http://127.0.0.1:5173/agent-manage`，登录状态、真实后端）：统计条 `共 6 个 · 内置 1 个 · 可管理 6 个 · 全局共享 6 个`；分组「智能体」（智能助手、深度研究）与「子智能体」（调研探索员、事实核查员、通用任务、网页检索）；卡片显示首字母兜底头像、名称、slug、描述、共享范围标签与「去对话」（子智能体没有该入口）；搜索「核查」后只剩「事实核查员」，搜 `zzz` 后显示「没有匹配的智能体」；点「用 深度研究 开新对话」后 URL 变为 `/agent`，输入栏的智能体选择器显示「深度研究」；「模型供应商」tab 不受影响（`?tab=providers`，`共 23 个 · 已启用 1 个 · 已启用模型 10 个`）。
- 命令：`vitest run`（191 文件 / 2189 用例通过）、`tsc --project tsconfig.json --noEmit`、`oxlint src`（22 warning / 0 error）、`prettier --check .`、`node scripts/check-design-tokens.mjs`、`steiger ./src`、`depcruise` 均通过。
- tab 样式量测（真实页面）：激活项 `border-bottom: 2px rgb(22, 93, 255)`（`--primary-6`）、文字 `rgb(29, 33, 41)` / 500；未激活项 2px 透明下划线、文字 `rgb(134, 144, 156)`；悬停 `background: rgba(0, 0, 0, 0.04)` + 文字变 `rgb(29, 33, 41)`；两者按钮高度都是 32px，与 nav 底边同高。（第二轮改为参照 `PageHeader` 的药丸形态后，这条记录的是中间态，不再适用当前页头。）
- 标签量测（真实页面，改后）：`AgentCardTag` = `min-height 22px` / `padding 0 8px` / 11px / 600 / `line-height 11px` / 无边框 / `rgb(239,242,242)` 底 / `rgb(105,112,112)` 字 / 4px 圆角；`AgentSummaryChip` = `padding 6px 10px` / 1px 边框 / `rgb(251,252,252)` 底 / 12px / `line-height 18px` / `rgb(76,77,77)` 字 / 7px 圆角。两项都与参照的同名规则逐值相等。`/extensions` 的四个 tab 同款。
