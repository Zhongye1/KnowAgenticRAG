# 个人空间页面向参照对齐，个人空间读写上移到 entities/workspace

状态：implemented
类型：feature
Owner：web/src/pages/workspace/ui/workspace-page.tsx

事实分工：`web/src/entities/workspace` 拥有个人空间的端点与条目归一（wire → `FileEntry`、预览载荷、查询键与写入失效）；`web/src/features/workspace` 拥有页面级交互（格式化、快速访问与面包屑、行视图、页面控制器）与全部渲染件；`web/src/pages/workspace/ui/workspace-page.tsx` 拥有三段式装配、拖拽与断点切换；`web/src/shared/lib/{filesystem-entry,workspace-path,file-preview,file-download,search-result}.ts` 拥有跨切片共用的纯件；`web/src/features/chat` 的 workspace 分支改为消费 `entities/workspace`，viewer（对话目录）分支留在原地。参照实现 `/home/liskarm/桌面/RAGS/Yuxi/web/src/views/WorkspaceView.vue` 只提供视觉与行为事实，不拥有本仓拓扑。

## 问题

1. **`/workspace` 是占位页，同一个个人空间有两个入口却没有一个能用的页面形态。** 侧边栏导航项（`web/src/widgets/app-sidebar/lib/nav-items.ts:46-50`）与对话页右侧面板的「个人空间」tab 都已上线，面板里那棵树可以看但不能写、不能进目录；路由本身是 `PagePlaceholder`（`web/src/app/routing/router.tsx:93-96`）。

2. **个人空间的读写事实原先只存在于对话切片里。** `web/src/features/chat/api/filesystem-api.ts` 用一个作用域参数同时服务对话目录与个人空间；页面要独立读取时若照抄一份，就会出现两套「个人空间条目长什么样」——与 `2026-10-14-agent-manage-panel-and-entities-agent.md` 处理的智能体读取同型。

3. **参照这一屏的行为事实**（`WorkspaceView.vue` 1276 行 + `components/workspace/*` + `components/common/FileBrowserTable.vue`）：三段式（侧栏 168px / 表 / 预览面板，内容区 ≥960px 内联、以下走模态），侧栏含「上传文件」下拉（上传文件、新建文件夹）、个人空间根、快速访问（`/agents/` 智能体文件、`/saved_artifacts` 保存的产物）；表四列（名称 / 大小 / 修改时间 / 操作），行菜单只有下载与删除，单击行即进入目录或预览；`.md/.markdown/.mdx/.txt` 可编辑并用 PUT 保存。参照**没有**：重命名、移动、刷新按钮、列排序、个人目录分页、上传进度条。

4. **后端契约已就绪**：`GET /api/workspace/tree|file|download|search`、`PUT|DELETE /api/workspace/file`、`POST /api/workspace/directory|upload`，条目形状 `{path, name, is_dir, size, modified_at}`，可编辑后缀常量 `EDITABLE_WORKSPACE_SUFFIXES = {".md",".markdown",".mdx",".txt"}`（`backend/package/ars/services/workspace_service.py:32`）与参照的可编辑集一致。缺的只有前端页面。

## 决策

1. **新增 `entities/workspace`，个人空间读写只有一个实现。** `api/workspace-api.ts` 提供 `listWorkspaceEntries`、`searchWorkspaceEntries`、`fetchWorkspaceFile`（JSON 与二进制两分支，二进制建对象 URL）、`saveWorkspaceFile`、`deleteWorkspaceEntry`、`createWorkspaceDirectory`、`uploadWorkspaceFiles`（走生成物的 `formDataBodySerializer`，请求体是 `{parent_path, files}`）、`downloadWorkspaceEntry`；`model/workspace-queries.ts` 拥有 `WORKSPACE_QUERY_ROOT` / 目录查询 / 搜索查询；`model/workspace-mutations.ts` 四个写入统一失效目录查询。`features/chat/api/filesystem-api.ts` 的 workspace 分支改为委派本切片，viewer 分支不动。
2. **两处纯件上移到 `shared/lib`**：`filesystem-entry.ts`（`FileEntry` + `toFileEntry`/`toFileEntries`，两个端点下发同一形状）与 `workspace-path.ts`（`pathBreadcrumbs`、`normalizePathKey`、`isSamePath`、`isSameOrChildPath`），理由与 `shared/lib/avatar.ts` 同：没有业务类型、两个切片共用一处实现。
3. **预览载荷与下载/搜索结果行也上移**：`shared/lib/file-preview.ts`（`PreviewType`/`PreviewFile` 与扩展名、content-type 双轨判定）、`file-download.ts`（`parseDownloadFilename`、`saveBlobAsFile`）、`search-result.ts`（`toShanghaiDate`、`splitSnippet`、`formatResultDate`）。会话搜索与文件搜索的结果行因此是同一套高亮与日期口径。
4. **`features/workspace` 承载页面逻辑与渲染，`pages/workspace` 只做装配。** `lib/file-format.ts` 的 `formatFileSize`/`formatRelativeTime` 与参照逐值一致（1024 进制、整数不留小数位；相对时间档位 44s/89s/44min/89min/21h/35h/25d/45d/10M/17M 与中文串「几秒前」「3 天前」同参照的 dayjs `fromNow()`）；`lib/workspace-view.ts` 拥有快速访问定义、面包屑（根是「全部文件」）、行视图与选中集修剪；`model/use-workspace-browser.ts` 是页面控制器（目录、选中与多选、预览与编辑缓冲、上传/新建/删除/保存编排、陈旧响应守卫，通知走注入回调）。
5. **高亮与快速访问按参照口径**：快速访问项只在**严格同层**时高亮（`isSamePath`），因此进入 `/agents/skills/` 时没有任何一项高亮；「个人空间」根项在快速访问子树下让位给快速访问项。
6. **预览面板常驻、宽度在 0 与设定值之间过渡**（`transition: width .28s`），拖拽区间 30–70%，拖拽期间关掉过渡；分隔条用原生 `<hr aria-orientation="vertical">`。
7. **上传只拦文件数**：`MAX_UPLOAD_FILE_COUNT = 50` 是后端契约常量，前端超量时给「一次最多上传 50 个文件」且不发请求；单文件大小、重名、回滚都由后端拒绝，前端只透传文案。
8. **内容被服务端截短过的文件不给编辑**（`truncated` 为真时关掉编辑入口）：参照没有这条守卫，但它的编辑缓冲会把截断内容写回去，属于会丢数据的路径。
9. **显式偏离参照**（逐条记录，不做隐式近似）：

| 参照行为 | 本仓做法 | 理由 |
|---|---|---|
| 文件搜索与会话搜索共用一个双模式模态 | 页面内独立的文件搜索弹窗 | 本仓会话搜索已是独立实现（`features/chat/ui/global-search-modal.tsx`），合并会改对话切片 |
| 搜索选中文件后跳 `/workspace?open=<path>` | 页内直接进入父目录并预览，不做 URL 深链 | 本仓全局搜索只有会话模式，没有跨页文件深链的生产者 |
| 预览头部把沙箱虚拟路径显示为 `~` | 显示工作区相对路径（`/agents/AGENTS.md`） | 表与面包屑用的就是工作区路径，同一屏两种路径反而绕 |
| HTML 预览的缩放控件与「预览 / 源码」切换 | 只做沙箱 iframe 渲染 | 两者各带一整套状态，本切片不做 |
| office（`.docx/.pptx`）经 LibreOffice 转换后内嵌预览 | 给不支持的下载提示 | 转换依赖服务端可选能力，参照在该能力缺失时的表现与此一致 |
| 知识库只读浏览（我的知识库 / 共享知识库） | 不做 | 属于知识域：需要可访问知识库客户端、`/api/workspace/knowledge/*` 三条端点、虚拟目录与 100/300/500 分页、整页只读态，留作后续切片 |
| 只按 `editable`、`supported` 与后缀开放编辑 | 内容被服务端截短过（`truncated`）时不给编辑入口 | 参照没有这条守卫，但它会把截断内容原样写回服务端，属于会丢数据的路径 |
| 未来时间显示「N 分钟后」等一套未来串 | 夹到「几秒前」 | 文件表里出现未来时间（时钟偏差、跨机落盘）是异常，给更少的状态比多一套文案合理 |
| 列表与预览的失败文案是固定串（「加载个人空间目录失败」等） | 同一句兜底文案，但优先显示后端给的 `detail` | 与仓内其它切片同口径：`describeFailure` 让「为什么不行」可见 |

不造：重命名、移动、刷新按钮、列排序、个人目录分页、上传进度条——参照与后端都没有对应能力。

## 替代方案

**只在 `features/workspace` 内部再写一份 workspace 端点。** 改动面最小，但个人空间条目归一与端点参数会出现两份实现，改一处必漏一处；本仓在智能体读取上已经明确拒绝过同一形态。

**把 workspace 与 viewer 两套都收进 `entities/workspace`。** 能合并更多代码，但 viewer 是线程沙箱域（`thread_id` 作用域），挂进「个人空间」这个业务名词下会让人按错误的域去读它。

**本切片一次把知识库只读浏览也做掉。** 一屏对齐度更高，但体量接近翻倍，且它属于知识域；混在一起会让「个人空间读写归属」这条决定被知识库的分页与虚拟目录语义稀释。

**用全局 store 或纯 RQ 缓存代替页面控制器。** 参照是命令式加载加请求序号守卫，页面的目录、选中、预览脏值彼此耦合；本仓只有一个消费者，引入全局态只会多一处需要同步的事实。

**沿用阶段一的朴素渲染直接进视觉对齐。** 阶段一的渲染只用来证明逻辑接得通（`web/tmp/ws-phase1-light.png`），结构与参照差得远；直接在其上改会让「哪一处是参照值、哪一处是临时值」无从分辨。

## 后果

- **对话页面板的行为不变**：`features/chat` 的 workspace 分支现在委派 `entities/workspace`，`panel-filesystem`、`panel-preview`、`workspace-path-picker` 与四个既有测试文件全部通过；`features/chat/index.ts` 不再导出 `pathBreadcrumbs`（消费者改从 `@/shared/lib` 引）。
- **`web/steiger.config.ts` 增加两条 `fsd/insignificant-slice` 例外**（`features/workspace`、`entities/workspace`，各自带理由），与既有 `features/agents`/`entities/agent` 同口径。
- **已知未收敛的重复**：`features/knowledge-base/lib/knowledge-files.ts` 有自己的 `parseDownloadFilename` 与预览类型判定。它们是知识域自己的实现，本切片没有消费者需要合并；若要收口，条件是有第二个知识域消费者出现。
- **参照的 leave 动画被简化**：面板常驻、宽度过渡，内容在关闭时立即卸载，没有参照的 240ms 内容保留。
- **窄屏下外壳侧栏仍占宽**：390px 时内容区被外壳侧栏挤到约 190px，页面本身不溢出（标题单行、表格按 767px 断点上下堆叠），但可用宽度要靠外壳的折叠按钮让出来。

## 验证

**单测与门禁（本机 `~/nvm` 的 Node 26；容器镜像里的 `oxlint.config.ts`/`steiger.config.ts` 是构建时的旧副本，结构类门禁因此在本机跑）**

| 命令 | 结果 |
|---|---|
| `NODE_ENV=test vitest run` | 201 个文件、2247 个用例通过；`test/unit/features/model-providers/model-provider-panel.test.tsx` 在装载阶段失败（`@emoji-mart/data` 的 JSON 需要 import attribute），与本次改动无关，单独计为未通过 |
| `tsc --project tsconfig.json --noEmit` | 通过 |
| `oxlint src` | 0 error，25 warning（与基线同数；本切片新增文件 0 warning） |
| `steiger ./src` | No problems found |
| `depcruise "src/**/*.{ts,tsx}"` | 475 模块、1550 依赖，无违规 |
| `node scripts/check-design-tokens.mjs` | 通过 |
| `prettier --check .` | 通过 |
| `vite build --base=/` | 通过 |
| `python3 scripts/verify_engineering_contracts.py` | 2 个既有错误（`2026-10-12-chat-antd-controls*.md` 的 Owner 指向已删除的 `web/src/features/chat/ui/antd-button.tsx`），非本切片引入 |

**相对时间与参照的等价性**：`formatRelativeTime` 逐档照抄 dayjs `fromNow()`（zh-cn）的档位表与单位取差规则，并用参照自己 `node_modules` 里的真实 dayjs 做过比对——0 秒到 6 年之间按秒/分/时/天/小时密集取样加逐日取样共 498231 个时刻，**0 处不一致**。比对用的临时脚本与 fixture 不入库（依赖参照仓库路径）。两处只有比对才能发现、单靠读文档会漏掉的缺陷已在此过程中修掉：`yy` 档少写单位导致 540 天显示「18 年前」、未来时间取绝对值后与文档不一致。

新增用例：`test/unit/entities/workspace/workspace-api.test.ts`（16 例：归一负向案例、端点字段名、上传请求体、下载文件名）、`workspace-mutations.test.tsx`（5 例：四个写入各自失效 `WORKSPACE_QUERY_ROOT`，失败不失效）、`test/unit/pages/workspace-page.test.tsx`（8 例：页头与侧栏装配、`/agents` 才有「使用说明」、删除确认的三段文案、960px 两侧的预览形态）、`test/unit/app/router-workspace-route.test.tsx`（1 例：`/workspace` 挂的是真实页面而不是占位）、`test/unit/features/workspace/workspace-ui.test.tsx`（12 例：表格列与空态、多选入口、行菜单不冒泡、侧栏高亮口径、预览编辑条）、`test/unit/features/workspace/file-format.test.ts`（6 例：大小与相对时间档位边界 44s/89s/22h/26d/18 个月、可编辑后缀）、`workspace-view.test.ts`（9 例：面包屑、快速访问口径、行视图、选中修剪）、`use-workspace-browser.test.tsx`（19 例：陈旧响应不落地并回收 URL、截短内容不可编辑、无改动不发保存、删除预览中的文件或祖先时关预览、超量上传拦截、空文件夹名拦截、下载目录不发请求）、`test/unit/shared/*`（25 例，含从 chat 迁出的用例）。定向变异验证：去掉截短守卫、去掉请求序号守卫、去掉祖先判定、去掉 50 上限、去掉脏值判定时，对应用例分别变红。

**真实页面走查（zwj 登录、真实后端 `localhost:5173`、真实数据）**

- 首屏：`/` 列出 `agents/`（13 分钟前）、`projects/`（20 小时前）；面包屑「全部文件」为当前层且不可点；「2 项」与四列名与参照一致。
- 快速访问「智能体文件」→ `/agents/`：`skills/`、`AGENTS.md`（54 B）、`MEMORY.md`（54 B）、`USER.md`（45 B），相对时间「3 天前」「13 天前」。
- 目录进入与面包屑回退：点 `agents` 行 → 面包屑「全部文件 / agents」；点「全部文件」→ 回到根列表。
- 预览：`/agents/AGENTS.md` 头部显示工作区路径 + 编辑 + 全屏 + 关闭，正文按 markdown 渲染出「AGENTS / 以下是约束 Agent 行为的一些要求」。
- 新建文件夹：`tmp-阶段一验证` → `GET /api/workspace/tree?path=/agents/` 出现该目录，行时间「几秒前」，提示「文件夹创建成功」。
- 删除：确认框文案「确认删除文件夹「tmp-阶段一验证」？」+「将删除文件夹及其所有内容，删除后不可恢复。」→ 后端列表不再含该目录，提示「删除成功」。
- 上传：把 `tmp-verify-note.md`（38 字节）投到文件输入 → 后端出现该文件，提示「1 个文件上传成功」（系统文件选择框在 IAB 里不可驱动，因此以 `input.files` + change 走同一处理器）。
- 编辑保存：改内容后头出现「未保存」→ 保存后 `GET /api/workspace/file` 返回新内容，提示「文件保存成功」，「未保存」消失。
- 多选与批量删除：多选开启后出现复选列与「删除选中」；勾选一条时确认框按参照同条件（`length > 1` 才算批量）给单条文案，删除后列表与后端恢复原状。
- 搜索：页头「搜索」打开 680px 弹窗，输入 `AGENT` 得 3 条结果（`/agents/AGENTS.md`、`MEMORY.md`、`USER.md`），命中处高亮、右侧日期「10月2日」。
- 侧栏下拉：`上传文件` 下拉含「上传文件」「新建文件夹」两项；新建弹窗占位「请输入文件夹名称」、按钮「取消 / 创建」。
- 对话页右侧面板「个人空间」tab：树加载 `agents`/`projects`，展开 `agents` 懒加载出 `skills`/`AGENTS.md`/`MEMORY.md`/`USER.md` —— 迁移后行为不变。
- 视觉核对截图（本地台账，gitignore）：`web/alembic/pages/workspace/evidence/phase2-light-1440x900.png`、`phase2-light-preview-1440x900.png`、`phase2-dark-1440x900.png`、`phase2-narrow-light-390x844.png`、`phase2-narrow-dark-390x844.png`、`phase2-search-light-1440x900.png`。

**独立评审**：按仓库约定由不继承开发上下文的新 Reviewer 审完整需求、diff、测试与规范。首轮结论「needs work，无结构性问题」：其中两处阻断项（未来时间取绝对值与文档不一致、`yy` 档缺单位）与两处证据缺口（缺页面/路由用例、缺写入失效用例）已按上面的方式修复或补齐，其余为记录准确性（参照行数、偏离未登记）与两处并发小问题（删除期间切换预览时按陈旧路径判定、两次删除互相清掉彼此的「删除中」标记），都已改并由新增用例兜住。

**未验证范围（不计为通过）**

- `/saved_artifacts` 有数据时的形态（当前是空目录，只验了空态）。
- 单文件超过 100 MB 的上传失败态、上传重名冲突的失败态（后端拒绝路径，前端只透传文案）。
- 窄屏下的拖拽（<960px 走模态，不触发分隔条）。
- HTML 预览的缩放与源码切换、office 内嵌预览（本切片不做，见偏离表）。
- 系统文件选择框路径（IAB 不支持文件选择，上传走 `input.files` 直投）。
