---
title: ARS 前端 React 迁移
description: 前端技术栈、契约流水线、分层、门禁与未迁移面的当前事实
---

# ARS 前端 React 迁移

状态：implemented
类型：architecture
Owner：web/ARCHITECTURE.md

事实分工：`web/ARCHITECTURE.md` 拥有分层与分片约束，`web/src` 是界面行为的事实，`docs/develop-guides/design.md` 拥有样式与组件约束，`scripts/verify_engineering_contracts.py` 与 `.github/workflows/web.yml` 拥有门禁。

## 问题

后端整体替换为 `ars` 实现（`/api`，无版本段、无响应信封）后，旧的 `frontend/` 前端调用的是旧后端的 `/api/v1/*` 与统一信封，任何页面都取不到数据；当时唯一的完整前端形态在参照实现里，不是本仓的交付物。本仓需要一套可维护的前端，并同时回答组件库路线、257 个端点的契约同步、聊天流式归属、JavaScript 到 TypeScript 的收敛，以及与既有工程门禁的衔接。

## 决策

### 技术栈与组件库

前端在 `web/` 重建：React 19 + Vite + TypeScript + Tailwind CSS 4 + shadcn/Radix，包管理器 `pnpm`，图标 `lucide-react`，信息架构对齐参照实现。当时判断不引入 ant-design 的 React 版本：参照实现里重量级组件只有 21 处、其余 925 处可由 shadcn 覆盖，而 antd 的 CSS-in-JS token 与 Tailwind 的 CSS 变量两套主题机制长期并存会让样式约束裂成两半。

组件库路线已被 [Web 前端向 Yuxi 视觉与组件基座对齐](2026-10-11-web-antd-yuxi-alignment.md) 取代：组件基座换成 antd 5，shadcn/Radix 滚动收缩。本节其余内容（契约流水线、LITE 降级、聊天 runtime、渲染管线、分层规范）仍然有效。

### 样式与设计 token

`web/src/styles/tokens.css` 是颜色与圆角的唯一来源，`web/src/index.css` 把 token 映射成语义工具类。`pnpm run check:tokens` 拒绝硬编码 HEX、非 `var()` 的 `rgb()/hsl()` 与 Tailwind 默认调色板类。命令式画布（知识图谱的 G6、数据总览的 ECharts）不认 `var(--x)`，由各切片把 `rgb(var(--token))` 交给 CSS 引擎解析后读回具体色值，主题切换时重建实例。

### API 分层与契约流水线

`web/openapi.json` 是后端契约快照，`@hey-api/openapi-ts` 生成 `web/src/shared/api/generated/`；生成物只允许 api 段引用，不得手改。**有 `response_model` 的端点直接复用生成类型**，手写只保留给生成器表达不了的地方（无 schema 的端点，以及 `list[dict]` 形状的嵌套字段）——抄写契约会漂移，数据总览的反馈项就曾因此捏造字段并漏字段。`pnpm run api:snapshot` 更新快照，`api:gen` 重新生成，`api:check` 在 CI 拦住漏生成。

### LITE 能力降级

能力只读 `/api/system/discovery` 的 `capabilities.features.*`：LITE 模式下知识库路由本就不注册，侧边栏与扩展页隐藏入口，深链由 `web/src/app/routing/guards.tsx` 的 `RequireKnowledgeEnabled` 按投影重定向。投影未取到显示加载态，声明为 `false` 才改道，请求失败（没有 `data`）按服务故障处理而不是能力关闭。禁止用 404 推断能力；只在能力启用时才挂载的面板（如数据总览的知识库统计）不挂载即不请求。

### 聊天 runtime

流式碎片写入模块级 store，组件通过 `useSyncExternalStore` 订阅，`delta` 不按帧重渲消息树。读可变外部状态的订阅 hook（`useThreadRuntime`、`useStreamingMessages`）标注 `'use no memo'`：React Compiler 会把「容器身份不变、内容就地变」的派生冻结在首帧。SSE 订阅按 `Last-Event-ID` 续传；静默结束的短命流只做一次状态同步，因为「重新订阅 → 又静默结束」会与后端连接上限互相触发成热循环。

### 渲染管线

Markdown、公式、代码高亮与消毒共用 `web/src/shared/markdown/render.ts`。CJS 插件在浏览器里可能是 `{default: fn}` 形状，渲染前统一归一，形状不认识时跳过该插件而不是让整段正文渲染失败。

### 迁移规则与 TypeScript 收敛

逐文件 TypeScript 化，迁移期允许临时宽松类型，分片结束时收敛。API 路径字面量只允许出现在 api 段（`shared/api` 或切片 `api/`），由 `scripts/verify_engineering_contracts.py` 的 `_validate_web_api_boundary` 扫描 `.ts/.tsx`；注意该检查是文本级的，注释里带前导 `/api` 的路径也会命中。

### 治理接口

`Taskfile.yml` 提供 `web:*` 目标（容器内 lint / 单测 / 契约刷新 / 全量门禁），`docker-compose.yml` 的 `web` 服务在开发模式挂源码并暴露 5173，`.github/workflows/web.yml` 按契约运行 `lint:check` / `test:unit` / `build`，`.pre-commit-config.yaml` 运行前端 lint 与 typecheck。浏览器级 E2E 没有引入 Playwright：真实页面验证由一次性脚本驱动（本机 Chromium + 一次性凭据），不入库。

### 分层规范（FSD）

`web/` 采用 FSD 的六层：`app`、`pages`、`widgets`、`features`、`entities`、`shared`；`processes` 不使用，`widgets` 只在出现真实跨页面复用时建立。切片按业务域划分，段按技术目的划分（`ui` / `model` / `api` / `lib` / `config`），依赖只能向下，同层切片互不引用，跨切片只走对方的 `index.ts`。结构规则由 Steiger 执法（`web/steiger.config.ts`），循环依赖与契约生成物边界留在 `.dependency-cruiser.cjs`；单消费者切片按各自注释里的理由只关闭 `fsd/insignificant-slice` 一条。

### 交付范围

`web/` 已交付：外壳与鉴权、`/agent` 对话（线程历史、流式与续传、消息渲染与折叠、审批与提问、排队与取消、输入草稿、图片通道、审批模式、会话列表运行态与搜索、上下文用量）、`/extensions` 知识库（列表、详情、文件表、上传与解析、检索测试、共享设置、文件详情与预览）、知识图谱、知识导图、RAG 评估与评估基准、全局调试面板与消息时序面板、`/agent-manage` 模型供应商、`/extensions?tab=skills` 技能与 `/extensions/skill/:slug` 详情、`/dashboard` 数据总览（系统概览与会话分析）。`docs/develop-guides/design.md` 的「技术栈约束」与之一致，`frontend/` 已删除。

### 未迁移面

`/workspace` 个人空间、`/agent-manage` 的智能体 tab、扩展页的工具与 MCP tab 仍是占位；它们的行为事实仍在参照实现里，本仓尚无对应 Owner。`/` 已交付，视觉基准与三态契约见 [web 与 Yuxi 视觉对齐](2026-10-11-web-antd-yuxi-alignment.md)。个人技能与共享技能的远程安装依赖沙盒与出网，沙盒不可用时界面给明确失败态而不是伪装成功。

## 替代方案

**React + antd 保真优先。** 用 antd 的 React 版本承接参照实现的组件语义，Radix 只用于浮层。当时放弃的依据是保真度与收益面：`antd` 与参照实现的 `ant-design-vue` 属于不同代，要贴近需钉旧版并引兼容包；而重量级组件只有 21 处，代价是两套主题机制长期并存。这条路径在 [Web 前端向 Yuxi 视觉与组件基座对齐](2026-10-11-web-antd-yuxi-alignment.md) 里被重新采纳，选择的是同代的 antd 5 加显式层叠顺序。

**分层混合。** 原语走 Radix/shadcn，数据密集组件走 TanStack，最重的表单、日期与上传保留 antd。结论是 `a-form`/`a-form-item` 的 107 处没有使用 antd 校验引擎，`a-tree`/`a-tree-select`/`a-date-picker` 各 1 处，混合能省下的只有 `a-table` 与 `a-upload` 的自研量，不足以支撑两套设计语言的长期映射维护。

**导入参照实现并改名（原冻结计划）。** 零移植成本、与参照 1:1、既有脚本名可直接用，但放弃 React 技术栈的诉求。

**Next.js。** 兼容性成立，但落在本仓的部署契约上要改产物目录，或把生产段从 nginx 静态托管改为常驻 Node 进程；SSR 在本应用缺少施展空间（数据都在 `Authorization: Bearer` 之后，token 存于 `localStorage`，服务端拿不到身份，首屏只能渲染空壳），迁移还会失去 `vite-plugin-dev-inspector` 并重做路由、环境变量与测试框架。触发重新评估的条件是出现需要 SEO 的公开页面、鉴权改为 cookie session 并需要服务端首屏，或团队把 Next 定为标准栈。

**生成式客户端的两条备选路径。** 手写全部端点的类型化客户端，或只在测试与 mock 层使用生成器。两者都放弃了「diff 生成物即契约变更」这条评审入口。

## 后果

组件重写是工作量的主体且缺少自动 oracle：命令式确认、上传、表格的排序与固定列都要自建，视觉一致性靠真实页面截图对照。重量级组件的估算必须按文件而非按标签：`a-table` 12 个标签分布在 10 个文件、周边 8495 行。

契约快照的后端漂移检查已具备命令但没有接进 CI：前后端同时改动时快照可能滞后到有人本地跑一次才发现。Steiger（0.7.0 + 插件 0.8.0）与 `@hey-api/openapi-ts`（0.99.0）都处于 0.x，升级视同契约变更，要重跑规则并复核生成物差异。Steiger 的单消费者切片豁免已积累到多条（`chat`、`knowledge-base`、`debug`、`model-providers`、`skills`、`dashboard`），继续增加会削弱这条规则。

知识域深链在 LITE 下仍会下载一次知识库页面代码（React Router 的 `lazy` 在匹配时即取 chunk），只是不再发出知识域请求。PDF 预览的 cMap 取外部 CDN，离线部署要改成自托管。会话列表固定拉 100 条以内的首屏，批量加载更多未做。会话分析的搜索框清空后要再点「查询」（参照实现是清空即重查）。热力图只按周补齐、不处理整周缺失（后端固定下发连续日序列，当前不可达）。

数据总览的工具调用、反馈与知识库三块在本机没有数据，只有空态与夹具形态经过验证；`web/index.html` 声明的 `/favicon.ico` 不存在，全站一次 404。数据库默认模型的前端保护没有后端守卫：删除或停用正在被默认模型使用的供应商会被界面拦下，系统配置读不到时还会要求二次确认，但管理员绕过界面仍可造成默认模型失效。

## 验证

| 验收主张 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
| --- | --- | --- | --- | --- |
| `web/` 门禁恢复 | `scripts/verify_engineering_contracts.py` | `python3 scripts/verify_engineering_contracts.py`（231 web sources / 0 问题）与 `python3 -m unittest scripts.test_verify_engineering_contracts`（62 例） | 删除 `web/AGENTS.md`、`.github/workflows/web.yml`，或在 api 段外写 `/api` 字面量时对应检查报错；本轮实际抓到技能片注释里的两处违规 | Passed |
| 生成物与契约同步 | `web/src/shared/api/generated`、`web/openapi.json` | `pnpm run api:check`（17 个文件一致） | 改后端字段定义不重新生成时比对必须失败 | Passed |
| 后端契约快照不漂移 | `web/openapi.json` | `pnpm run api:snapshot` 后 `git diff --exit-code openapi.json` | 给路由新增响应字段后跑 `api:snapshot` 必须产生 diff | Not run（命令具备，未接进 CI） |
| LITE 降级不依赖 404 | `backend/server/routers/__init__.py`、`web/src/entities/session/model/capabilities.ts`、`web/src/app/routing/guards.tsx` | 真浏览器拦截 `discovery` 的核验 + `test/unit/app/guards.test.tsx` 六例；数据总览的知识库面板按同一投影挂载 | 投影失败（没有 `data`）不算能力关闭；去掉重定向或把未知投影当关闭时对应用例必须失败（已做变异验证） | Inspected |
| 流式语义与上游一致 | `web/src/features/chat/model/run-stream.ts`、`lib/sse.ts` | 单测覆盖 `Last-Event-ID` 续传与终态判定 | 对已终态 run 重放必须被拒绝 | Not run（本轮未复验真实断线续传） |
| 线程可建可续 | `web/src/features/chat/api/agent-api.ts`、`model/chat-runtime.ts` | 全量单测的会话页与队列用例覆盖建线程、复用 `request_id` 与失败保留输入 | 建线程请求带 agent 数字 id 必须被后端拒绝 | Inspected |
| 队列语义以后端为准 | `backend/.../agent_request_queue_service.py`、`web/src/features/chat/model/chat-runtime.ts` | 队列条纯逻辑与后端文案逐条对应的单测 | 删除订阅去重、线程作用域、终态收窄三处 guard 时对应用例必须失败（已做变异验证） | Inspected |
| 设计 token 与暗色一致 | `docs/develop-guides/design.md` | `pnpm run check:tokens` 与浅/深两套真实页面截图 | 使用 Tailwind 默认调色板类必须被门禁拒绝 | Passed |
| 组件库单一来源 | `docs/develop-guides/design.md`、`web/package.json` | 依赖清单中不存在 `antd`，`check:tokens` 覆盖全部组件 | 任何 `web/src` 文件 import `antd` 必须被拒绝 | Superseded：[Web 前端向 Yuxi 视觉与组件基座对齐](2026-10-11-web-antd-yuxi-alignment.md) 反转了组件库路线，`antd` 5 已成为基座 |
| 依赖方向约束生效 | `web/ARCHITECTURE.md`、`web/steiger.config.ts`、`web/.dependency-cruiser.cjs` | `pnpm run lint:fsd && pnpm run arch:check`（304 模块 / 1171 依赖，无违规） | 人为让两个切片互相 import 或让 `shared` 引用上层时报错 | Passed |
| 全量前端门禁 | `web/package.json`、`.github/workflows/web.yml` | `pnpm run test:unit`（117 文件 1375 例）、`check-types`、`lint:check`、`check:tokens`、`lint:fsd`、`arch:check`、`api:check`、`build` 全绿 | 任一命令非 0 即未通过 | Passed |
| S5.1 模型供应商 | `web/src/features/model-providers` | 5 文件 52 例；15 条变异全部被抓住；真实链路 14/14（含清除密钥端到端、默认模型保护不发 DELETE），截图 `web/tmp/s51-*` | 密钥留空却下发 `api_key`、去掉停用/删除默认供应商的拦截、编辑模型整对象替换时对应用例必须失败（已做变异验证） | Passed |
| S5.3 技能 | `web/src/features/skills`、`web/src/pages/skill-detail` | 7 文件 84 例；3 条变异被抓住；真实链路 15/15（上传 SKILL.md → personal 确认 → 列表出现 → 读文件 → 删除 → 清单复原），截图 `web/tmp/s53-*` | 详情页返回丢 `?tab=skills`、整份草稿零成功不补删草稿、批量删除不拦 50 上限时对应用例必须失败（已做变异验证） | Passed（远程安装未验证） |
| S5.2 数据总览 | `web/src/features/dashboard`、`web/src/pages/dashboard` | 15 文件 122 例；4 条变异被抓住；真实链路 54/54（分页与筛选归位、翻页 offset、行内详情、暗色 canvas 像素、切 tab 不重发请求），截图 `web/tmp/s52-*` | 去掉非零尺寸守卫、主题不重建实例、卸载不 dispose、0 反馈照样显示百分比时对应用例必须失败（已做变异验证） | Passed（三张空数据表的面板未验证有数据形态） |
| 与参照实现的全站截图对照 | 参照实现 `Yuxi/web`（一次性参照，不在本仓） | 两侧用同一张超管令牌、同一个后端：迁移侧 `web/tmp/s5{1,2,3}-*`，上游侧 `web/tmp/upstream-{providers,skills,dashboard}-{light,dark}.png`（上游 dev server 5400 代理到本机 5050） | 差异必须落在已声明的偏离清单里 | Inspected：结构与文案一致（技能卡与分组、供应商卡片与「管理模型」、总览的六张指标卡/调用统计/活跃度热力图/智能体分析/工具监控/知识库统计）；观测到的差异全在声明范围内——上游品牌图标取自 CDN、上游多一组硬编码推荐套件、上游把统计放在页头芯片而本仓放在工具条、本仓的满意度表对 0 反馈显示「—」并多一个会话状态分布面板；未做像素级并排比对 |
| `frontend/` 删除且无残留引用 | 仓库根 `.gitignore`、`Taskfile.yml` | `frontend/` 445 个 tracked 文件整体删除（677 MB），`.gitignore` 的冻结规则与 `Taskfile.yml` 的冻结注释同步清理；全仓无对 `frontend/` 的代码引用 | 重新引入该目录时 `git status` 会看到未跟踪内容 | Passed |

已知未验证范围：远程技能安装（沙盒 + 外网 + 域名白名单）、技能导出下载的浏览器侧、非管理员账号的真实页面走查、`tool_calls`/`message_feedbacks`/`knowledge_*` 三张空表的**有数据**形态、`gemini`/`openrouter` 供应商的真实协议适配、远端模型拉取的出网路径、生产构建下的 PDF worker 加载。
