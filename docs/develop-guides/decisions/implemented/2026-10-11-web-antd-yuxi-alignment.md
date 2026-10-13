---
title: Web 前端向 Yuxi 视觉与组件基座对齐
description: antd 5 基座、层叠顺序、Yuxi token 与登录页样板的当前决定，以及尚未迁移的范围
---

# Web 前端向 Yuxi 视觉与组件基座对齐

状态：implemented
类型：architecture
Owner：web/ARCHITECTURE.md

事实分工：`web/ARCHITECTURE.md` 拥有分层与依赖方向；`web/src/styles/yuxi-tokens.css` 拥有 Yuxi 色板事实，`web/src/styles/tokens.css` 仍拥有未迁移页面的色板事实；`web/src/index.css` 拥有层叠顺序；`web/scripts/check-design-tokens.mjs` 拥有硬编码颜色门禁；`docs/develop-guides/design.md` 拥有视觉与组件规范，本次同步技术栈约束，完整收口在全部页面迁完后进行。

## 问题

`web/` 的视觉与组件基座与参照实现（Vue 3 + ant-design-vue 的 Yuxi）系统性不一致：主色是 Arco 蓝 `#165DFF` 对 Yuxi 的青绿加暖金；组件基座是 shadcn/Radix 对 antd；圆角刻度 0/2/4/8 对 8/16/999，`shared/ui` 的 Button、Card、Input 都是 `rounded-none`，连本仓 `design.md` 自己写的「卡片 8px 圆角」都没有落实。

交互层面，逻辑层已是参照实现的 1:1 移植，但从未逐条核对，且登录页存在明确缺口：`/api/system/info` 没有任何消费方，首次运行初始化、423 锁定倒计时、OIDC 探测与自动跳转、协议门禁都不可达。

`docs/develop-guides/decisions/implemented/2026-10-01-web-react-migration-design.md` 当时明确否掉了 antd（「不引入 ant-design 的 React 版本」），并把「任何 `web/src` 文件 import antd 必须被拒绝」列为 Passed 的验收主张；`docs/develop-guides/design.md` 也写着「不引入第二套组件库」。本次是对那条决定的显式反转，必须重新记录取舍，并让旧记录与设计规范不再与代码矛盾。

## 决策

### 目标栈

React 19 不变，组件基座换成 antd 5；页面样式用 CSS Modules 与原生 CSS，颜色走 Yuxi 的 CSS 变量；Tailwind 保留给布局与间距工具类，本次不引 Sass。`web/src/shared/ui` 下的 shadcn/Radix 组件进入滚动收缩：只减不增，每迁完一个页面切片统计剩余引用，归零即删，依赖在最后一个使用者消失后移除。

### 层叠顺序

`web/src/index.css` 顶部声明 `@layer antd, theme, base, components, utilities;`：

- antd 的 CSS-in-JS 由 `web/src/app/theme/antd-provider.tsx` 的 `StyleProvider layer` 注入 `@layer antd`，位于最低层。无层注入的 antd 样式会压过 Tailwind 工具类与 CSS Modules。
- Tailwind 只引 `theme.css` 与 `utilities.css`、跳过 preflight，全局重置由 antd 的 `reset.css` 主导。
- `reset.css` 在 `index.css` 里按 `layer(base)` 引入。无层作者样式会压过任何层内规则，未迁移页面的 `font-*` / `text-*` 工具类会因此集体失效。
- CSS Modules 是无层样式，优先级最高，承载页面私有的 `.ant-*` 覆盖（`:global()`）；`web/src/styles/antd-overrides.css` 只放全局覆盖。

### 主题与色板

`ConfigProvider` 按参照实现的 `stores/theme.js` 平移：`colorPrimary` 取 `--antd-color-primary-seed`（`web/src/styles/brand.css` 持有这个不随主题反转的种子色，值等于参照实现的字面量），`colorLink` / `colorLinkHover` / `colorLinkActive` 读 `--main-color` / `--main-600` / `--main-800`，`borderRadius: 8`，字体栈与参照实现同值，暗色用 `theme.darkAlgorithm` 跟随 `html.dark`。种子色的事实放在 `web/src/styles/brand.css`：`check-design-tokens.mjs` 对样式目录外的硬编码颜色零豁免，而 antd 的色板算法只接受具体色值、不认 `var()`。

`web/src/styles/yuxi-tokens.css` 原样并入参照实现的 `base.css` 与 `base.dark.css`，迁移期与 `tokens.css` 并存；未迁移页面继续用旧变量，全部页面迁完后删除旧变量。`web/public/` 从参照实现拷贝 `favicon.svg`、`avatar.jpg`、`login-bg.jpg` 与 `protocols/`。

### 迁移方法

页面切片内部固定六步、顺序不可颠倒：列逻辑单元 → 按 8 个维度抽行为契约 → 产出差异表 → 只改「不同」与「缺失」并先写含负向用例的逻辑层测试 → 再写 UI → 真实页面逐条走查。判「复刻完成」需要契约项全部等价、负向用例能失败、真实页面走查通过、涉及持久化或队列或 SSE 的有 integration 或 E2E 结果。全局只有一个例外：样式基座先做一次，否则无法验证任何页面的视觉。

### 已落地的登录页样板

- 接口与 hooks：登录、首次运行、超管初始化、OIDC 配置与登录地址、系统信息与健康检查全部走契约生成物（路径、表单编码与响应类型由生成物拥有）；hooks 是 `useCheckFirstRun`、`useInitializeAdmin`、`useOidcConfig`、`useOidcLoginUrl`、`useLoginLock`、`useSystemInfo`、`useLoginBranding`、`useSystemHealth`。
- 423 建模成 `LoginLockedError`：剩余秒数优先取 `X-Lock-Remaining`，缺失时从 detail 文案兜底解析，两处都没有时只显示文案不启动倒计时。生成物的失败结果带回 `response`，响应头因此不需要另开手写请求路径。
- 凭据规则由 `web/src/shared/api/base.ts` 拥有：登录这类未认证入口不携带旧凭据，401 只在请求携带凭据时才清凭据并派发未授权事件。密码错误因此不会清掉已有会话。
- 登录与初始化成功后删除 `['authenticated-user']` 缓存条目。写入 `null` 会让路由守卫在 staleTime 内复用匿名身份，把刚登录的用户弹回登录页。
- 协议门禁留在页面：判断内容是「没配置协议就不拦、配置了必须勾选」加一条 toast，没有可独立成单元的领域计算，负向用例由页面测试盯住。
- 重定向目标默认落到聊天页：`/` 是公开落地页，不承载登录后的工作台入口，`sanitizeRedirect` 因此接受调用方给出的兜底路径。

### 首页的视觉基准

`/` 的视觉基准是 AusVector 首页的克隆产物，参照实现在本机 `/home/zhongye/Desktop/backups/ai-website-template-0.6.1`（AI Website Cloner Template 0.6.1，MIT，JCodesMore；本地副本里是 ausvector.ai 首页的克隆：`src/components/sites/ausvector/**` 约 2100 行 TSX，`src/app/ausvector.css` 2555 行）。

首页是本迁移里唯一不向 Yuxi 对齐的页面。理由是它作为公开落地页不承载业务状态，视觉目标可以与后台页面不同；其余页面仍按 Yuxi 逐页迁移。

落地方式：

- 结构与交互按参照重写，不复制 Next.js 代码：`'use client'`、`next/font`、`next/link`、Tailwind 工具类与 shadcn/Base UI 组件在本仓换成 React 19 加 Vite、`react-router` 的 `Link`、CSS Modules 与原生元素。
- 色板作为页面级 token 放 `web/src/styles/home-tokens.css`，作用域 `.home-site`，保留参照的取值（`--site-background: #f7f8f3`、`--ink: #0b1320`、`--accent-cyan: #0b2a6f`、`--accent-gold: #855811` 等）。放 `src/styles/**` 是因为 `check-design-tokens.mjs` 只豁免该目录，页面 CSS Modules 里写 hex 会被门禁拒绝。接入面板的语义配色（`nx-*`）以类内取值放 `web/src/styles/home-panels.css`，与 `home.css` 同在豁免范围内。
- 参照的基色是浅色（`--site-background: #f7f8f3`），它那 39 条 `.dark` 规则是为模板的 shadcn 暗色 token 打的补丁；首页因此固定浅色，不跟随 `html.dark`，也不搬那些补丁。
- 字体沿用本仓现有字体，不新增字体依赖：参照的 `--font-manrope` 映射到系统 sans 栈，`--font-plex-mono` 映射到已加载的 JetBrains Mono Variable（参照走 `next/font/google` 加载 Manrope 与 IBM Plex Mono）。映射层写在 `home-tokens.css`。
- 正文文案照搬参照实现的原文（hero 标题与描述、指标条、接口段、接入方式面板、能力段、上下文段、页脚），不做改写。只有顶栏的三处取本仓配置：`organization.name`、`branding.name`、`organization.logo`。
- 接入方式面板的三张标签页里，API 与 CLI 两页用本仓事实：`POST /api/agent/runs` 配 `Authorization: Bearer arskey_…`（见 `docs/advanced/api-key-integration.md`）、`uv tool install ars-cli`（见 `docs/intro/cli.md`）。接口段运行卡展示的端点串同为 `POST /api/agent/runs`。
- 外链指向本仓资产：文档站、GitHub、协议页（`/protocols/**`）。参照的三条顶栏链接（Playground、Ausdata Science）与页脚的公司链接在本仓没有对应页面，顶栏换成文档站、仓库与登录入口。
- 接入方式面板的 MCP 页与身份类字符串（页脚的 `© 2026 Ausdata Science Pty Ltd`、`PRIVATE BETA ACCESS`、`https://mcp.ausvector.ai/mcp`、`YOUR_MATRIX_KEY`）保留参照原文，属于待定稿状态：本仓只有 MCP 客户端，没有对外 MCP 网关，这些串描述的不是本仓的事实，对外发布前必须替换。
- 参照的内测申请表不做：本仓没有接收它的后端，表单位置留显式占位块（`context-placeholder`）。参照的 3D 数据图（`DataAtlas`）不搬，hero 里换成用户提供的 logo 粒子轮播（`web/src/pages/home/ui/ArkParticleAnimation.tsx`），素材是 `web/public/assets` 下的两张 logo，5 秒自动轮播；组件去掉了缩略图选项栏、深色面板与内置示例 logo，画布尺寸与响应式由 `home-panels.css` 的 `.hero-atlas` 负责；画布对辅助技术隐藏，减少动效时只画一次静态结果、不轮播。
- 首页是连续滚动的长页，与参照一致；参照按 `window.scrollY` 的接口段压缩态照搬保留。
- 三态契约与视觉基准无关，照搬：健康检查通过后才加载配置（`useSystemInfo` 的 `enabled`），失败进错误态并可重试。
- 首页不含副标题轮播：参照的 hero 描述是静态文案，页面不留没有内容来源的轮播。登录入口在顶栏，按 `useUser()` 的登录态给「进入控制台 / 登录」，未登录时带上回到 `/` 的回跳参数。
- 不搬参照的 `public/` 图片与视频。MIT 只要求保留版权声明，重写后的代码在文件头注明出处与许可。

### 滚动收缩的首次清理

`web/src/shared/ui` 里零引用的 7 处已删除：`command`、`link`、`page-transition`、`pagination`、`popover`、`resizable`、`form/`。`page-transition` 在 `web/src/index.css` 里的配套规则同样零 consumer，一并删除：`.page-transition`、`::view-transition-*(page-content)`、`vt-page-out` / `vt-page-in` 关键帧、无条件的 `::view-transition-*(root)` 抑制规则，以及 page-content 的 `prefers-reduced-motion` 块。`head` 不在清理范围：`web/src/shared/ui/content-layout.tsx` 以相对路径引用它。

`web/src/index.css` 的主题切换注释块保持 `/*` 与 ` * ` 前缀完整：前缀缺失时该注释被解析成非法选择器，紧随其后的 `html.theme-transitioning::view-transition-*(root) { animation: none; mix-blend-mode: normal; }` 整条被丢弃，主题切换就会叠上浏览器默认的 root 淡入淡出。这条抑制规则与 `DayNightSwitcher` 的 clip-path 过渡配套，只作用于 `html.theme-transitioning` 期间。可观察点：构建产物含 `html.theme-transitioning::view-transition-old(root){mix-blend-mode:normal;animation:none}`；只删 `page-transition` 段而注释仍损坏时，产物里 `mix-blend-mode:normal` 出现 0 次。

随这些组件一并移除的直接依赖：`cmdk`、`@radix-ui/react-label`、`react-hook-form`、`@hookform/resolvers`、`react-resizable-panels`、`zod`，以及本轮引入但无 consumer 的 `@ant-design/icons` 与 `dayjs`。`dayjs` 仍作为 antd 的传递依赖留在 lockfile 里。

### 决定的范围

本决定覆盖基座与登录页样板。入口与外壳、对话与知识库主链路、扩展面与长尾页面仍按参照实现逐页迁移；`docs/develop-guides/design.md` 的完整视觉规范、Sass mixin 与 Tailwind 布局化的评估、shadcn 与 Tailwind 的移除在全部页面迁完之后进行。

## 替代方案

**保留 shadcn/Radix，只把 token 值换成 Yuxi 色板。** 改动最小，但尺寸、圆角与交互状态仍来自 shadcn，达不到还原度目标。

**Tailwind 与 Sass 混合。** 参照实现的 Less 里 `@mixin`、`@include`、`@extend` 出现 0 次，颜色 3160 处走 CSS 变量，Less 只承担嵌套，没有可复用的 mixin 可搬；而 antd 是 CSS-in-JS 无层注入，与 Tailwind 的 `@layer utilities` 需要显式排层，先抽象会先造一层没有事实支撑的中间层。

**先全站做 UI、再全站补交互。** 参照实现的 UI 结构是状态机的投影，水平切会两遍返工。

**逐文件复刻参照实现的组件。** 保真最高，估 150–260 人日，且无法中途交付。

**继续不引 antd（原决定）。** 见「问题」：两套视觉继续分裂，`design.md` 的圆角与尺寸约束继续落不了地；本次按参照实现的交互与视觉事实反转该决定。

## 后果

迁移期两套视觉并存：未迁移页面保持蓝底 shadcn，迁一页变一页，全部迁完前不宣布对齐完成。

首页是唯一不向 Yuxi 对齐的页面，因此全站会有三种视觉来源（未迁移页面的 shadcn、Yuxi 对齐页面、AusVector 基准的首页）。首页的色板只作用于 `.home-site`，不进入 `tokens.css` 或 `yuxi-tokens.css`。

antd 与 Tailwind 的层叠关系是最容易出错的地方：antd 默认无层注入会压过工具类，`StyleProvider layer` 未生效时覆盖关系与预期相反。构建产物里 `@layer` 的首次出现顺序是这条约束的可观察点。

组件基座替换会让既有 DOM 断言大面积失效：登录页没有可继承的既有测试，`test/unit` 其余文件在基座替换后保持全绿（124 文件 / 1425 例），后续页面迁移仍需逐个核对。

参照实现的 306 处 `.ant-*` 覆盖依赖 antd 的 DOM 结构：ant-design-vue 4 与 antd React 5 多数类名一致，Modal、Drawer、Table、Form、Select 的内部结构存在差异，搬运时逐条核对。

FSD 与参照实现扁平结构的冲突：参照实现 `components/` 里的跨领域组合件，搬运时拆到哪个切片需要逐个判断。段名受 steiger 约束，`providers` 这类 React 禁用段名不能用。

登录成功后不再预热智能体清单（参照实现会 `await agentStore.initialize()`）：本仓对话页自己装配查询，需在 M3 走查时确认首屏没有因此多一次空态闪烁。

OIDC 回跳目标与一次性标记是参照实现里登录页与回调页共享的契约，回调页属 M5：`readOidcRedirect` 与 `clearAutoStartAttempt` 目前只有契约测试消费，回调页落地时必须接线。

`@ant-design/icons` 与 `dayjs` 没有直接 consumer（图标沿用 `lucide-react`，`dayjs` 只是 antd 的传递依赖），已连同零引用的 shadcn 组件一起移除，需要时再装。

`web/alembic/` 是本地过程台账（决策稿、契约差异表、逐页汇报），被 Git 忽略，不是组织记忆；durable 证据是源码与测试。

## 验证

| 验收主张 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
| --- | --- | --- | --- | --- |
| 引入 antd 后现有页面与测试不回归 | `web/src/index.css`、`web/src/app/theme/antd-provider.tsx` | `pnpm run test:unit`（124 文件 / 1425 例）、`pnpm run build`、`pnpm run lint:fsd`、`pnpm run arch:check`（323 模块 / 1212 依赖） | 去掉 `@layer antd` 声明或让 antd 无层注入时，工具类覆盖必须表现为失效 | Inspected（门禁与构建全绿；真实浏览器逐页回归由迁移方执行） |
| 层叠顺序可预测 | `web/src/index.css` | 构建产物中 `@layer` 首次出现顺序为 `properties, antd, theme, base, components, utilities` | 把 antd 移出 layer 后，`.ant-*` 覆盖与工具类的优先级必须改变 | Inspected |
| Yuxi token 入库且不污染现有变量 | `web/src/styles/yuxi-tokens.css`、`web/src/styles/tokens.css` | 与参照实现 `base.css` / `base.dark.css` 逐值一致；`pnpm run check:tokens` | 修改 `--primary-6` 时，未迁移页面的 `bg-primary-6` 必须不跟随 | Passed |
| 硬编码颜色门禁仍有效且无需豁免改动 | `web/scripts/check-design-tokens.mjs` | `pnpm run check:tokens`（本机以 `node scripts/check-design-tokens.mjs` 执行） | 在 `src/styles/**` 以外的 `.tsx` 写入 hex 时 gate 必须失败；种子色因此落在 `brand.css` | Passed（脚本只把取根目录的 `URL.pathname` 换成 `fileURLToPath`，豁免清单未改；注入 hex 后 gate 正确报出该文件） |
| 逻辑契约先于 UI 落地 | `web/src/entities/session`、`web/src/pages/login` | `test/unit/entities` 与 `test/unit/pages/login-page.test.tsx` 共 54 例 | 移除 423 分支后锁定用例失败；移除 `sanitizeRedirect` 的 `//` 与 `/\` 判断后开放重定向用例失败（均已做「改坏 → 失败 → 还原」验证） | Passed |
| 登录成功不被弹回登录页 | `web/src/entities/session/model/session.tsx` | `test/unit/entities/session-login-cache.test.tsx` | 把删除缓存改回写 `null` 时两条用例必须失败 | Passed |
| 登录失败不清掉已有会话 | `web/src/shared/api/base.ts` | `test/unit/shared/api.test.ts`（未认证入口不带凭据、401 只在带凭据时失效） | 去掉未认证入口的跳过或去掉 `credentialed` 判断时对应用例必须失败（已做变异验证） | Passed |
| LoginView 覆盖首次运行、锁定与 OIDC | `web/src/pages/login`、`web/src/entities/session` | `test/unit/pages/login-page.test.tsx`（8 例，含协议门禁负向与默认重定向） | 去掉页面 423 分支或协议门禁时对应用例必须失败（已做变异验证） | Inspected |
| 登录链路真实可用 | `web/src/pages/login` | 真实页面用 `backend/scripts/seed_initial_users.py` 的账号登录、干净库首次运行、连续错误密码触发 423 倒计时 | 连续错误密码后必须进入 423 倒计时并显示剩余时间 | Not run（`web-dev` 容器镜像的 `node_modules` 早于本次依赖变更，需先 `docker compose build web`） |
| 搬运后仍满足 FSD 与依赖方向 | `web/ARCHITECTURE.md`、`web/steiger.config.ts` | `pnpm run lint:fsd`、`pnpm run arch:check` | 在 `pages` 里直接引用 `features` 内部文件时 Steiger 必须报错 | Passed |
| 视觉与参照实现对齐 | `docs/develop-guides/design.md`、`web/alembic/pages/login/report.md` | 除 `/` 外逐页与 Yuxi 做浅色 / 暗色 / 窄屏截图对照；`/` 与 AusVector 参照做同尺寸对照 | 差异必须落在台账的「声明偏离」清单里 | Not run（迁移方执行） |
| 首页按 AusVector 基准落地 | `web/src/pages/home`、`web/src/styles/home-*.css` | `pnpm run test:unit`（127 文件 / 1449 例）、`pnpm run build`（49.11s），以及 `home-page.test.tsx`、`nexus-console.test.tsx`、`atlas-carousel.test.ts` 与 `system-info.test.ts` 的品牌投影用例 | 去掉配置加载门禁、去掉顶栏的登录态分支、把接入面板的标签绑定换成固定项、把端点复制换成写死的 MCP 端点、把 CLI 的调用形态写回 `STDIO / POSIX`、把轮播下标改成不回绕时对应用例必须失败（已做变异验证） | Inspected（门禁与构建全绿；logo 粒子轮播的观感与轮播时序、文案定稿、与参照的视觉对照与三态真实页面走查由迁移方执行） |
| 主题切换的 root 转场抑制在构建产物里生效 | `web/src/index.css` | 产物含 `html.theme-transitioning::view-transition-old(root){mix-blend-mode:normal;animation:none}` | 只删 `page-transition` 段、注释块仍损坏时该规则被浏览器丢弃，产物里 `mix-blend-mode:normal` 出现 0 次（实测即此状态） | Inspected（构建产物已核对；主题切换的真实观感未走查） |

迁移方执行的验证与命令：走查 `/login` 的浅色、暗色与窄屏，并覆盖登录、干净库首次运行、连续错误密码触发 423 三条真实链路；未迁移页面在 antd 基座下的回归截图；主题切换的真实观感走查；`cd docs && pnpm run build`。逐页台账与截图在 `web/alembic/pages/login/report.md`。

已知未验证范围：其余页面在 antd 基座下的真实浏览器回归、OIDC 真实跳转（本机没有可用的 OIDC 配置）、`design.md` 的完整视觉规范收口、首页与 AusVector 参照的视觉对照、首页照搬文案与 MCP 页的定稿、首页 3D 数据图（logo 粒子轮播）的观感与轮播时序、两张 logo 素材的来源与许可。
