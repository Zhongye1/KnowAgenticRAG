---
title: ARS 前端 React 迁移设计
description: 把上游 Vue 前端实现迁移到 React 的目标架构、契约流水线、迁移规则与分片验收标准
---

# ARS 前端 React 迁移设计

状态：proposed
类型：architecture
Owner：docs/develop-guides/design.md

## 问题

后端已经整体替换为 `ars` 实现（`/api`，无版本段、无响应信封），`web/` 尚不存在，`frontend/` 处于冻结状态：它调用旧后端的 `/api/v1/*` 与统一信封，任何页面都取不到数据。上游 Vue 实现（`Yuxi` 仓库的 `web/`，一次性参照，导入后不建立跟踪关系）是当前唯一完整的前端形态。

需要在这套参照之上重新落地一个 React 前端，并同时回答五个问题：组件库走哪条路线、API 契约如何与 257 个端点保持同步、聊天流式谁来拥有、JavaScript 到 TypeScript 怎么收敛、新目录与既有工程门禁如何对齐。

`frontend/FROZEN.md` 记录的既定后续是「导入上游 `web/`（Vue 3 + Vite）并全量改名」。本文替换该计划，前端技术栈改为 React。

## 提案

### W1 目标形态

新前端落在 `web/`。仓库壳已经为该目录预留了位置：`scripts/verify_engineering_contracts.py` 为 `web/AGENTS.md` 设了 1000 字符预算、为 `.github/workflows/web.yml` 设了工作流契约（要求 `web/**` 存在并执行 `pnpm run lint:check && pnpm run test:unit && pnpm run build`）、`_validate_web_api_boundary` 约束 `web/src/apis` 之外的 API 字面量，根 `AGENTS.md` 的前端证据行链接 `web/AGENTS.md`。

`frontend/` 在 S5 结束后删除，`docs/develop-guides/design.md` 的「技术栈约束」在同一变更中改写。

### W2 组件库路线

全量采用 shadcn/Radix + Tailwind 4，直接继承 `frontend/` 的组件底座与工程设施。上游的 ant-design-vue 不引入 React 对应版本。

上游的 antd 用量决定了这条路的成本主体：65 个文件 import、模板中 946 处 `<a-*>`、`Modal.confirm` 26 次调用分布在 19 个文件，并且上游没有 antd 二次封装层，调用点无法从单一位置拦截。

全量直方图已完成，946 处分三档：

| 档 | 处数 | 占比 | 内容 |
| --- | --- | --- | --- |
| 有 shadcn 对位 | 725 | 76.6% | button 239、input 74、tooltip 54、modal 44、tag 42、select-option 33、menu-item 33、spin 29、select 26、dropdown 22、textarea 18、switch 15、menu 13、col 13、checkbox 12、tab-pane 11、space 8、row 7、divider 7、tabs 5、card 5、badge 3、popover 1、pagination 1、drawer 1、skeleton-button 1、config-provider 1 |
| 需要组合或自研 | 200 | 21.1% | form-item 88、empty 22、input-number 18、form 18、alert 16、input-password 12、segmented 7、result 5、progress 5、collapse 4、popconfirm 2 等 |
| 重量级 | 21 | 2.2% | table 12、upload 6、tree 1、tree-select 1、date-picker 1 |

两个发现压低了这条路的估算。其一，上游没有使用 antd 的校验引擎：`validateFields` 调用 0 次、`:rules=` 绑定 10 处、`:model=` 绑定 8 处、`formRef.value.*` 调用 2 处，因此那 107 处 `a-form` / `a-form-item` 承担的是 label 与错误文案的布局，校验逻辑位于下游的纯 JS 工具。其二，`message.*` 的真实调用为 445 次（`error` 253、`success` 125、`warning` 48、`info` 13、`destroy` 4、`loading` 2），一个通知中心即可全部承接；原始 grep 的 493 次命中里有约 48 次是聊天消息对象的属性访问。

重量级组件集中且可点名：`a-table` 出现在 10 个文件、周边代码 8495 行，`a-upload` 出现在 6 个文件、周边 6220 行，`a-tree` / `a-tree-select` / `a-date-picker` 各 1 处且集中在 `FileTreeComponent`、`FileUploadModal`、`ApiKeyManagementComponent` 三个文件。这 16 个文件按文件估算，不按标签数估算。

组件映射按类别推进，逐调用点重写：

| 上游用法 | 目标 |
| --- | --- |
| `a-button` / `a-tag` / `a-tooltip` / `a-dropdown` / `a-spin` | shadcn Button / Badge / Tooltip / DropdownMenu / Spinner |
| `a-modal` + `Modal.confirm` | shadcn Dialog + 自研命令式 confirm |
| `a-input` / `a-textarea` / `a-input-number` / `a-form` / `a-form-item` | shadcn Form + react-hook-form + zod |
| `a-select` / `a-select-option` | shadcn Select |
| `a-menu-item` | DropdownMenu / Sidebar |
| `a-empty` | 自研 Empty（含「下一步做什么」文案） |
| `message.*` | 通知中心（zustand store） |
| `a-table` | `@tanstack/react-table` 9.2.4 + 自研样式（排序、固定列、展开） |
| `a-upload` | 自研 Upload（上游对应 `FileUploadModal.vue` 2012 行） |

### W3 「样式不变」的定义

上游的项目自有样式只有 2023 行（12 个文件），最大一个 `extensions.less` 838 行；颜色、间距、圆角由 `base.css`（149 条变量）与 `base.dark.css`（145 条覆盖）承载，组件视觉主要由 antd 提供。

因此本次迁移承诺的「样式不变」限定为三条：设计 token 不变、布局与信息层级不变、交互语义不变。组件级视觉重新实现，验收以上游同页截图对照。

token 迁移路径：`base.css` / `base.dark.css` 的 CSS 变量映射进 `web/src/styles/tokens.css` 与 `web/src/index.css`，沿用 `frontend/` 已有的结构（`tokens.css` 236 条变量、`index.css` 81 个颜色映射与 `@theme` 声明）。`scripts/check-design-tokens.mjs` 的规则继续生效：禁止硬编码 HEX、禁止非 `var()` 的 `rgb()/hsl()`、禁止 Tailwind 默认调色板类。

### W4 API 分层与契约流水线

生成物垫在手写分层之下：

```text
web/src/apis/
├── generated/                  # 生成物，入库；diff 即契约变更记录
│   ├── types.gen.ts
│   ├── sdk.gen.ts
│   └── @tanstack/react-query.gen.ts
├── base.ts                     # 手写：client 实例、token 注入、401 处理、错误文案
├── auth.ts                     # 手写：登录、当前用户、能力投影
└── agent_api.ts                # 手写薄层：业务语义（提交 run、标题生成 prompt 等）
```

生成器选 `@hey-api/openapi-ts`，钉死 0.99.0。已核实：其插件（`@hey-api/typescript`、`@hey-api/sdk`、`@hey-api/schemas`、`@hey-api/transformers`、`@tanstack/react-query`）内置于主包，不发布同名独立包；独立包只有客户端 `@hey-api/client-fetch`（0.13.1，本次采用）与 `@hey-api/client-axios`（0.9.1）。运行要求 `node>=22.18.0`，TypeScript peer 为 `>=5.5.3 || >=6.0.0`。

client 实例与拦截器同住 `base.ts`：生成物导出的实例在这里 `setConfig({ baseUrl: '' })` 并挂上拦截器（生成器把 baseUrl 默认成输入文件名，必须改回同源相对路径），request 拦截器注入 `Authorization: Bearer`，response 拦截器负责 401 处理与错误文案。生成的 SDK 函数默认使用生成物的 client 实例，配置与拦截器集中挂在这一个实例上；生成物保持默认的 `fields` 返回风格（`{ data, error }`），手写层负责解这层包装并在 `error` 存在时抛 `ApiError`。

鉴权沿用后端契约：只认 `Authorization` 头，JWT 有效期 7 天，API Key 以 `arskey_` 前缀走同一头。新后端没有 refresh 端点，因此 401 的处理是清除凭据并回到登录页，不做重放。

契约源与门禁：

```text
web/openapi.json         # 后端契约快照，入库
openapi-ts.config.ts     # 生成配置
pnpm run api:gen         # 从快照重新生成
```

两条门禁检查两类不同的漂移：生成物漂移（改了契约或后端却忘记重新生成）用 `pnpm run api:gen && git diff --exit-code web/src/apis/generated`；后端漂移（后端改了接口而快照未更新）在 CI 中启动 api 容器 dump `/openapi.json` 后与 `web/openapi.json` 比对。已核实新后端暴露 `/openapi.json`，共 257 个端点、217 条路径。

### W5 LITE 模式的能力降级

`/openapi.json` 的路由面受 `LITE_MODE` 影响：`server/routers/__init__.py` 通过 `knowledge_capability_enabled()` 门控知识库、图谱、评估、知识域 Dashboard、`external_kb` 与工作区知识视图六组路由。

因此规范是：契约快照与生成一律使用非 LITE 的全量面；运行时的能力降级只读 `/api/system/discovery` 的 `capabilities.features.knowledge`，不得用 404 或请求失败作为能力信号。这与根 `AGENTS.md` 的 LITE 不变量一致：该模式不得导入知识解析重运行时。

### W6 聊天 runtime

移植上游手写状态机，保留其全部流式语义，不引入 `@assistant-ui`：

| 上游 composable | 行数 | 目标 |
| --- | --- | --- |
| `useAgentRunStream` | 533 | `web/src/features/chat/hooks/use-run-stream.ts` |
| `useAgentStreamHandler` | 288 | `use-stream-event-handler.ts` |
| `useStreamSmoother` | 347 | `use-stream-smoother.ts` |
| `useAgentRequestQueue` | 179 | `use-request-queue.ts` |
| `useAgentThreadState` | 126 | `context/thread-state.tsx` |

保留的语义：`fetch` + `ReadableStream` 手工分帧（事件名与后端一致，已逐项核对 11 个：`init`、`loading`、`stream_event`、`error`、`agent_state`、`finished`、`interrupted`、`warning`、`context_compression`、`ask_user_question_required`、`human_approval_required`）、`Last-Event-ID` 续传、500ms 重连前先 `getAgentRun` 判定终态、每 run 一个 AbortController、`localStorage['active_run:<threadId>']` 快照（TTL 1 小时）。

唯一需要重新设计的部分是状态宿主。上游依赖 Vue 的细粒度响应式，`ref` 逐字译为 `useState` 会让高频 `delta` 按帧重渲消息树。做法是保留逻辑、替换宿主：流式碎片写入外部 store，组件通过 `useSyncExternalStore` 订阅。`frontend/` 的 `chat-run-store.ts` 已实现同类结构（按 `messageId` 分片、`MAX_RUNS=100`、`MAX_STEPS=50`）。

路由缓存：上游 7 条路由声明 `keepAlive`，由 `<keep-alive>` 实现。React 19.2 提供 `<Activity>`（已核实 `react@19.2.8` 导出该符号），用它保活并隐藏。

### W7 渲染管线复用

以下依赖与框架无关，直接沿用，只重写挂载壳（ref + `useEffect`，并确保 destroy）：

- Markdown：`markdown-it` + `shiki` + `katex` + `dompurify` + `js-yaml`，上游集中在 `utils/markdown_preview.js`（261 行）一个文件，消费组件 `MarkdownPreview.vue` 1129 行。
- 图谱：`@antv/g6`，上游用于 `GraphCanvas.vue`。
- 统计图：`echarts`，上游 5 个 dashboard 组件。
- 思维导图：`markmap-lib` + `markmap-view`。
- PDF：`pdfjs-dist`，worker 引入方式跟随 bundler。
- 单独高亮：`highlight.js`（上游用于文件预览）。

### W8 迁移规则

逐文件直译，规则如下：

| 上游 | 目标 |
| --- | --- |
| `ref` / `reactive` | `useState` / `useReducer`，高频流式数据走外部 store |
| `computed` | `useMemo` |
| `watch` | `useEffect` |
| `onMounted` / `onUnmounted` | `useEffect` 的挂载与清理 |
| `defineProps` / `defineEmits` | props 类型 / 回调 props |
| `defineExpose` | `useImperativeHandle` |
| `defineModel` / `v-model` | 受控 props + `onChange` |
| `<slot>` / `<template #name>` | `children` / 具名 props |
| provide / inject | React Context |
| `keep-alive` | `<Activity>` |
| `lucide-vue-next` | `lucide-react` |
| `@vueuse/core` | `navigator.clipboard` 与自写节流 |

需要机械映射的规模：Vue API 具名导入 474 次（`computed` 131、`ref` 109、`watch` 58、`onMounted` 50、`reactive` 32、`nextTick` 26、`onUnmounted` 24、`h` 13、`inject` 6、`provide` 2 等）、`defineProps` 124、`defineEmits` 56、`defineExpose` 28、`defineModel` 3、`v-model` 271、`<template #name>` 265、`<slot>` 63、`<component :is>` 37、Transition 12、Teleport 6。

TypeScript 化逐文件进行，允许临时宽松类型；迁移期对新增代码打开 `oxlint` 的 `no-explicit-any`（当前为 `off`），分片结束时收敛。

### W9 治理接口

| 位置 | 动作 |
| --- | --- |
| `scripts/verify_engineering_contracts.py` 的 `_validate_web_api_boundary` | 扫描后缀补 `.tsx`；当前只覆盖 `.js` / `.ts` / `.vue`，React 组件里的 `/api` 字面量会漏检 |
| `.github/workflows/web.yml` | 按既有契约恢复，脚本名沿用 `lint:check` / `test:unit` / `build` |
| `web/AGENTS.md` | 新建，沿用上游同文件的约定结构，改写为 React 与本文的规则 |
| `Taskfile.yml` | 新增 `web:*` 目标（容器内 lint / 单测 / 契约刷新 / 全量门禁） |
| `docker-compose.yml` | 恢复 `web` 服务：开发模式挂源码、暴露 5173，代理目标指向服务名 |
| `.pre-commit-config.yaml` | 把「前端本期冻结，门禁另行立项」替换为真实的 lint / typecheck / token 检查钩子 |
| `docs/develop-guides/design.md` | 改写「技术栈约束」三条（样式语言、图标库、UI 基础） |
| `frontend/FROZEN.md` | 随 `frontend/` 删除；其「后续」章节由本文取代 |
| 浏览器级验证 | 本次不引入 Playwright；`frontend/` 的 e2e 配置随该目录删除，新前端的 e2e 在业务分片落地时另立 |

`web/src/apis` 之外不得出现 API 字面量的既有规则与本文的分层天然一致，生成物不拼路径。

### W11 分层规范（Feature-Sliced Design）

`web/` 采用 FSD 的分层约定，规则由 [web/ARCHITECTURE.md](https://github.com/Zhongye1/KnowledgeRAG-OGAS/blob/main/web/ARCHITECTURE.md)拥有：`app`、`pages`、`widgets`、`features`、`entities`、`shared` 六层，其中 `widgets` 在出现真实跨页面复用之前不建目录，`processes` 不使用。切片按业务域划分，段按技术目的划分（`ui` / `model` / `api` / `lib` / `config`），依赖只能向下，同层不同切片互不引用，跨切片只走对方的 `index.ts`。

采纳的时机是这次的窗口期：手写代码约 5,200 行、33 个文件，目录归位可以在一次改动内完成；等到业务切片落地再迁移，成本会随代码量上升。

结构规则的执法由两个检查器分担：Steiger（`steiger` 0.7.0 + `@feature-sliced/steiger-plugin` 0.8.0，要求 node >=22.18，实测二次运行 1.2 秒）负责 FSD 结构规则——层间方向、同层切片隔离、跨切片只走 public API、段名与层名；dependency-cruiser 保留循环依赖与契约生成物的两条边界。Steiger 的 19 条规则覆盖了现有手写的三条 FSD 近似规则，后者在同一改动中删除，避免两套引擎对同一件事各报一次。实测当前树只有两条 Steiger 错误（`src/apis` 的层名、`src/app/provider.tsx` 的段名），正好是这次要改的两处。

目录迁移、检查器规则与豁免路径必须同一次完成——`scripts/verify_engineering_contracts.py` 的 API 边界检查把 `shared/api` 当作唯一豁免子树，`web/steiger.config.ts` 的忽略项与 `web/.dependency-cruiser.cjs` 的规则路径也要同步，任何一处不同步都会让对应检查静默失效。

### W10 分片计划

| 片 | 范围 | 验收 |
| --- | --- | --- |
| S0 | 决策记录、`design.md` 技术栈约束改写、`web/` 骨架与门禁恢复 | `python3 scripts/verify_engineering_contracts.py` 中 web 相关检查从缺失变为通过 |
| S1 | 外壳：vite proxy（`/api` 与 `/minio/public/`）、token 体系、布局导航、路由骨架、鉴权、契约流水线 | 登录成功；空壳页面可导航；257 端点客户端可用；两条漂移门禁生效 |
| F0 | 目录归位到 FSD 分层（`shared` / `entities/session` / `widgets`）；接入 Steiger 并把手写的 FSD 近似规则从 dep-cruiser 迁出；门禁与文档同步 | `pnpm run lint:fsd` 在 `./src` 上零错误；`pnpm run arch:check` 仍拦循环依赖与生成物边界；全部前端门禁保持通过 |
| S2 | 聊天：1,473 行状态机、消息渲染、审批与提问交互、队列与取消；外围已补输入草稿、图片发送、工具审批模式选择、会话列表未读与运行态、全局会话搜索、上下文用量卡片 | 与上游页面逐屏对照；断线续传与取消行为一致。仍未移植：智能体/模型选择、知识库范围选择、引用来源、欢迎页、工具专用渲染、子代理线程视图、文件附件通道、页面重新可见时的队列重订阅 |
| S3 | 知识库：列表（已落地）、详情（上游 1754 行）、文件表（1916 行）、上传（2012 行）；`a-table` 只有 1 处且在被工作区共用的 `FileBrowserTable.vue`，`a-tree` 域内为 0 | 真实上传与解析链路可观测 |
| S4 | 图谱与评估：图 canvas、评估面板（2155 行）、调试面板（2388 行） | 图谱渲染与主题联动 |
| S5 | 管理台与扩展：模型供应商、Skill 列表、Dashboard 图表 | 全站截图对照；删除 `frontend/` |

不搬迁的旧表面（上游实测 0 引用）：`sigma`、`@sigma/*`、`graphology`、`graphology-generators`、`d3`（`'d3-force'` 只是 G6 的布局名）以及仅被 `main.css` import 的 `sigma.css`。

## 替代方案

**方案 1：React + antd 保真优先。** 用 antd 的 React 版本承接上游组件语义，Radix 只用于浮层。放弃这条路的依据有两层。其一是保真度：`antd` 当前为 6.6.5（peer `react >=18`，原生支持 React 19），视觉与上游的 `ant-design-vue` 4.2 属于不同代，要贴近上游需钉 `antd@5`（5.29.3）并引入 `@ant-design/v5-patch-for-react-19` 兼容包。其二是收益面：重量级组件只有 21 处，其余 925 处都能由 shadcn 覆盖，而代价是 antd 的 CSS-in-JS token 与 Tailwind 的 CSS 变量两套主题机制长期并存，`design.md` 关于「新增 UI 必须使用 CSS 变量」的约束适用范围会裂成两半。

**方案 3：分层混合。** 原语走 Radix/shadcn，数据密集组件走 TanStack，最重的表单、日期与上传保留 antd。直方图完成后的结论是：`a-form` / `a-form-item` 共 107 处没有使用 antd 校验引擎，`a-tree` / `a-tree-select` / `a-date-picker` 各 1 处，混合能省下的只有 `a-table` 与 `a-upload` 两个组件的自研量，不足以支撑两套设计语言的长期映射维护。

**方案 4：导入上游 Vue 并改名（原冻结计划）。** 零移植成本，与上游 1:1，既有 `web.yml` 契约的脚本名直接可用。放弃 React 技术栈的诉求。

**方案 5：Next.js。** 兼容性成立（Next 16.3.8 的 peer 覆盖 React 19，`babel-plugin-react-compiler` 在 peer 内，Tailwind 4 与 shadcn 以 Next 为首发环境）。落在这个仓的部署契约上有两条路，都需要改契约：`output: 'export'` 的静态导出会改变产物目录（`out/`，`web.Dockerfile` 的 COPY 路径要改），同时 Next 的 route handlers、middleware、ISR、server actions 与图片优化全部不可用；完整 `next start` 需要把 `web.Dockerfile` 的生产段从 nginx 静态托管改为常驻 Node 进程，并把 `docker/nginx/default.conf` 的 `location /` 从 `root` + `try_files` 改为反向代理。SSR 在本应用缺少施展空间：数据都在 `Authorization: Bearer` 之后，token 存于 `localStorage`，服务端无法取得身份，首屏只能渲染空壳；22 条路由中 `/app` 整体受 `ProtectedRoute` 保护，公开文档站已由 VitePress 承担。迁移到 Next 还会失去 `vite-plugin-dev-inspector`（无对应实现），并需要重做 `import.meta.env` → `process.env.NEXT_PUBLIC_*`、`createBrowserRouter` → 文件路由、vitest 与 Storybook 的 framework。重新评估的触发条件是出现需要 SEO 的公开页面、鉴权改为 cookie session 并需要服务端首屏，或团队把 Next 定为标准栈。

**生成式客户端的两条备选路径。** 其一是不引入生成器，257 个端点手写类型化客户端；其二是只在测试与 mock 层使用 `orval`，生产代码手写。两者都放弃了「diff 生成物即契约变更」这条评审入口。

## 验收标准

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
| --- | --- | --- | --- | --- | --- |
| `web/` 落地后门禁恢复 | 目录缺失使门禁空转 | `scripts/verify_engineering_contracts.py` | `python3 scripts/verify_engineering_contracts.py` | 删除 `web/AGENTS.md`、`.github/workflows/web.yml`，或在 api 段之外写 `/api` 字面量时，对应检查必须报错 | Passed |
| 生成物与契约同步 | 后端改字段后前端静默失配 | `web/src/shared/api/generated`、`web/openapi.json` | `pnpm run api:check` | 改一个后端字段定义而不重新生成，比对必须失败 | Passed |
| 后端契约快照不漂移 | 快照落后于真实接口 | `web/openapi.json` | `pnpm run api:snapshot` 后 `git diff --exit-code openapi.json` | 给路由新增一个响应字段后跑 `api:snapshot`，`openapi.json` 必须产生 diff | Not run |
| LITE 降级不依赖 404 | 能力关闭被当成故障 | `backend/server/routers/__init__.py`、`web/src/entities/session/model/capabilities.ts`、`web/src/app/routing/guards.tsx` | 拦截 `discovery` 投影后真浏览器核验（侧边栏与扩展页入口消失、深链落到 `/agent` 且无 `/api/knowledge/*` 请求，`knowledge: true` 为对照），加 `pnpm run test:unit` 的 `test/unit/app/guards.test.tsx` 六例；未起 `LITE_MODE=true` 栈，后端门控为代码检视 | LITE 下扩展入口必须消失，深链不得停在请求失败的空白态；投影请求失败（没有 `data`）不算能力关闭（仍渲染页面）。去掉重定向、把未知投影当关闭、加载中直接渲染时对应用例必须失败（已做变异验证） | Inspected |
| 流式语义与上游一致 | 断线丢事件、取消失效 | `web/src/features/chat/model/run-stream.ts`、`web/src/features/chat/lib/sse.ts` | 真实 run 的 SSE 事件序列、`Last-Event-ID` 续传、`AbortController` 取消 | 中途断网后重连必须按 `getAgentRun` 的终态判定，禁止对已终态 run 重放 | Not run |
| 线程可建可续 | 未带线程进入对话页无法发送、重试产生多条空线程 | `web/src/features/chat/api/agent-api.ts`、`web/src/features/chat/model/chat-runtime.ts`、`web/src/pages/chat/ui/chat-page.tsx` | 真实 HTTP：`POST /api/chat/thread` 得到 `id`，随后 `createRun` 返回 `status=dispatched`（此前同一线程直接报「对话线程不存在」）；同一 `request_id` 重放返回同一条线程。页面接线与失败/离开分支由 `test/unit/pages/chat-page.test.tsx` 与 `queue-runtime.test.ts` 覆盖：无线程时先建再发、有线程时不建、建线程失败保留输入、建线程期间离开则放弃发送、失败重试沿用同一 `request_id` | 建线程请求里的 `agent_id` 传 agent 数字 id 时后端返回「智能体不存在」；并发调用 `createThread` 只产生一次请求；页面级行为无浏览器验证（未接入 Playwright） | Passed |
| 队列语义以后端为准 | 排队请求被当已执行、取消越权、失败原因丢失、队列条不推进 | `backend/package/ars/services/agent_request_queue_service.py`、`web/src/features/chat/api/agent-api.ts`、`web/src/features/chat/model/chat-runtime.ts` | 真实 HTTP：同一线程连续两次 `createRun`，第二条 `status=queued`、`queue_position=1`；`POST /api/agent/requests/{id}/steer` 返回 `queue_policy=steer`；订阅 `GET /api/agent/requests/{id}/events` 实测收到 `queued`（含 `position`）、`: heartbeat`、`run_created`（含 `run_id`）、`cancelled` 四类帧；`pnpm run test:unit` 用 curl 实测的 409 响应体断言 `ApiError.message` 等于后端业务文案 | 从 `/requests/continue` 的 query 去掉 `agent_slug` 必须 422；对仍有活跃 Run 的 steer 请求调 cancel 必须 409（实测 `{"detail":{"code":"steer_in_progress",…}}`）；`paused_reason` 用后端不存在的取值时队列条必须原样展示而不是套用错误文案；删除订阅去重、线程作用域、终态状态收窄三处 guard 时对应用例必须失败（已做变异验证） | Passed |
| 队列条与上游同判定 | 提升或取消按钮出现在不该出现的请求上 | `web/src/features/chat/lib/queue-view.ts`、`web/src/features/chat/ui/queue-bar.tsx` | `describeQueueRow` 与上游 `canSteerQueuedRequest` / `canCancelQueuedRequest` 逐条对应；`pnpm run test:unit` 的 `queue-bar.test.tsx` 覆盖引导、取消、`引导 · 下一条执行`、等待说明、暂停与继续、无文案兜底六种分支 | 引导请求在运行中不出现取消按钮、`hasPendingSteer` 时不再出现引导按钮；真实页面截图仍未提供（未接入浏览器验证） | Inspected |
| 会话列表可切换 | 用户看不到也回不到历史会话；失败时显示别的智能体的会话 | `web/src/features/chat/model/thread-list-store.ts`、`web/src/features/chat/ui/conversation-list.tsx`、`web/src/widgets/app-sidebar` | `pnpm run test:unit`：store 16 例（并发 initialize 只发一轮请求、解析失败不拉列表且保留原因、加载失败保留旧列表、后发请求覆盖先发、upsert 插入位置与字段合并、重命名/置顶/删除的成功与失败路径）+ 组件 12 例（加载中与空态互斥、解析期间不闪空态、失败原因、置顶标记、当前会话 `aria-current`、重命名提交、置顶切换、删除二次确认、删除当前会话回到新建对话路由） | 用未置顶线程断言插入位置（置顶会被排序掩盖）；文案互换、`load` 去掉代次、`upsert` 改为追加到末尾时对应用例必须失败（已做变异验证）；真实页面截图仍未提供 | Inspected |
| 消息渲染与上游同结构 | 思维链、工具调用与中间过程无处展示；流式工具结果无法并回；派生被编译器冻结导致正文不刷新 | `web/src/features/chat/lib/message-grouping.ts`、`web/src/features/chat/lib/message-processor.ts`、`web/src/features/chat/model/stream-handler.ts`、`web/src/features/chat/model/streamed-messages.ts`、`web/src/features/chat/model/thread-runtime-store.ts`、`web/src/pages/chat/ui/chat-page.tsx`、`web/src/features/chat/ui/message-list.tsx` | `pnpm run test:unit`：纯逻辑 40 例（含 `<think>` 提取、独立 tool 消息过滤、隐藏工具过滤、跨用户消息不合并、折叠守卫、分片拆分与结果并回）+ 组件 11 例（多轮切分、工具逐层展开、已收尾折叠、正在输出不折叠、思考中思维链自动展开、角色区分、有正文时的 error_type、流式追加）+ 渲染链 2 例（真 `useStreamingMessages` + 真 `MessageList`：就地追加的分片要出现在正文里、工具结果到达后工具行离开「进行中」） | 工具结果分支挪回 `loading`、结果表键只用分片表 id、首分片角色恢复硬编码 `ai`、`error_type` 要求正文为空、去掉 `thread-runtime-store.ts` 或 `streamed-messages.ts` 里的 `'use no memo'`；去掉两处 `'use no memo'` 中任意一处时都必须有用例失败（已做变异验证）；真实页面截图仍未提供 | Inspected |
| 设计 token 与暗色一致 | 硬编码颜色破坏暗色 | `docs/develop-guides/design.md` | `pnpm run check:tokens` 与浅/深两套截图 | 新增组件使用 Tailwind 默认调色板类必须被门禁拒绝 | Inspected |
| 组件库单一来源 | 两套主题机制并存 | `docs/develop-guides/design.md`、`web/package.json` | 依赖清单中不存在 `antd`，且 `pnpm run check:tokens` 覆盖全部组件 | 任何 `web/src` 文件 import `antd` 或其样式必须被依赖检查拒绝 | Passed |
| 视觉基线可对照 | 逐页评审无客观依据 | `docs/develop-guides/design.md` | 上游同页与迁移页的截图对照记录 | 缺件组件（Empty、命令式 confirm、Upload、复杂表格）未实现时页面必须显式降级，不得静默空白 | Not run |
| 依赖方向约束生效 | 跨切片与反向引用无人拦 | `web/ARCHITECTURE.md`、`web/steiger.config.ts`、`web/.dependency-cruiser.cjs` | `pnpm run lint:fsd && pnpm run arch:check` | 人为让两个切片互相 import、或让 `shared` 引用上层时必须报错 | Passed |

## 风险

**组件重写是工作量的主体，且缺少自动 oracle。** 946 处 antd 调用点没有拦截层，其中命令式 confirm、上传、以及表格的排序与固定列需要从零实现。视觉一致性只能靠人工截图对照，S0 需要把「每页对照清单」作为交付物，否则评审会缺少客观依据。

**`AgentChatComponent.vue` 5467 行不可整体直译。** 该文件是上游最大的单文件，包含消息列表、输入框、队列条、审批、提问、工具调用、思考块与用量统计。S2 必须先做功能切分再逐块迁移，切分边界本身需要评审。

**重量级组件的估算要按文件而非按标签。** `a-table` 只有 12 个标签，但分布在 10 个文件、周边代码 8495 行；`a-upload` 6 个标签分布在 6 个文件、周边 6220 行。列定义、排序状态、分页请求与展开逻辑才是成本所在，按标签数估算会显著低估 S3。

**契约快照的后端漂移检查尚未接进 CI。** 命令已具备（`pnpm run api:snapshot` 后 `git diff --exit-code`），但没有 workflow 会在后端变更时执行它；前后端同时改动时快照可能滞后，直到有人本地跑一次才发现。

**Steiger 处于 0.x 活跃期。** `steiger` 0.7.0 与 `@feature-sliced/steiger-plugin` 0.8.0 之间没有声明 peer 约束，配置格式在 0.5.0 变过一次。接入时钉死两个版本，升级视同契约变更：重跑规则、复核报错差异后再提交。

**生成器仍是 0.x 版本。** `@hey-api/openapi-ts` 0.99.0 的插件配置在小版本间会变，升级需要重跑契约流水线并复核生成物差异。

**双轨期的误引用。** `frontend/` 在 S5 前仍存在于仓库中，其组件与工具函数对新代码是可 import 的，而它的 API 客户端与旧契约绑定。`web/` 的 builder 配置与 lint 范围需要阻止跨目录引用。

**文档站里仍有指向上游仓库的链接。** `docs/` 是从上游整站导入的，多处 GitHub 链接指向 `xerrors/ARS` 而不是本仓 origin，其中一部分描述的是上游 Vue 前端的实现。迁移收尾前要按「本仓事实 vs 上游参考」逐页核对，不能靠替换域名一次性处理：`web/` 之外的源码路径在本仓可能根本不存在。

**页面侧的上游语义只覆盖了一部分。** 上游 `threadCreation.js` 的 `accepted` 守卫同时比较 agent、project 与 thread；当前页面只比较「是否仍在页面上」与路由线程，因为 project 切换尚未移植。输入草稿（`thread_draft.js`）与页面级浏览器验证也还没有。

**两处与上游同源的表现偏差。** 折叠行的耗时取该轮最后一条助手消息的 run timing，提问恢复产生的单轮里有两次 run 时只反映最后一次；`<think>` 解析只处理第一个块，正文里再出现一次标签会残留。两者都与上游一致，暂按同行为处理。

**React Compiler 会把「依赖表达式身份不变、内容就地变」的派生冻结住。** 本仓有两处这种写法，都已显式标注 `'use no memo'`：`useThreadRuntime`（版本号做快照 + 直接读模块级 Map）与 `useStreamingMessages`（直接读就地追加的分片表）。判据是「派生依赖的容器身份在一次流内不变」；`useThreadList`（切片整体替换）与 `useIsDarkMode`（`useState`）不受影响。新增订阅式代码若读可变外部状态，需要同样处理，并补一条真渲染链的用例——只测 hook 层守不住消费侧。

**思考中自动展开思维链是有意偏离上游的。** 上游实现在 [AgentMessageComponent.vue](https://github.com/xerrors/Yuxi/blob/main/web/src/components/AgentMessageComponent.vue)（`isReasoningActive` 依赖的 `status === 'reasoning'` 在整站没有赋值点，其激活分支只显示「Thinking...」），本仓按交互要求改成「还没有正文时自动展开且不可收起」，并在 `message-list.test.tsx` 里固定下来。

**工具渲染只做了通用形态。** 上游为 28 个工具各写了专用渲染（`ToolCallingResult/tools/*`），本仓目前统一用「图标 + 说明 + 参数与结果」的通用行；子智能体类工具的富化（按 run/thread 关联子代理）也没有移植，`display_label` 暂时无人填充。工具结果里的结构化视图（表格、图片、思维导图）会退化成 JSON 文本。

**静默收流后的订阅有取舍。** 事件流在没有终态帧的情况下结束（后端连接上限或网络切断）时，只有存活超过 60 秒的订阅会重新建立，短命流只做一次状态同步：否则「静默结束 → 重新订阅 → 又静默结束」会互相触发成热循环（已用探针实测，改用会重订阅的路径会直接挂死）。代价是短命流之后该请求要等下一次发送或切换线程才会重新自动推进。同步读取与订阅共用一个按线程的读取序号，两者竞争时那一轮都不订阅，属可接受窗口。

**会话列表还差批量加载更多。** 列表固定拉 100 条以内的首屏。全局会话搜索（`GET /api/chat/threads/search`，返回按消息命中的片段）已移植对话模式：侧边栏入口、防抖 240ms、每页 20、滚到底加载更多、请求序号丢弃过期响应、↑/↓ 与回车导航、未输入时的「新对话 + 最近会话」默认视图；上游的 file 模式（挂在 Workspace 与 AgentPanel）留给 S3/S5。三处有意偏离：搜索失败给出文案与重试按钮（上游只 `console.warn`，界面与「没有结果」不可区分）；状态重置放在关闭路径而不是打开时的 watch；防抖在定时器回调里发起请求而不是在 effect 体内直接发。搜索响应里的 `thread_status` 是模型默认值 `done`，因此选中结果写回列表时不带该字段，避免抹掉运行中 / 未读标记。`thread_status`（正在运行 / 有新回复）已按上游渲染，并在侧边栏展开且页面可见时每 12 秒同步一次；代价是后台线程开始时最多晚 12 秒才出现「正在运行」标记（上游在 run 开始时还会本地置一次 `loading`，本仓没移植）。

**排队期间的界面语义只覆盖了一部分。** 排队请求在派发前不出现在历史接口里（后端把 `delivery_status` 为 `queued` 的用户消息过滤掉），界面对此在发送时插入一条本地用户消息占位（请求 id 交给后端复用，init 分片到达时用后端下发的权威消息整体替换该键），但这条占位不带附件预览。上游在页面重新可见时会 `resumeActiveRunForThread` + 重新订阅队列，这条路径本仓没有实现：长时间后台的标签恢复后要等下一次发送或切换线程才会重新同步。

**上下文用量卡片已移植，含四处有意偏离。** 卡片按上游同结构渲染占比、构成条、当前对话累计与缓存命中率，展开后是按模型分桶的调用统计；`token_usage` 缺失时整段不渲染（与上游的 `v-if` 一致），单个字段缺失显示 `--` 或「未上报」。四处偏离：1) 进度条改用原生 `<progress>`（语义元素，`accent-color` 着色），上游是 `span + role="progressbar"`；2) 头部在只有 `context_window` 时也显示 `上限`，让它与进度条同源（上游只显示总数）；3) 该拉取在没有线程运行时不发请求，且不复活已删会话的运行时——上游的 `getThreadState` 是 create-on-read，本仓的只读路径不建状态；4) 恢复中断与收到 `agent_state` 分片前会作废在途的读取，避免过期响应把审批弹回或把用量回退。明细列表的占比分母包含被压缩的 token，构成条的宽度分母是上下文上限，两者不是同一个数（与上游相同）。

**工具审批模式只在用户显式选择时下发，且显示与下发同源。** 后端解析一次 run 的模式是 `请求值 ?? 智能体配置 ?? 默认值`，从不读线程 metadata，因此线程级选择能生效靠的是前端每次把它带上。规则是：下发的值取「线程 metadata 里的合法模式，否则本地保存的偏好」，两者都没有时留空，交回后端按智能体配置解析——把界面的回退值一起发出去会静默覆盖管理员配置的模式。选择器显示同一个值：只有当线程自己带了合法模式时才算「线程级选择」，否则按本地偏好显示，避免出现界面写着「请求审批」而实际按完全信任执行的相反结果。仍有一处不可消除的差异：`tool_approval_mode` 在智能体配置里是 admin 级字段，普通用户在 `/api/agent/default` 拿不到，因此管理员把它设成完全信任、用户又没有显式选择时，界面显示「请求审批」而实际按完全信任执行；要消除这一处需要后端把生效模式暴露到线程或 run 响应里。

**S3 第二片（详情页 + 只读文件表）已落地。** `pages/knowledge-base` 承载详情页（头部、统计卡、分区切换），`features/knowledge-base` 补文件表与文件名搜索弹窗：目录进入、面包屑回退、状态筛选、当前页按列排序、服务端分页（100/300/500）、刷新与空态。查询语义与上游一致：状态筛选不是「当前目录内过滤」，上游同样在 `status != all` 时强制 `recursive=true` 并丢弃 `parent_id`/`path_prefix`（`stores/database.js`），后端也在同一条件下忽略这两个参数，因此筛选与目录位置必须互相归位。位置、状态筛选与页码由页面持有（`model/file-view.ts` 的 `openLocation`），因为搜索命中也要改位置，页码留在表格里会带着上一层的页码去查新目录；列表用 `keepPreviousData` 保留上一份数据，因此加载期间要显式给出加载态并禁用行内入口，否则旧行会被当成新目录的内容。

与上游的差异：1) 筛选态的界面处理不同——上游保留面包屑并加一个「筛选结果」标签，本仓把路径换成「跨全部目录筛选」并加一行说明，避免界面显示的路径与列表内容矛盾；2) 文件名搜索由上游的「回车触发」改为 240ms 防抖自动搜，与会话搜索一致；3) 搜索命中后本仓跳到文件所在目录，上游是打开文件详情弹窗（弹窗属于 S3.4）：命中项的 `filename` 与 `parent_id` 是两个独立字段（后端分别存相对路径与实体父目录），因此目录部分拆成逐节面包屑、`parent_id` 照旧保留；实体目录名只能从 `parent_id` 反推，接口不返回名称，用 `…` 占位节，名称待 S3.4 的文件详情补；4) 面包屑每一节都可点（上游当前节点是不可点的文本），点当前层等于不动；5) 搜索命中项比上游多一个状态徽标；6) 创建人列只显示名称，上游还渲染头像（`created_by_avatar`）；7) 分页底栏与「第 x / y 页」常显（上游 `hideOnSinglePage` 在只有一页时隐藏）、翻页只有「上一页 / 下一页」没有页码直跳、改每页条数回到第一页；文件分区保持挂载（上游同用 `v-show`），切走再回来时每页条数与排序还在；8) 文件名列不渲染文件类型图标（上游 `FileTypeIcon` 按扩展名给图标，随 S3.4 与文件详情一起移植），文件名目前是纯文本而不是打开详情的按钮。

分区集合：文档型知识库六个（含评估基准），连接器类型（Dify / Notion）只有检索测试。判定沿用上游的 `kb_type === 'milvus'`：后端权威字段 `supports_documents` 不在详情投影里，`GET /types` 要管理员，`GET /databases/accessible` 虽登录可读但为它多取一份列表不划算；当前注册类型只有 milvus / dify / notion，与 `KnowledgeBaseFactory.get_kb_class(...).supports_documents` 一致，新增文档型类型时要改成读权威字段。上游对非管理员隐藏 RAG 评估与评估基准、详情路由还要求管理员，本仓后端没有该守卫，所以不做这层收敛。时间与内容量按上游口径：`Asia/Shanghai`（实现用固定 +08:00，中国自 1991 年起无夏令时）、一年内 `MM月DD日 HH:mm:ss`、更早 `YYYY年MM月DD日`、虚拟目录显示 `-`、内容量 `1.2k Tokens` 并把 Chunks 放进 tooltip。

表格库选了 `@tanstack/react-table` v9（无头）：被拒的替代项是手写当前页排序（列定义、排序状态与表头可访问性都要自己维护）与复用本仓 `shared/ui/Table`（只有 `{data, columns}` 的简易形态，且目前没有任何消费者），收益是 S4 的评估与调试面板还有表格要落地。证据是本片新增 `file-view`、`knowledge-files`、`knowledge-file-table`、`knowledge-base-page` 四个测试文件，整套 45 个文件 587 例通过；九条变异全部被对应用例抓住（虚拟目录当成实体目录、面包屑丢 `path_prefix`、筛选态仍显示路径、搜索跳转不归位页码、切目录期间不显示加载态、旧行仍可下钻、搜索命中丢掉 `parent_id`、刷新不刷详情、切分区重建文件表），以及真实链路验证：进入虚拟目录发出的是 `path_prefix=brief%2F`（不是 `parent_id`）、点虚拟层自己的面包屑留在该层、筛选发出 `recursive=true` 且路径导航被替换、搜索命中后定位到 `brief/` 且文件在列表里可见、刷新同时重取详情与列表、页面无控制台报错。未覆盖的证据边界：「路径投影挂在实体目录下」这条只有单元测试，本机数据里没有 `filename` 带 `/` 且 `parent_id` 非空的记录。上传、解析、删除与移动属于 S3.3/S3.4，本片没有写入口。

**S3 第三片（文件能力矩阵 + 行内与批量操作）已落地。** 能力判定照上游 `utils/knowledge_file_policy.js` 移植到 `lib/knowledge-files.ts`（解析/入库/重新入库/下载/删除/多选的允许状态与每行的主操作），`ui/file-row-actions.tsx` 按它渲染行内菜单（下载、解析或重试解析、入库或重试入库、重新入库、移动、删除），`knowledge-file-table.tsx` 加表头全选与批量条（批量解析/入库/删除），`ui/move-file-dialog.tsx` 负责选目录。上传与文件详情留给 S3.3/S3.4-b。

与上游的差异与后端约束：1) 移动改成「移动到…」弹窗——上游只有 HTML5 拖拽（触屏与键盘不可用、没有测试覆盖），后端 `PUT …/move` 本来就是单文件；2) 解析与入库不弹上游的参数配置弹窗，按知识库自己的分块与 OCR 配置提交（`params: {}`），上游的 OCR/分块参数面板要等参数来源确定后再接；3) 批量删除按 `canDeleteFile` 过滤并在确认文案里报「另有 N 个处理中的文件会被跳过」——上游用 `canSelectFile` 过滤，会把解析中/入库中的文件一起提交删除（后端不拦），本仓按更严的档位修掉；4) 没有上游的「多选模式」开关，全选框放在表头，选择与它所属的视图键（位置/筛选/页码/页长）绑定，翻页或换目录后旧选择自动失效（上游会留下幽灵选择）；5) 上游批量删除的实时进度提示（`正在删除文件 x/y`）本仓没做，通知中心只有新增与关闭、没有更新接口，因此批量删除只在结束时汇总；6) 只有全部批次都失败时才报数量，不逐条列出后端原因（与上游一致）；7) 只读知识库不渲染选择列（上游 `tableSelection` 在只读时为 null），解析、入库、删除、移动一律不出现，只留下载与浏览；目录的删除不走文件能力矩阵（目录没有解析/入库状态，上游同样只看只读标记；本仓还额外看「有操作在飞行中」），文件与批量删除才按状态档位过滤；8) 移动的候选只含实体目录——移动接口写的是 `parent_id`，虚拟目录只是文件名里路径的投影、没有实体记录，选它只会把文件移到它的父目录；目标与当前位置相同时不给确认，避免「提示移动成功但什么都没变」；9) 内容量与时间的格式、状态徽标对目录留空等展示口径同上一片。

证据：`lib/knowledge-files.ts` 的能力矩阵、`api/knowledge-api.ts` 的写操作、`model/knowledge-queries.ts` 的 mutation、行内菜单、批量条与移动弹窗各有单元测试与组件测试（本片新增 `file-row-actions.test.tsx`、`move-file-dialog.test.tsx`，`knowledge-file-table.test.tsx` 扩到批量与只读），整套 47 个文件 640 例通过；变异覆盖删除档位、勾选档位、下载的 URL 排除、重新入库状态、目录主操作、任务状态判定、请求体、确认框、下载文件名接线与兜底、只读入口、陈旧行入口、批量删除过滤与在飞重复提交、选择与视图绑定、移动候选与当前位置。真实链路验证：真实下载 `probe2.md`（Playwright 收到 download 事件）、重试入库发出 `POST /documents/index`、移动弹窗与多选批量条的实际交互、页面无控制台报错。未覆盖：批量删除的提交路径只有组件测试（真实链路只验证了取消路径），下载的 `Content-Disposition` 端到端只有解析函数与接线测试。

**S3 第四片（文件详情与预览）已落地。** `ui/file-detail-dialog.tsx` 移植上游 `FileDetailModal.vue` 的壳：头部是类型/状态/体量，页签在「源文件 / 解析结果 / 分块」之间切换；`lib/knowledge-chunks.ts` 逐行移植上游 `chunkUtils.js` 的 `findOverlap` 与 `mergeChunks`（重叠至少 11 个字符才算重复、被覆盖的分块不重复列出、无重叠时补换行、按序号排序），服务端给了 Markdown 就用它、否则用分块合并兜底。`ui/file-preview.tsx` 按后端 `preview_type` 分发：图片、PDF（`ui/pdf-preview.tsx`，pdfjs-dist 动态 import，逐页按容器宽度与 `devicePixelRatio` 画 canvas）、Markdown、沙箱 iframe 的 HTML、文本与代码；表格行文件名在可预览时才变成打开详情的按钮。

与上游的差异：1) 详情头部直接用表格行上的记录，不再单独请求 `/documents/{doc_id}/basic`——行上的状态与 `has_original_file`/`has_parsed_markdown` 已够决定初始视图；2) PDF 的字节直接用预览接口给的 blob，上游按 URL 再取一次（pdfjs 的请求带不上 `Authorization`）；cMap 仍取上游那个 jsdelivr CDN，离线部署要改成自托管，这是已知的部署约束；3) 代码高亮复用仓库已有的 shiki（上游是 highlight.js）：`shared/markdown/render.ts` 抽出 `renderCodeBlock`，与正文共用同一个高亮器、主题与消毒流程，认不出语言时退回纯文本；4) 上传白名单（`parser/unified.py` 的 `SUPPORTED_FILE_EXTENSIONS`）不含 `.py`/`.ts` 这类源码后缀，因此代码预览实际覆盖的是 `.json`/`.txt`/`.html` 等白名单内的类型；5) 分块视图直接展示合并后的分块（上游同），没有做分块级的高亮或引用跳转。

详情弹窗的可用视图由能力矩阵派生（`canPreviewOriginal` / `canPreviewParsed` / `canPreviewChunks`，上游 `availableViewModes` 同）：只有源文件的行不出现「解析结果 / 分块」，URL 类型不出现「源文件」，解析内容也只在当前视图要看时才请求。预览按主题渲染（`useIsDarkMode` → shiki 的 `github-dark`）。

仍未移植或有意偏离的部分：1) 详情头部没有上游的「下载原文 / 下载 Markdown」下拉与字符数/分块数文本，只展示类型、状态、大小、分块数与 Tokens；2) HTML 预览的 iframe 用 `sandbox=""`（上游给 `allow-scripts`），知识库内容不可信，宁可让脚本不执行；3) PDF 的 cMap 仍取 jsdelivr CDN（离线部署要自托管），且本仓没有上游那个「容器宽度变化超过 8px 就重绘」的观察器，弹窗变宽后 canvas 保持初始缩放；4) `usePlugin` 在插件形状不认识时跳过该插件（宁可少一个插件也不让整段正文渲染失败），形状再变会让公式静默消失，只能靠 Markdown 公式用例与浏览器复验发现。

**本片在真实浏览器里查出一个从 S2 起就存在的缺陷并修掉：Markdown 正文一个字都渲染不出来。** `@vscode/markdown-it-katex` 是 CJS 包，Node 里默认导入就是插件函数，Vite 在浏览器里解析成 `{default: fn}`，于是 `md.use(plugin)` 抛 `plugin.apply is not a function`；降级路径也调用同一个插件，异常穿透成未处理的 rejection，`Markdown` 组件永远拿不到 HTML。对话页与详情页共用这条管线，受影响的包括所有助手消息的渲染。修法是把插件形状归一（`resolvePlugin`）、形状不对时跳过该插件、并给 `{default: fn}` 形状补用例；浏览器复验后 Markdown 与代码高亮都正常。此前 S2 与 S3.2 的验证都没覆盖真实浏览器里的 Markdown 渲染，这条只能靠真页面发现。

证据：`knowledge-chunks.test.ts`、`file-detail-dialog.test.tsx`、`file-preview.test.tsx`、`pdf-preview.test.tsx` 与 `shared/markdown.test.ts` 的新用例，整套 51 个文件 692 例通过；变异覆盖分块合并、兜底、初始视图、页签集合、可预览判定、objectURL 释放、iframe 沙箱、PDF 取消渲染、「后端标不支持」与插件形状归一。真实链路验证：仓库内造了 md/json/csv/pdf/png 五个夹具，经真实上传与 `POST /documents` 落库，逐个打开详情核对——Markdown 两种视图都出正文、JSON 出 shiki 高亮块、图片 `<img>` 的 blob 源真的解码成功、PDF 用 pdfjs 画出 canvas（`共 1 页`）、CSV 出文本；同时核对了接口返回的 `X-Ars-Preview-Type`（pdf / image）与 JSON 里的 `preview_type`（markdown / text）。未覆盖：cmaps 的离线自托管、超过 30 MiB 与 250k 字符的截断分支、`.docx/.pptx` 的服务端转 PDF、生产构建下 PDF worker 的加载（只在 dev server 下验证过）。

**S3 第五片（上传与解析链路）已落地。** `ui/file-upload-dialog.tsx` 移植上游 `FileUploadModal.vue` 的文件与文件夹两条路径：拖拽区与选择按钮、按并发 10 上传、逐行四态、被拒文件当场说明、目标目录取当前浏览的目录、「上传后自动解析并入库」开关、图片必选 OCR 引擎（默认取后端 `/api/system/ocr/options` 的 `default_engine`）；有文件上传成功即调 `POST /documents`（三阶段 ingest）登记并受理任务（全部失败时不提交）。判定与参数组装在 `lib/knowledge-upload.ts`（白名单、100 MB 上限、图片需 OCR、文件夹相对路径、`content_hashes`/`file_sizes`），接口与查询在 `api` 与 `model` 段。

与上游的差异：1) 不做上传字节百分比——上游用 `XMLHttpRequest.upload.onprogress`，本仓走生成的 fetch 客户端拿不到进度，队列只报「排队 / 上传中 / 完成 / 失败」与计数（用户已确认）；2) URL 模式（`/files/fetch-url`）与个人空间导入（`/files/import-workspace`）不在本片，两个入口依赖的个人空间页面也还没迁移；3) 不弹上游的分块参数面板与 OCR 子选项，解析与入库按知识库自己的配置提交，另带 `ocr_engine`（只要拿得到就带，Office 解析需要它）；4) 类型白名单以 `/files/supported-types` 为准，取不到时用与后端 `SUPPORTED_FILE_EXTENSIONS` 同步的兜底表；需要 OCR 的集合是后端 `OCR_FILE_EXTENSIONS` 去掉 `.pdf`（PDF 由后端补默认引擎），上游界面里少了 `.webp`；5) 没有扩展名的文件当场拒绝（后端也会 400），`ocr_engine` 只要拿得到就随参数提交——Office（`.xls/.xlsx/.pptx`）解析时后端要求已解析出引擎，只有 `.docx` 有兜底，按「批次里有没有图片」决定会让 Office 必然解析失败；引擎选项接口失败时退回内置默认 `rapid_ocr`；6) 上传中不允许 Esc 或点遮罩关窗（关掉后队列还在跑，进度与失败原因会丢，且本仓没有 abort 上传的通道）；7) 每行失败原因会显示在行上、全失败时把首条原因带进汇总（409 同内容因此能看见后端给的说明）；8) 上游的「已存在同名文件 (n)」面板没做，上传结果里的 `has_same_name`/`same_name_files` 暂无人消费。

**文件夹上传不建子目录。** 弹窗把所选目录逐层入队、multipart 文件名带相对路径，但后端登记时 `prepare_item_metadata` 只取 MinIO object name 的最后一段（`kb_utils.py`），目录层被丢掉；`source_paths` 只被 `POST /databases/{kb_id}/documents/add` 认，三阶段 ingest 不认。因此文件夹上传的结果是「文件全部平铺进当前目录」，不同子目录的同名文件会变成同目录同名记录。真建目录要等后端在 ingest 路径支持 `source_paths`。

**上传后新记录不会立刻出现，靠轮询窗口兜住。** 三阶段 ingest 是后台任务：`POST /documents` 返回 `queued` 时文件记录还没建出来，登记成功后的那次失效重取仍然是旧列表（第一次实测：提交后 90 秒内列表一直不变，那次没有窗口）。修法是给查询一个函数式 `refetchInterval`：有处理中的行时每 10 秒重取，另外在「刚提交完上传的一分钟」窗口里也轮询（上游对应「延迟刷新 + 自动刷新」）。真实链路复验：新文件上传后 3 秒内自动出现在列表里，不需要手动刷新（60 秒窗口是保守取值：实测建记录在秒级，窗口留长一点容忍排队；窗口过后若行处于处理中仍会继续轮询）。已知风险：处理中的行一直不落地（worker 崩、任务丢）时轮询不会自己停——上游有「6 轮无进展即停」，本仓没做，只靠行状态消失。

证据：上传库 10 例、上传弹窗 12 例（含 Office 带引擎、无扩展名拒绝、OCR 选项失败兜底）、接口 9 例与表格的入口/只读/轮询判定/接线用例；变异覆盖大小校验、文件夹相对路径、并发上限、`content_hashes` 组装、失败隔离、multipart 文件名、任务状态判定、只读入口、轮询判定的分支、xlsx 是否带 `ocr_engine`、`onUploaded` 接线。真实链路（本机 docker + 真实凭据）：`POST /files/upload` → `POST /documents` → 列表 3 秒内出现新行 → 状态从「待解析」推进到「重试入库」；同内容再传命中 409 并在弹窗里给出原因。**未验证**：本机环境的入库阶段稳定失败（文件最终为 `error_indexing`，后端 `meta.error` 是 `'ascii' codec can't encode characters in position 9-20`，纯 ASCII 内容的文件同样失败），因此「已入库」终态与分块视图的上传链路没能走通；这是后端/环境问题，不是前端行为——前端把失败如实显示成「重试入库」并给出重试入口。Office 转 PDF、超过 30 MiB 与 250k 字符的截断分支同样未走。

**S3 第六片（检索测试与共享设置）已落地。** `ui/query-test-panel.tsx` 移植上游 `QuerySection.vue`（查询框回车提交、相似度/重排序分数/距离/来源/文件 ID/块索引、示例问题、空命中与失败分开），参数用后端 `/query-params` 下发的默认值组装；`ui/share-config-dialog.tsx` 移植上游 `ShareConfigForm.vue` 的两个范围与三档访问级别，纯规则（归一、管理范围必须落在读取范围内、两个范围各自「按部门/指定人选了空列表」、摘要）在 `lib/share-config.ts`；两个范围的判空对应后端 `_normalize_scope` 的 400（「部门权限至少需要选择一个部门」/「指定用户权限至少需要选择一个用户」），越界判定对应 `_validate_manage_scope`；前端在保存前先拦一次并给同一口径的说明。

与上游的差异：1) 检索测试的**失败**不再画成结果——上游把 200 + `{status:'failed'}` 的 JSON 直接当结果渲染，本仓在 API 层折成异常并按失败提示（同类问题还有 `getDocumentContent`/`getDocumentInfo`，都已按失败处理）；2) 参数面板（可编辑检索参数）没做：面板只按后端 `/query-params` 下发的默认值检索，可编辑面板与写回 `/query-params` 的客户端调用一起留给后续（要做得连 `SearchConfigPanel` 一起移植），因此本片没有带走回写的 API 层与表单助手；3) 共享设置做成详情页头部的独立弹窗，上游是「编辑知识库」弹窗里的一个页签；保存走后端唯一的写入口 `PUT /databases/{kb_id}`，因此会把当前的名称与描述一起提交（该端点要求两者齐全）；4) 部门与用户列表来自 `/api/departments` 与 `/api/auth/users/access-options`，后端在 `access_level='user'` 时会自动把当前账号加进读取范围（实测读回 `user_uids` 多了自己），界面不额外处理。

证据：共享规则 13 例、共享弹窗 7 例、检索面板 6 例、查询参数组装 4 例，加接口与详情页入口用例；变异（共享越界不拦、同级别勾了读取范围外的部门、管理范围空列表放行、按级别不清空数组、检索失败不折叠、`include_distances` 不带上、失败时不清掉上一次命中、改选择不清旧提示、管理范围套用读取口径）都被对应用例抓住。真实链路（本机 docker + 真实凭据）：检索测试发真实请求并给出空态（本机没有可检索引的分块，见 S3 第五片的环境问题）；共享范围改成「指定人」并勾选真实用户 → `PUT` 200 → 头部标签变「指定人」、接口读回 `access_level=user` 且 `user_uids` 含所选用户；再改回全局共享，读回 `access_level=global`；页面无控制台报错。未覆盖：有命中时的结果渲染只在组件测试里验过（本机拿不到真实分块），示例问题需要后端生成（本机为空）。本机 Milvus 检索在服务端报 `'latin-1' codec can't encode characters`（中文与纯 ASCII 查询都命中）并返回 200 空数组，因此「空命中」与「检索链路故障」在本机不可分辨；面板的失败分支只有后端主动返回 `{status:'failed'}`（或非 2xx）时可达，组件与接口用例覆盖了这条分支。

**知识域深链在 LITE 模式下按投影重定向。** 隐藏入口只覆盖侧边栏与扩展页，深链 `/extensions/knowledgebase/:kbId` 仍会挂载详情页并向 LITE 未注册的接口发请求，页面停在请求失败态。`app/routing/guards.tsx` 的 `RequireKnowledgeEnabled` 因此按 `/api/system/discovery` 的 `capabilities.features.knowledge` 判定：投影未取到时显示加载态，明确为 `false` 时重定向到 `/agent`，其余情况渲染页面——请求失败（没有 `data`）是服务故障，不能当成能力关闭；响应形状与契约不符时会在渲染期报错并落到应用级错误边界（`capabilities.ts` 的同一取值在全应用都是这个行为）。React Router 的 `lazy` 路由在匹配时即取页面 chunk，因此 LITE 下深链仍会下载一次知识库页面代码，但不再发出知识域请求。证据：`test/unit/app/guards.test.tsx` 六例（含「投影失败不重定向」与「加载中不渲染页面」两条负向）与真浏览器核验（拦截 `discovery`：扩展页 tab 只剩技能/工具/MCP、侧边栏扩展入口消失、深链落到 `/agent` 且无 `/api/knowledge/*` 请求；`knowledge: true` 为对照，同一深链正常渲染）。未起 `LITE_MODE=true` 栈，后端路由门控仍为代码检视。

**S3 第一片（底座 + 知识库列表）已落地，含四处与上游的差异。** 底座补了 `shared/ui/empty`（对应 `a-empty`）与命令式 `confirm()`（对应 19 个文件里的 26 处 `Modal.confirm`，Promise 式、挂在外壳）；知识库列表落在 `features/knowledge-base` + `pages/extensions`，`/extensions` 现在是带 `?tab=` 的真实页面。与上游的差异：1) 新建由三步向导收成单表单，字段、默认值、校验与请求体照 `utils/databaseCreateForm.js` 移植，但分块策略选择器（`GET /chunk-presets`）与描述的 AI 生成还没接，分块策略固定用默认项；2) 卡片摘要展示文件/分块/大小，而不是上游的创建时间与共享范围标签；3) 编辑只提交名称与描述，不回写列表投影里的 `additional_params`（那份带着 `stats` 且按权限脱敏，不是持久化事实）；4) 列表接口在后端会把异常折成 200 + 空数组（`knowledge_router.py`），因此「接口失败」在界面上表现为空列表，前端读不到失败原因——这条要等后端改成非 2xx。证据是变异验证与真实链路验证：列表渲染真实知识库、新建弹窗提交后落在后端、删除走真实端点并刷新列表（开发环境的 MinIO 缺 `knowledgebases`/`kb-images` 桶会让删除返回 400 `NoSuchBucket`，补齐桶后为 200；这是环境缺桶，不是前端行为）。

**S2 外围六项已落地，逐屏对照与浏览器验证仍未做。** 输入草稿、图片通道、工具审批模式、会话列表未读与运行态、全局会话搜索、上下文用量卡片各自独立提交，各自的有意偏离写在对应模块的注释与本文件的相邻段落里。这六项的证据是单元测试、组件测试与变异验证，**没有真实页面的截图对照**，因此「与上游页面逐屏对照」这条验收对它们仍是 `Not run`；Playwright 不是仓库依赖，浏览器核验由本机脚本临时驱动，S3 各片已用它做真实链路验证，S2 这六项尚未回补。

**图片通道只做粘贴与按钮两条入口。** 上游的拖拽走文件附件通道（`/api/chat/attachments/*`），本项不做；上传中的反馈是发送按钮禁用加按钮内 spinner，而不是上游的 loading toast，因为通知中心只有新增与关闭、没有更新接口。这两条已由 `web/src/features/chat/lib/image-upload.ts` 与 `web/src/pages/chat/ui/chat-page.tsx` 的注释拥有，逐屏对照时按本仓行为验收。

**未发送的输入只做文本草稿。** 上游用 `thread_draft.js` 把「新建对话」页面上未发送的输入与附件绑定到一条草稿线程，建线程后再迁移选择。当前实现按线程 ID 持久化文本（附件与图片不入草稿，与上游一致）；未发送的图片在切换线程时被清空，这一点有意偏离上游（上游的 `currentImage` 不随线程切换清空，会把 A 线程选的图发给 B）。

**未验证范围。** 组件映射表、迁移页与上游页的视觉差异、以及各分片的工期都属于未验证主张；工作量为多片工程，单片的估算误差会累积。
