# Web 架构（Feature-Sliced Design）

本文拥有 `web/` 的分层规则：代码属于哪一层、切片怎么切、依赖允许怎么走。视觉与 token 规则由[设计规范](../docs/develop-guides/design.md)拥有，任务入口与提交前门禁见 [AGENTS.md](./AGENTS.md)。

## 采用范围

FSD 是一套组织代码的约定，不绑定框架。本项目采用其中五层，`widgets` 按需引入，`processes` 不使用。

| 层         | 放什么                                         | 判定问题                     |
| ---------- | ---------------------------------------------- | ---------------------------- |
| `app`      | 路由配置、providers、入口、全局样式            | 应用跑起来需要它吗           |
| `pages`    | 一个页面或一组高度相似页面的组装               | 它对应一条路由吗             |
| `widgets`  | 跨页面复用的大型自包含 UI 块                   | 它在多个页面出现且自成一块吗 |
| `features` | 用户能做的、可复用的交互                       | 这是用户要做的一件事吗       |
| `entities` | 业务实体及其数据、展示与请求                   | 它是业务里的一个名词吗       |
| `shared`   | 与业务无关的底座：UI kit、API 客户端、库、配置 | 换个产品它还能用吗           |

`widgets` 在出现真实的跨页面复用之前不建目录。不被复用的大块留在所属页面内。

## 切片与分段

`pages`、`widgets`、`features`、`entities` 四层先按业务域切 **slice**，再在 slice 内按技术目的切 **segment**：

```text
src/features/chat/
├── index.ts       # public API：这个切片对外暴露的全部接口
├── ui/            # 组件与样式
├── model/         # 状态、校验、业务规则
├── api/           # 与这个切片相关的请求
└── lib/           # 只有这个切片用得上的工具
```

`app` 与 `shared` 没有业务域，直接分 segment，内部可以自由互相引用。

分段名描述**目的**。`components`、`hooks`、`types`、`utils` 描述的是本质，检索时帮不上忙，不使用。

段内文件变多时可以再分子目录，判据是**职责或引用簇**而不是文件数：互相引用、对外只有一个入口的一组放一起（`ui/files/table/`），同一类界面物放一起（`ui/files/dialogs/` 收全部弹窗）。只装一个文件的子目录是允许的。文件名保留原有前缀（`table/file-row-actions.tsx`），移动目录时不改名。

**写操作不属于 `ui/`**：`mutate`、确认框、通知文案、分批与门禁这类编排放在 `model/` 的 `use-*.ts` 里（`model/use-file-actions.ts`），组件只把视图事实喂进去、把回调接上。

## 依赖规则

1. 一个模块只能导入**严格更低**层的模块（`pages` → `widgets` → `features` → `entities` → `shared`）。
2. 同一层内，不同 slice 之间不得互相导入。
3. 同一个 slice 内部可以自由互相导入。
4. 跨切片引用只走对方的 public API（`index.ts`），不深入其内部路径。

实体之间的关系（例如一条消息引用一个附件）需要跨切片时，用 `@x` 记号显式开一个交叉引用入口，读作「A crossed with B」：

```text
src/entities/message/
├── @x/thread.ts   # 只给 entities/thread 用的入口
└── index.ts       # 常规 public API
```

`@x` 只用在 `entities` 层，并且保持最小。

## 目录现状

`src` 之外的 `openapi.json`、`openapi-ts.config.ts`、`steiger.config.ts`、`scripts/` 属于工具链，不受分层规则约束。

```text
src/
├── app/                     入口、全局 provider 装配、路由、应用外壳
│   ├── main.tsx             createRoot 入口
│   ├── index.tsx            全局 provider（查询客户端、错误边界、通知）
│   ├── layouts/app-shell.tsx  登录后的外壳：导航列 + 内容区
│   └── routing/{router.tsx, guards.tsx, protected-route.tsx}
├── pages/                   页面切片，各带 index.ts
│   ├── login/  {index.ts, ui/login-page.tsx}
│   └── chat/   {index.ts, model/{use-chat-submission.ts, use-chat-thread-lifecycle.ts},
│                ui/{chat-page.tsx, chat-page-view.tsx}}
├── widgets/                 跨页面复用的自包含块
│   └── app-sidebar/         {index.ts, lib/{nav-items.ts, sidebar-preference.ts},
│                             ui/{app-sidebar.tsx, sidebar-brand.tsx, user-menu.tsx}}
├── entities/
│   └── session/             {index.ts, api/session-api.ts, model/{session.tsx, capabilities.ts}}
├── shared/
│   ├── api/                 {index.ts, base.ts, generated/}
│   ├── config/              {index.ts, paths.ts, links.ts}
│   ├── lib/                 {index.ts, utils.ts, react-query.ts, hooks/}
│   └── ui/                  UI kit、通知中心、Head、日夜切换控件
├── index.css  styles/       Tailwind 与 token 的工具链固定点，按 app 层语义使用
└── main.tsx 之外的工具链文件见上
```

两处不随目录整齐移动的固定点：`src/index.css` 与 `src/styles/` 被 `components.json`、`vite.config.ts` 与 `scripts/check-design-tokens.mjs` 引用；测试设施放在 `web/test/`，由[测试规范](../docs/develop-guides/testing-guidelines.md)拥有，不属于运行时分层。

跨 widget 切片的导入被 Steiger 的 `fsd/forbidden-imports` 拒绝；只被单个 widget 使用的切片还会被 `fsd/insignificant-slice` 拒绝。用户菜单因此留在 `widgets/app-sidebar` 内，没有拆成独立切片；它在多个页面真正复用之前不再拆出。

## 门禁

上一节的规则由两个检查器分工强制，职责不重叠：

| 检查器                                                              | 负责                                                                        | 命令                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------- |
| Steiger（`steiger` 0.7.0 + `@feature-sliced/steiger-plugin` 0.8.0） | FSD 结构规则：层间导入方向、同层切片隔离、跨切片只走 public API、段名与层名 | `pnpm run lint:fsd`   |
| dependency-cruiser                                                  | 循环依赖；契约生成物的两条边界（只允许 api 段引用、不得反向引用手写层）     | `pnpm run arch:check` |

Steiger 的 19 条规则覆盖了 `.dependency-cruiser.cjs` 中手写的三条 FSD 近似规则，后者已被删除，避免两套引擎对同一件事各报一次。Steiger 用 `tsconfck` 读取 tsconfig，`@/` 别名能正确解析；配置在 `web/steiger.config.ts`，忽略契约生成物。

规则、豁免路径与目录结构是一组联动的固定点。`scripts/verify_engineering_contracts.py` 的 API 边界检查与 `.dependency-cruiser.cjs` 都按 api 段判定豁免，改目录或改检查器时三处要一起动；任何一处不同步，对应检查就会静默失效。

## 分片进度

分层与门禁已就位，业务内容按分片推进：

- `features/chat` 已可用：线程历史、流式订阅与续传、消息渲染（思维链、工具调用与过程折叠）、
  Markdown 渲染（含公式与代码高亮）、
  审批与提问交互、排队请求的插队/取消、队列继续与逐条请求的事件流订阅（派发后自动切到 run
  流），以及 `/agent` 首次发送时的惰性建线程；另外还有输入草稿（按线程落 localStorage）、
  图片发送（`image_content`，服务端压缩）、工具审批模式选择（线程 metadata 与本地偏好）、
  会话列表的运行态与未读（12 秒低频同步 + 标记已读）、全局会话搜索（侧边栏入口）与
  上下文用量卡片（消费 `agent_state` 与线程 state）。
  `pages/chat`、`widgets/app-sidebar` 与侧边栏的历史会话列表是它的消费方。
  读可变外部状态的订阅 hook（`useThreadRuntime`、`useStreamingMessages`）必须标注
  `'use no memo'`：React Compiler 会把「容器身份不变、内容就地变」的派生冻结在首帧。
- 测试设施在 `web/test/setup-tests.ts` 里补了 jsdom 缺的 `matchMedia`、`ResizeObserver` 与
  指针捕获/`scrollIntoView`：`matchMedia` 服务日夜切换与首页的动效降级，`ResizeObserver`
  服务知识库图谱画布与数据总览图表，指针捕获与 `scrollIntoView` 服务 Radix 的 Select
  （缺了在测试里点不开下拉）。
- `features/knowledge-base` 承载知识库管理：列表、新建/编辑表单、详情页的文件表（目录进入与
  面包屑、状态筛选、当前页按列排序、服务端分页、刷新与空态）与文件名搜索弹窗，以及查询层
  （`api` 段按 `backend/server/utils/knowledge_response.py` 的序列化形状手写类型，因为后端这些
  端点没有 response_model）。`pages/extensions` 与 `pages/knowledge-base` 是它的消费方。
- 文件表的目录位置有两种：实体目录用 `parent_id`，虚拟目录（来源路径的投影，没有实体记录）用
  「父目录 id + `path_prefix`」，把虚拟目录当实体目录发给后端会被拒（400）。面包屑每一节都要
  自带这两个字段，否则回到虚拟层时会掉回它的父目录。
- 文件表的位置、状态筛选与页码由页面持有（`model/file-view.ts` 的 `openLocation`），表格通过
  `onViewChange` 上报：搜索命中也会改位置，页码留在表格内部会带着上一层的页码去查新目录。
  切目录或翻页期间表格保留上一份数据（`keepPreviousData`），因此必须同时显示加载态并禁用行内
  入口，否则旧行会被当成新目录的内容。
- 状态筛选是跨目录查询：后端在 `status` 不为 `all` 时忽略 `parent_id` 与 `path_prefix`，因此
  筛选态用「跨全部目录筛选」替换路径导航，并在改状态、改位置时互相归位，避免界面显示的路径与
  列表内容矛盾。
- 表格是 `@tanstack/react-table` v9（无头表格，对应上游的 `a-table`）：v9 把排序这类可选能力
  做成「特性槽」，不注册 `rowSortingFeature` 就没有排序状态与方法；核心行模型自动存在，
  v8 的 `getCoreRowModel()` 已移除。
- 写入口（下载、解析、入库、重新入库、移动、删除与批量）由 `lib/knowledge-files.ts` 的能力
  矩阵决定（例外：目录的删除只看只读与「有操作在飞行中」，目录没有解析/入库状态），
  只读知识库不渲染选择列与写入口；有操作在飞行中或表里还是上一个目录的行
  （`keepPreviousData` 期间）时行内入口一律禁用。选择与它所属的视图键（位置/筛选/页码/页长）
  绑定，翻页或换目录后自动失效。
- 移动只写 `parent_id`，因此候选只能是实体目录：虚拟目录是文件名里路径的投影、没有实体记录，
  选它只会把文件移到它的父目录。目标与当前位置相同时不给确认（后端是幂等更新，会返回成功）。
- 上传：`ui/files/dialogs/file-upload-dialog.tsx` 负责界面与队列，判定与参数组装在 `lib/knowledge-upload.ts`
  （白名单来自 `/files/supported-types`；需要 OCR 的集合是后端 `OCR_FILE_EXTENSIONS` 去掉 `.pdf`，
  而 `ocr_engine` 每批都随参数提交——Office 解析需要它），登记走
  `POST /documents` 的三阶段 ingest。上传成功后新记录由后台任务建立，列表靠查询的函数式
  `refetchInterval`（处理中的行 + 刚上传后的一分钟窗口）自己刷新，不做上传字节百分比。
- 检索测试与共享：`ui/query/query-test-panel.tsx` 用后端 `/query-params` 下发的默认值组装参数，
  失败（200 + `{status:'failed'}`）在 api 层折成异常后按失败提示；结果区分「格式化 / 原始 JSON」
  两态，示例问题打乱后只取 10 条、点一行直接检索，「生成示例问题」是写操作（`POST /sample-questions`）
  因此只给 `can_manage`（面板收 `readOnly`）。`ui/share-config-dialog.tsx`
  承载 `share_config` v2 的读/管两个范围，纯规则在 `lib/share-config.ts`，保存走
  `PUT /databases/{kb_id}`（该端点要求名称与描述齐全）。
- 文件详情与预览：位置由 `ui/files/dialogs/file-detail-dialog.tsx` 持有三个视图（源文件 / 解析结果 / 分块），
  预览类型以**后端返回的 `preview_type` 为准**（`lib/file-preview.ts` 的按路径判断只在响应没给
  类型时兜底），二进制预览走 `/api/workspace/knowledge/file` 的 inline 流与 `X-Ars-Preview-Type`。
  代码高亮与正文共用 `shared/markdown/render.ts` 的高亮器（`renderCodeBlock`）。
- 知识图谱用 G6 v5（`ui/graph-canvas.tsx`）：节点配色从 `tokens.css` 取，token 是通道三元组，
  因此只能写 `rgb(var(--token))`——直接 `color: var(--token)` 会被 CSS 引擎丢掉（节点全黑）。
  v5 的 d3-force 选项是**平铺**的（`link` / `manyBody` / `collide` / `center`），上游写在
  `force: {...}` 里的参数会被静默忽略，布局退化成挤在一起的一团。主题切换时旧实例要在
  `render()` 落地后再销毁，否则会看到「graph instance has been destroyed」与 `draw` 读未定义；
  也不能用 `stopLayout()` 收尾——没有布局在跑时它抛错，StrictMode 的双次调用必中。
  视口用 `fitView({ when: 'overflow' })` 再 `fitCenter()`，对小图只 `fitView()` 会放大到失真。
- 知识导图用 markmap：实例绑在具体的 `<svg>` 元素上，元素重新挂载就必须换实例，所以元素用
  state 持有（`ref` 回调只在一侧触发时会出现空白画布）；`markmap-view` 与 `markmap-lib` 走
  动态 import，知识库分包里不含它们（约 72 kB 的独立分包）。
- RAG 评估与评估基准（`features/knowledge-base` 的 `evaluation-*`）：11 个端点都返回
  `{message:'success', data}` 信封，api 段统一解包；下载只在数据集 `completed` 时给，否则后端
  返回 400。运行列表的进度、耗时与「仅看错误」判定（`score <= 0.5 || recall@k < 0.3`）在
  `lib/evaluation-view.ts` 里与后端同口径，`null` 与缺字段按「没有数据」处理而不是 0。
- 调试面板（`features/debug`）有两个入口：侧边栏用户菜单与 Ctrl/Cmd+Shift+D 全局快捷键，都只对超管
  生效（授权仍由后端 `get_admin_user` 兜底），共用 `model/debug-panel-store.ts` 的同一个开关；
  面板由 `app/layouts/app-shell.tsx` 挂载一次，只对超管渲染。四个页签是系统日志、系统配置、
  用户与会话、本地存储。凭据不外泄——
  `readStorageItems` 把 `ars_access_token` 的值清空、预览写成「已隐藏」，复制与导出都跳过它。
  日志行的 React key 必须带序号：真实日志里同一秒会出现完全相同的整行，只按原文做 key 会
  触发 React 重复 key（真机实测 75 次告警）。级别多选至少留一个，
  一个都不选时后端不过滤级别，会白读整份日志而界面全空。配置页与上游一致是只读的：写配置要按
  `_config_items[key].type` 提交布尔/数组等真实类型，属于后端管理动作。切换身份先二次确认，
  成功后写回凭据再整页重载，失败时不动当前凭据；后端禁止模拟超管（403），所以其他超管那一行
  不给入口。
- LITE 模式的能力降级只读 `/api/system/discovery` 的 `capabilities.features.knowledge`：扩展页隐藏知识库
  tab，导航列的扩展项保留但文案从「知识库 · 技能」改成「技能」（技能在 LITE 下仍可用），
  知识库深链由 `routing/guards.tsx` 的 `RequireKnowledgeEnabled` 兜底——投影未取到
  时显示加载态，声明为 `false` 时重定向到 `/agent`。请求失败（没有 `data`）不算能力关闭，
  页面照常渲染让故障显式暴露；响应形状与契约不符时在渲染期报错并落到应用级错误边界
  （`entities/session/model/capabilities.ts` 的同一取值在全应用都是这个行为）。
- 模型供应商（`features/model-providers`，入口 `/agent-manage?tab=providers`，仅管理员）：api 段把
  后端 `to_dict()` 明文返回的 `api_key` 折成 `has_api_key`，**密钥不回显**；表单留空＝不改动，
  「清除已配置的 API Key」勾选后才显式下发 `null`（后端只认显式 null）。默认模型的删除/停用/移除
  保护在前端收口，后端没有这条守卫；系统配置读不到时保护不可验证，删除与停用改为二次确认而不是放行。
  远端候选折成已启用模型时要带上 `context_length` 与 `supported_parameters`，编辑模型走「原对象 +
  表单字段」合并——后端 `_normalize_model_item` 保留未知字段，整对象替换会静默抹掉它们，面板的
  「上下文」列随即变空。上游的品牌图标 CDN 与 models.dev 目录都不引入。
- 技能（`features/skills`，入口 `/extensions?tab=skills` 与 `/extensions/skill/:slug`）：两个列表端点的
  字段不同不能混用——卡片投影给 `source_scope` 但没有 `dir_path`，管理投影给 `dir_path` 与
  `share_config` 但没有 `source_scope`；上游的 `refresh_personal` 后端不认，不发。共享设置的纯规则与
  表单在 `shared/`（知识库弹窗与技能详情共用），因为 FSD 禁止同层切片互引。代码管理用 `Textarea` +
  Markdown 预览，不引入编辑器依赖；详情页比上游多一个「删除文件」入口（后端有该端点），根目录
  `SKILL.md` 不给删除（后端 400）。安装流只保留 `draft` 与 `remote` 两个入口——上游的推荐套件
  `suite` 是上游品牌内容，未移植；取消与关闭必须丢弃草稿，整份草稿零成功时前端补删一次（后端只在
  有成功项时清草稿）。批量删除按后端 `max_length=50` 在界面先拦。批量模式下个人技能卡仍渲染但
  不可选（上游直接隐藏个人组）。依赖候选用常驻复选框而不是下拉。远程安装依赖沙盒与出网，
  不可用时按失败呈现。
- 数据总览（`features/dashboard`，`/dashboard`，仅超管；`overview` 与 `threads` 两个视图懒激活）：
  ECharts 只按需注册 bar/line/pie 与 grid/tooltip/legend/dataZoom + canvas，不引 `echarts-for-react`；
  产物里它只落在 dashboard 的路由分包里。canvas 不认 `var(--x)`，配色从 `tokens.css` 解析成具体色值；
  实例由 `ResizeObserver` 在拿到非零尺寸后创建（隐藏视图里的 0 尺寸画布不会自己长回来），主题切换
  重建实例。知识库统计端点只在知识域启用时注册，面板按能力投影挂载且查询另有 `enabled` 闸，
  避免 404 被当成页面错误。
- 其余页面（个人空间、智能体管理的智能体 tab、扩展页的工具与 MCP tab）仍是占位；它们的行为事实
  还没进本仓。

切片进度与验收证据见[前端 React 迁移设计](../docs/develop-guides/decisions/implemented/2026-10-01-web-react-migration-design.md)。
