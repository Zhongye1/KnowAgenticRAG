# 扩展页补齐工具与 MCP 两个分区

状态：implemented
类型：feature
Owner：web/src/pages/extensions/ui/extensions-page.tsx

事实分工：`web/src/features/tools` 拥有「工具」面板（只读卡片网格 + 详情弹窗），端点与归一在 `web/src/entities/tool`；`web/src/features/mcp` 拥有「MCP」列表（分组卡片、表单弹窗、可添加简介）与详情视图，端点与查询在 `web/src/entities/mcp`，详情页外壳在 `web/src/pages/mcp-detail`；扩展页外壳只做 tab 装配与门控。参照实现 `/home/liskarm/桌面/RAGS/Yuxi/web/src/components/extensions/{ToolsCardList,McpCardList,McpFormModal,McpDetailView,ExtensionCardGrid}.vue` 与 `views/ExtensionsView.vue` 只提供视觉与行为事实。

## 问题

1. **扩展页四个 tab 里有两个是占位**：`/extensions` 的「工具」与「MCP」此前渲染 `PagePlaceholder`，而 `MCP 详情` 路由也挂在占位元素上（`paths.app.extensions.mcp` 已定义但没人用）。后端 `/api/system/tools`（2 条）与 `/api/system/mcp-servers`（11 条，含工具清单与逐个启停）在生成 SDK 里零消费者。
2. **参照的行为事实**：`ToolsCardList.vue` 215 行（搜索 + 分类筛选 + 刷新 + 卡片网格 + 详情弹窗，参数表）；`McpCardList.vue` 478 行（搜索 + 添加 + 刷新，卡片分「已添加 / 可添加」，卡片动作按内置 / 需迁移 / 未启用三态分流）；`McpFormModal.vue` 226 行（标识 / 名称 / 描述 / 传输类型 + 图标 / URL + 请求头 JSON + 两个超时 / 标签）；`McpDetailView.vue` 982 行（返回 + 图标 + 名称 + 传输类型，测试 / 编辑 / 添加·移除·删除，信息与工具两个分区，工具逐个启停 + 复制名称 + 参数折叠）。
3. **`requires_mcp_stdio_migration` 的语义**：`transport == 'stdio' and not is_builtin`。内置的 stdio MCP（本库里的 `mcp-server-chart`）不算待迁移，可以正常添加与列出工具。

## 决策

1. **工具面板是只读的**：工具由代码注册、运行期不变，没有写入动作。查询给 5 分钟 staleTime。
2. **MCP 卡片动作按参照的三态分流**：需迁移的只能删；未启用的可添加；内置的只能从当前配置移除（`PUT /status` 停用，不删库）；其余真删除。卡片点击也分两路——已启用或需迁移的进详情页，未启用的先看简介弹窗再决定。
   **需迁移分支必须排在「未启用 → 添加」之前**：后端 `serialize_mcp_server` 对需迁移的记录强制 `enabled = False`，`set_server_enabled` 又在 `enabled=True` 时抛「历史 stdio MCP 已被禁用」（400）。评审发现我第一版把两者并成一个 `if`，导致需迁移的卡片按钮写着「删除」却去调启停、必然失败；现在单独一条分支，并有负向用例钉住（见验证）。
3. **详情页的编辑复用表单弹窗**：参照在详情页内联了一份与 `McpFormModal` 同字段的表单；本仓用同一个 `McpFormDialog` 的编辑态，少一份重复实现。这是相对参照的显式偏离。
4. **表单值用「基准 + 草稿」而不是 effect 同步**：`base` 由当前目标（新建/编辑对象）在渲染期派生，`draft` 只装本次打开的改动，关闭时清空。参照用 `watch(open)` 重置，本仓的 `react(set-state-in-effect)` 会拦下那种写法，而且 effect 同步在这里确实多余。
5. **分类下拉从数据推导**：参照写死四类（`buildin` / `knowledge` / `mysql` / `debug`）；本仓按实际出现的分类生成选项，后端注册新分类不用改前端。
6. **工具图标用 `createElement` 渲染**：`getToolIcon(slug)` 的结果命名成大写局部量会被 React Compiler 判成「渲染期创建组件」（与 `features/chat/ui/tool-call-row.tsx` 同写法）。
7. **两处模块上移到 `shared`**（都出现了第三个消费方）：`features/chat/ui/tool-icons.ts` → `shared/ui/tool-icons.ts`（聊天工具行 + 工具面板）；`formatSkillTitle` → `shared/lib/format/extension-title.ts` 的 `formatExtensionTitle`（技能卡片 + 技能预览 + 工具卡片 + MCP 卡片，与参照的 `formatExtensionCardTitle` 同算法）。
8. **卡片网格对齐参照的 `ExtensionCardGrid`**：`repeat(auto-fill, minmax(280px, 1fr))` + 16px 间距（MCP 按参照传 300）；技能面板一并从固定的两/三列改过来。
9. **显式偏离参照**：

| 参照 | 本仓 | 理由 |
|---|---|---|
| 工具卡片标签会把分类名与同名标签画两次（知识库类工具出现两个「知识库」） | 去重 | 语义不变，只是不重复画同一个词 |
| 分类下拉写死四类 | 从数据推导 | 后端注册新分类不用改前端 |
| 详情页内联编辑表单 | 复用 `McpFormDialog` 的编辑态 | 同字段、同校验，少一份重复实现 |
| 详情页「创建/更新时间」用 `formatFullDateTime`（到秒） | `formatMinuteStamp`（到分） | 与设置面板同一口径 |
| 卡片网格在 1440px 下 4 列 | 3 列 | 网格规则一致，但本仓页面的水平内边距比参照大 16px，容器宽度差一列的余量 |

不造：参照的 `SkillSuiteCard`（技能套件卡片）、`ExtensionToolbar` / `ExtensionDetailLayout`（抽出来只服务它自己的一套布局组件）。

## 替代方案

**把工具与 MCP 并进 `pages/extensions`。** 两个面板合计约 900 行（含表单、详情、简介三个弹窗），页面会同时持有工具清单、MCP 写入与详情分区三套状态，且详情页要复用其中的表单。

**MCP 详情页也做成弹窗。** 参照是独立路由页（`/extensions/mcp/:slug`，可深链、可返回），且本仓已有 `/extensions/skill/:slug` 的同类先例。

**不合并 `tool-icons` 与 `formatExtensionTitle`，各自抄一份。** 两处都是纯函数，但抄一份就多一个会漂移的事实源；上移到 `shared` 的成本只有改三处 import。

## 后果

- **`steiger.config.ts` 的例外清单再增三条**（features/tools、entities/tool、entities/mcp）。本仓「实体持端点、切片持界面」的约定系统性地产生单消费方切片，这条清单现在有 15 条同因例外——值得回头为「引用统计的盲区」找一个更好的表达，而不是继续逐条追加。
- **`features/chat/ui/tool-icons.ts` 的位置变了**：`shared/ui/tool-icons.ts`，聊天侧的两个 import 已同步。
- **MCP 列表的 `['mcp-servers']` 前缀同时覆盖列表、单体与工具清单**，任何写入都失效整棵前缀；启停会改工具可用性，这样最省心。
- **详情页对内置 MCP 的「移除」只停用不跳转**，页面停在停用态（参照同样如此）；非内置的删除成功后会跳回列表。

## 验证

**单测与门禁（本机 Node 26）**

| 命令 | 结果 |
|---|---|
| `NODE_ENV=test vitest run` | 227 文件、2429 例通过（新增 6 个测试文件 59 例；`model-provider-panel` 的既有装载失败与本批无关） |
| `tsc --noEmit` / `oxlint src` / `steiger` / `depcruise` / `check:tokens` / `prettier --check` / `vite build` | 全部通过（oxlint 0 error / 28 warning，与改动前同数，新增文件 0 warning） |
| `python3 scripts/verify_engineering_contracts.py` | 通过 |

新增用例的断言面：工具与 MCP 的响应归一（缺 slug 丢条目、缺字段给中性默认、参数表与必填表）；MCP 写回载荷（新建带 slug、更新不带、空值发 null）；MCP 面板的卡片动作三态（内置停用 / 普通删除 / 未启用添加）与点击两路（已启用进详情、未启用看简介）；工具面板的搜索、分类推导与详情弹窗参数表；MCP 视图逻辑（动作文案、排序、分组、请求头解析与格式化、表单校验）。

**真实页面走查（zwj / superadmin，真实后端 `localhost:5173`，参照在 `localhost:5175` 同库对照）**

| 分区 | 走查结论 |
|---|---|
| 工具 | 11 个工具全部渲染，标题 / slug / 描述 / 分类标签与后端 `/api/system/tools` 一致；分类下拉只出现「内置工具 / 知识库」两项（数据推导，没有写死的「调试」） |
| MCP 列表 | 一台 `mcp-server-chart`（内置、未启用）落在「可添加」；点卡片开简介弹窗（描述 / 传输类型 stdio / 内置徽标 / 标签 / 创建人） |
| 添加 | 简介里「添加」→ 成功提示「MCP 'mcp-server-chart' 已添加」，卡片移到「已添加」、动作变成「移除」，后端复核 `enabled: true` |
| MCP 详情 | `/extensions/mcp/mcp-server-chart` 渲染返回 + 图标 + 名称 + stdio + 测试/编辑/移除，信息分区字段与后端一致；工具分区列出 **27 个真实工具**（该 stdio 服务确实启动并返回了清单），逐个带启停开关与复制钮 |
| 工具启停 | 关掉 `generate_bar_chart` → 卡片变暗、后端复核 `disabled_tools: ['generate_bar_chart']`；再打开复核回到 `[]` |
| 复原 | 「移除」→ 后端复核 `enabled: false`、`disabled_tools: []`（走查数据已全部复原） |

截图：`web/alembic/pages/extensions/evidence/{tools,mcp,mcp-basic-info,mcp-after-add,mcp-detail,mcp-detail-tools}-light-1440x900.png`；参照对照图 `yuxi-{tools,mcp}-light-1440x900.png`。

**独立评审（不继承开发上下文的 Reviewer Agent）**

评审在提交前跑过一遍，给出 1 条 blocking、1 条 should-fix 与 3 条 nit：

| 发现 | 处理 |
|---|---|
| 需迁移的卡片按钮写「删除」却调启停（必然 400） | 见决策 2；补负向用例，并确认它在修复前的代码上失败（`expected "vi.fn()" to be called with arguments: [ 'legacy' ]`） |
| 「三态分流」的用例组缺需迁移那一态，所以上面的缺陷没被 CI 拦住 | 补上该用例；`mcp-view` 的文案用例用的 `requiresMigration + enabled:true` 是后端不会产生的组合，已在卡片用例里改用 `enabled:false` 的真实组合 |
| `listToolOptions` 与 `TOOLS_QUERY_KEY` 没有消费方 | 一并去掉（`/system/tools/options` 等有调用方时再加回来） |
| 记录里「新增 7 个测试文件」写错（实为 6 个） | 已订正 |

评审同时确认：写回载荷与 `extra="forbid"` 的 DTO 一致、`{success,data}` 解包正确、`is_builtin` / `requires_migration` / `disabled_tools` 的映射与模型 `to_dict` 一致、`base + draft` 的表单模式没有可复现的草稿泄漏、两处 shared 上移行为等价且无残留 import。

**已知限制（与参照一致，未在本批处理）**

编辑表单里清空「描述 / 图标 / 标签 / 超时」不会真的清掉后端值：后端 `update_mcp_server` 对每个可选字段都是 `if X is not None`，而界面把空值发成 `null`，语义变成「不改」。参照同样如此，因此不是本批引入的回归；要支持清空需要后端区分「未传」与「传 null」，留作后续决策。

**未验证范围（不计为通过）**

- 新建 / 编辑 / 删除**非内置** MCP 的真实链路：库里的唯一一台是内置的，删除路径只有单测覆盖；表单弹窗的提交未在页面上跑通（创建需要一台真实可连的远程 MCP）。
- 需迁移的历史 stdio MCP：库里没有这种数据，其专属分支（只删、不给工具分区、顶部告警）只有单测与代码路径覆盖。
- 连接测试的失败分支（走查没点「测试」）。
- 深色主题与窄屏下的工具 / MCP 分区。
- 知识库与技能两个既有 tab 与参照的逐项对照（本轮只对齐了卡片网格密度）。
- 需迁移卡片的**真实删除**：库里没有需迁移的数据，该分支由单测（含负向）覆盖，未在页面上跑通。
