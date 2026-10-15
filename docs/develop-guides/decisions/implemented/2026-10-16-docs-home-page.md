# 文档站首页改为移植的 SPA 落地页

状态：implemented
类型：feature
Owner：docs/theme/home/ui/home-page.tsx

事实分工：`docs/theme/home/` 拥有文档站首页的 JSX、站内目标与截图模块；`docs/index.mdx` 拥有首页这个路由的装配方式（`pageType: custom` + 站点外壳的取舍）；`web/src/styles/home-tokens.css` 与 `web/src/styles/home.css` 拥有首页的 token 与皮肤（两个站点共用一份）；`web/public/assets/home/**` 拥有首页截图（两个站点共用一份）；`web/src/pages/home/ui/home-page.tsx` 拥有 SPA 首页。

## 问题

1. **两个站点的首页不一致。** 迁移到 Rspress 时首页只落了 `pageType: home` 的 `hero` + `features` 占位（见 [2026-10-15 迁移记录](./2026-10-15-docs-site-rspress-migration.md)），而产品首页已在 `web/src/pages/home` 重做成五段式静态展示页（任务链、知识工作六块、RAG 链路、集成、私有化部署）。结果是：作为公开入口的文档站首页只有四行特性列表，真正的落地页只在自部署实例里看得到。
2. **两边不是同一套构建。** `docs/` 是独立 pnpm 项目（自己的 `package.json`、`pnpm-lock.yaml`、rsbuild 根、Rspress 外壳），`web/` 是 Vite + React + antd + Tailwind 4。首页的版面一半写在 JSX 的 Tailwind 工具类里，一半写在 `web/src/styles/home.css` 的皮肤层里，没有现成的共享方式。

## 决策

1. **文档站首页就是 SPA 首页的移植。** `docs/index.mdx` 以 `pageType: custom` + `navbar: false` 渲染 `theme/home` 的 `HomePage`：Rspress 只渲染这一页的内容，不套文档站的顶栏、侧边栏与文档排版，顶栏与页脚由首页自己提供。
2. **皮肤、token 与截图各一份。** `docs/theme/home/styles/home.css` 用 `@import` 引用 `web/src/styles/home-tokens.css` 与 `web/src/styles/home.css`（`docs/theme/custom.css` 引用 `tokens.css` 已经是同一手法）；截图只有 `web/public/assets/home/` 一份，docs 侧由 `theme/home/lib/shots.ts` 按相对路径导入，交给 rsbuild 生成带 `base` 与内容哈希的地址。
3. **组件是移植，不是逐字复制。** 与 SPA 版的差别集中在站点相关处：顶栏第三项从会话入口（登录 / 进入控制台）换成「快速开始」；站内链接走 `@theme` 的 `Link`（补 `base` 前缀并做客户端跳转），不再写文档站的绝对地址；图片地址走导入的模块；Hero 主按钮从「阅读文档 ↗」改成站内的「快速开始 →」。其余段落与 SPA 版逐字一致（顶栏与 Hero 的 `className` 已逐条比对）。
4. **文档站接入 Tailwind v4，只取 theme 与 utilities。** `docs/postcss.config.mjs` 挂 `@tailwindcss/postcss`，`theme/home/styles/home.css` 声明层序 `theme, base, components, utilities` 并 `@import 'tailwindcss/theme.css'` / `utilities.css`（不引 preflight：站点重置由 Rspress 的 `rp-base` 层拥有），`@source` 只列 `theme/home/{ui,lib}`，不按 `docs/` 全站扫描。
5. **目标页按「哪一页拥有这件事」重排。** 站内路径由 `theme/home/lib/links.ts` 与 `web/src/pages/home/lib/links.ts` 两份 1:1 的模块给出：了解 RAG → `/intro/knowledge-base`，了解 Agent → `/agents/agents-config`，智能体评估 → `/agents/agent-evaluation`，了解沙箱 → `/agents/sandbox-architecture`，了解图谱 → `/advanced/knowledge-base-operations`，了解 Skills → `/agents/skills-management`；流程五步 解析 → `/advanced/document-processing`、切分与索引 → `/intro/knowledge-base`、混合检索 → `/mechanisms/knowledge-base`、重排 → `/intro/model-config`、引用 → `/intro/knowledge-base`；集成段的「查看全部」→ `/intro/model-config`。通用「文档」入口指向 `/intro/project-overview`。
6. **Hero 的第二个按钮是 GitHub 入口 + 仓库 star 数。** 原「查看集成 ↓」（锚到本页集成段）改成指向仓库：文案「GitHub ★ <数量> ↗」，品牌标用 `@lobehub/icons` 的 Mono 形态（与集成段的品牌标同一层，`currentColor`）。star 数在客户端取一次 `https://api.github.com/repos/{owner}/{name}`（静态站没有构建期取数的位置，API 路径从 `href` 推导）；取不到——离线、限流、被墙——就只渲染「GitHub ↗」，不写死会过期的数字，也不显示 0。
7. **仓库地址统一为改名后的 `https://github.com/Zhongye1/KnowAgenticRAG`。** SPA 的 `REPO_URL`（外壳与首页共用）、文档站首页的 `outbound.repo`、Hero 的 star 数都取这一份；旧名 `KnowledgeRAG-OGAS` 在 GitHub 上仍会重定向，但 API 路径要走一次跳转。
8. **站点图标换成 SPA 的 favicon（React 标）。** `docs/public/favicon.svg` 与 `web/public/favicon.svg` 是同一份内容（Rspress 的 `icon` 与 `logo` 都取它），两个文件要一起换；`rspress.config.ts` 就地注明这层耦合。

## 替代方案

1. **让 docs 直接 import `web/src/pages/home` 的组件。** 省掉一份 JSX，但要在 docs 的 rsbuild 里加 `@/` 别名替身，把 `react` / `react-dom` / `react/jsx-runtime` 别名到 docs 自己的副本（文档站不声明 react，默认解析到 web 的那份会与 Rspress 的 React 并存，触发 invalid hook call），还要把 web 的图片地址改成 base-aware；为省一份 JSX 引入的构建耦合与失效面比移植更大。
2. **删掉 SPA 首页，文档站成为唯一首页。** 会改变自部署实例根路径的行为（默认发布地址是 GitHub Pages，本地/内网部署拿不到），属于产品取舍，本次不做。
3. **首页完全自包含（复制 JSX + CSS + 截图）。** 改动面最小、两个站点零耦合，但皮肤、token 与截图会立刻开始漂移。
4. **继续用 Rspress 的 `pageType: home` 落地页，只把文案补齐。** 视觉与产品首页仍是两套语言，等于不解决本次要解决的问题。

## 后果

- **首页 JSX 有两份**（`web/src/pages/home/ui/*` 与 `docs/theme/home/ui/*`）。改设计时的分界：只动颜色、间距、悬停这类皮肤层，两边同时生效（共用 CSS）；改结构或文案要同时改两份 JSX。
- **docs 构建依赖 web 下的三个路径**：`web/src/styles/home.css`、`web/src/styles/home-tokens.css`、`web/public/assets/home/**`。移动或改名会打断文档站构建（明确报错，不静默降级），`.github/workflows/deploy.yml` 的触发路径已同步这三条。
- **文档站新增依赖**：`tailwindcss`、`@tailwindcss/postcss`（dev）、`lucide-react`、`@lobehub/icons`、`@fontsource-variable/jetbrains-mono`。其中 `@lobehub/icons` 只为集成段与厂商条的 14 个品牌标加 Hero 的 GitHub 标，安装体积不小。
- **Hero 多一次第三方请求**：star 数走 `api.github.com` 的未认证额度（每小时 60 次/IP）。取不到时按钮仍可用，只是没有数字；构建期不取数，因此产物里不含易过期的静态值。
- **首页标题仍是站点标题**（`pageType: custom` 下 Rspress 用站点 `title`），`description` 取 frontmatter；这与迁移后的现状一致。
- **首页不跟随 `html.dark`**：与 SPA 一致（首页固定浅色），文档站切暗色后回首页仍是浅色皮肤，`body:has(.home-site)` 负责画布底色。
- **首页不再锚到集成段**：改版后页面上没有指向 `#integration` 的入口，段落本身仍在（`id` 保留）。

## 验证

- `cd docs && pnpm run build` 成功（148 页）；首页 HTML 从 19.5 kB 增到 75.8 kB，含五段全部标记；生产 CSS 里含共用皮肤（`.home-site`、`.home-band`、`.pillar-shot`、`--font-manrope`）与 Tailwind 工具类（含 21 处 `max-[721px]` 变体）。
- 生产产物用 `pnpm exec rspress preview` 起站后由真实浏览器核对（截图对照 SPA 首页 `localhost:5174`）：顶栏、Hero（含粒子画布与「快速开始」）、任务链、知识工作六块（六张截图按真实像素渲染）、RAG 链路、集成（14 个品牌标有真实 path 且 18×18 盒）、私有化部署、页脚全部渲染；与 SPA 版的差异只有「决策 3」列出的站点相关处。
- 入口落点逐条读过 DOM：六个 pillar 入口、五个流程步骤、四个集成段入口与任务链「查看完整文档」分别落在「决策 5」列出的页面；两站的 `links.ts` 键名一一对应（diff 比对）。
- GitHub 按钮：`href="https://github.com/Zhongye1/KnowAgenticRAG"`，文案「GitHub ★ 135 ↗」且 Octocat 标有真实 path；135 与 `GET /repos/Zhongye1/KnowAgenticRAG` 的 `stargazers_count` 一致。
- 站点图标：`<link rel="icon">` 指向 `/KnowAgenticRAG/favicon.svg`，内容与 `web/public/favicon.svg` 字节一致。
- 交互与路由：任务链 tab 点击换图（水合可用）；顶栏「快速开始」客户端跳转到 `/KnowAgenticRAG/intro/quick-start` 且文档外壳正常；在文档页切暗色后回首页仍是浅色皮肤（`home-site` 背景 `#faf9f4`、墨色 `#101418`）。
- web 侧单测（Node 26，`vitest run test/unit/pages/home-page.test.tsx`）：9/9 通过，其中「hero 的 GitHub 入口指向仓库，star 数来自该仓库的公开 API」「star 数取不到时只留 GitHub 入口，不显示数字」是本条的负向与正向证据，「静态页不请求系统信息与健康检查」同时断言唯一的网络请求是 GitHub API；本文件里过期的页脚版权断言（断言页脚出现下游参照站的版权行，HEAD 上该文案已不存在）改成当前页脚契约（品牌名 + 文档站与仓库两个入口）。lint 仍是既有 3 条错误、`check-types` 仍是既有 5 条错误，都不在本次改动文件里。
- 未验证：GitHub Pages 上的真实部署（本次只在本地 preview 验证，站点 base 与部署分支的现状见 [2026-10-16 站点路径记录](./2026-10-16-docs-base-path-rename.md)）；窄视口（≤721px）未在真实浏览器宽度下复验，只有「生产 CSS 含 21 处 `max-[721px]` 变体 + 与 SPA 逐条比对过 `className`」这一层证据；离线网络下的首页（仍引用外部 logo 图、GitHub 头像与 star API）。
