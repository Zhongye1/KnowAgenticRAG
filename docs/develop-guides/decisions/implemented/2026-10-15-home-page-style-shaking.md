# 首页样式的死代码清理与布局迁移

状态：implemented
类型：simplification
Owner：web/src/styles/home.css

## 问题

首页样式是从模板整包搬进来的（`web/src/styles/home.css` 1876 行、`home-panels.css` 420 行、`home-tokens.css`）。搬入后页面删掉了 endpoint、metrics-horizon、nexus-console、context 四个组件（`web/src/pages/home/ui/` 已无引用），但它们的全部样式仍留在 CSS 里。另有从未命中任何 DOM 的选择器：`.capability-item.is-active`（能力项从未被赋予该 class）、`.active-nav-link` 与 `nav-wrap[data-current-path=...]`（顶栏不再有当前路径）、`.home-footer-logo`、`.home-site :where(body)`（body 不可能是 `.home-site` 的后代）。

同时首页用页面级 class 表达布局（flex/grid/gap/padding/定位），与仓库其余页面（Tailwind 工具类 + `cn()`）不一致，一个元素的版式要跨 JSX 与 CSS 两处阅读。

## 决策

1. 删除首页 CSS 中匹配不到 DOM 的规则，并把只服务 hero 图表、能力段与标题下划线的 `home-panels.css` 合入 `home.css`，其 import 从 `web/src/app/main.tsx` 移除。
2. 首页样式分两层：`styles/home.css` 与 `styles/home-tokens.css` 只保留「皮肤」——类型层重置、颜色、渐变、滤镜、边框、字体与字号、阴影、过渡、伪元素、`:hover`/`:focus`/`.is-*` 状态、`@keyframes` 以及响应式覆盖里的皮肤部分。布局（显示方式、flex/grid、gap、内外边距、尺寸、定位、溢出、层级、对齐、指针事件）迁到 `web/src/pages/home/ui/*.tsx` 的 Tailwind 工具类。
3. 颜色继续只写在 `src/styles/**`：`scripts/check-design-tokens.mjs` 禁止 `.tsx` 出现硬编码色值与 Tailwind 调色板类，而首页自带调色板不在 `styles/tokens.css` 里，所以皮肤层必须留在 CSS 侧。

## 替代方案

- 整页改用 Tailwind 调色板类：被 `check-design-tokens.mjs` 拒绝，且会改掉首页配色。
- 把首页色板并入 `styles/tokens.css` 再用 token 工具类：动全局 token 表，超出首页范围；首页配色是页面级而非全局语义色。
- 只删死代码、不做布局迁移：留下两套样式表达方式，认知负担不变。
- 保留 `home-panels.css`：文件删完只剩两条伪元素规则，独立存在已无 Owner。

## 后果

- `home.css` 由 1876 行降到约 800 行；`home-panels.css` 删除；`home-tokens.css` 去掉已迁走的布局声明。
- 首页版式在 JSX 阅读，配色/字体/状态在 CSS；完整描述一个元素仍需看两处。
- `.capability-item.is-active` 的删除是显式的：该高亮视觉从未生效，能力项不含该 class。
- `home-panels.css` 里的 `:where(@supports (color:color-mix(...)))` 是无效选择器，浏览器整条丢弃，删除后行为不变。
- 顶栏移动端下拉与汉堡形变仍是 CSS 状态规则（依赖 `:nth-child` 与 `.is-open`），未工具化。

## 验证

- 计算样式 diff（1440×900，冻结动画后逐元素比对 143 个元素的全部 computed 属性）：迁移前后只剩 5 处不可见或同义差异——`nav-menu-button` 的 `background-position`（`background:0 0` → `bg-transparent`，`0px 0px` 与 `0% 0%`）与 `border-color`（宽度 0、样式 `none`，不渲染）；`.section-intro` 与三个 `li` 的 `align-self/align-items`（`start` → `flex-start`，对 flex/grid 同义）。该 diff 抓出并修复了一处真实回归：≥721px 下 `.hero-pointer-spotlight` 的 `display:none` 未随迁移带过来。
- 视觉：5174 开发服务器，桌面 1440 与移动 390 视口截图与迁移前一致（顶栏折叠、汉堡按钮、hero 三段控件、能力项列表、页脚堆叠）。
- 门禁：`node scripts/check-design-tokens.mjs` 通过；`npx tsc --noEmit` 未新增错误；`npx oxlint src` 仍为 `31 warnings and 3 errors`；根目录 `python3 scripts/verify_engineering_contracts.py` 仍只有既有的 1 条 Owner 失效；`python3 -m unittest scripts.test_verify_engineering_contracts` 62 通过；`git diff --check` 干净。
- 单测：全量 `vitest run` 为 19 failed / 2492 passed。其中 14 个失败（8 个文件）与改动前一致；另 5 个来自工作区里已删除的 endpoint/metrics/nexus/context 组件对应的 `home-page.test.tsx` 文案断言，以及 `nexus-console.test.tsx` 导入已删除模块——两者在本次改动前就失败。
- 独立 Reviewer（全新上下文）复核暴露了桌面 computed diff 覆盖不到的三处问题，均已修复：
  - Tailwind v4 的 `max-[Npx]:` 是排他区间（编译为 `@media (width < Npx)`），与 CSS 的 `max-width: Npx` 差 1px：视口正好 720px 时汉堡与下拉同时不生效，导航不可达。页面统一改用 `max-[721px]:`（= 原 `≤720`，与 `min-[721px]:` 无缝相接）与 `max-[1024px]:`，CSS 侧改为 `@media (width < 721px)` 对齐同一档边界。
  - ≤720 的 `.hero-data-flow-icon` 配色 `color: var(--accent-cyan)` 与 `flex: none` 未随迁移带走：配色回 CSS，`flex-none` 进工具类。（桌面 diff 看不到，因为该规则只在移动档出现。）
  - 基础 `.nav-links a` 的 `transition: background .2s, color .2s` 未迁移：回 CSS。
- 迁移后的产品改动（不改写上面的迁移等价结论）：顶栏改为 `sticky top-0 z-50` 吸顶、`.nav-shell` 底色由渐变改为 `#fdfcfaf5` 加 `backdrop-filter: blur(8px)`；品牌标识统一指向 GitHub 头像（顶栏按「内容就地硬编码」写字面量，导航列用 `BRAND_LOGO_URL`）；顶栏改为自包含组件——只留 `isLoggedIn` 一个 prop，文案、logo 地址与工具类都写在原地，去掉 `NAV_LINK_CLASS` 常量与 `brandName`/`logo` prop，首页因此不再请求 system-info；`.section-intro` 不再吸顶、回到常规流。
- 旧能力不存在：`src/styles/home-panels.css` 不再存在；首页 CSS 只保留皮肤、类型层重置、伪元素几何、≤720 顶栏下拉/汉堡的状态块，以及 `.home-state-title`/`.home-state-message` 的 `margin: 0`——`:where(h1, p)` 重置是无层规则，utilities 层的 `m-0` 压不过它，只能同层声明。
- 重新引入条件：若首页色板并入全局 token 并使 `check-design-tokens.mjs` 允许首页使用 token 工具类，可把皮肤层也迁到 Tailwind；若某元素确需页面级 CSS Module，应先说明它比当前两层分工认知负担更低。
