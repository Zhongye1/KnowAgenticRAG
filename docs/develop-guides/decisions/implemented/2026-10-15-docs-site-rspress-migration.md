# 文档站从 VitePress 迁移到 Rspress（React）

状态：implemented
类型：architecture
Owner：docs/rspress.config.ts

事实分工：`docs/rspress.config.ts` 拥有站点配置（`nav`、`sidebar`、`head`、`base`、`route.exclude`、`builderConfig`、markdown 变换与死链豁免）与内容根的路由边界；`docs/theme/` 拥有品牌色映射（`custom.css` 把 Rspress 的 `--rp-c-brand*` 接到 `web/src/styles/tokens.css` 的 `--primary-*`）与自定义 MDX 组件（`Mermaid`、`Badge`）；`docs/i18n.json` 拥有界面文案覆盖；`docs/package.json` 与 `docs/pnpm-lock.yaml` 拥有依赖集合；`.github/workflows/deploy.yml` 拥有构建与 GitHub Pages 发布。

## 问题

1. **文档站是 Vue 技术栈，与仓库其余部分的 React 前端不一致。** 站点由 VitePress 驱动，`docs/.vitepress/theme/components/ArsHome.vue`（874 行）是手写 Vue 单文件组件，贡献者要在两套框架心智之间切换。

2. **首页组件深度耦合 VitePress 主题。** 它通过 `DefaultTheme.Layout` 的 `home-hero-before` 槽位注入，靠 VitePress 提供导航、搜索与暗色切换；自身消费 8 个 `--vp-c-*` 变量与 `withBase()`。

3. **VitePress 1.x 的构建在本机已经不可完成。** 干净安装（`pnpm install --frozen-lockfile`）后 `pnpm build` 仍然失败：Vue 编译器把两条 decision 记录里行内代码中的 `{{...}}`（`button={{autoInsertSpace: false}}`、`menu={{items}}`）当成插值表达式解析，报 `Error parsing JavaScript expression: Did not expect a type annotation here`。也就是说，迁移前这份内容在 VitePress 下无法产出站点。

4. **内容本身与框架无关**：137 个 Markdown 文件只有四类框架痕迹：`:::` 容器（10 个文件）、` ```mermaid `（3 个文件）、`<Badge>`（1 处，3 个用法）与 frontmatter（3 个文件）。

## 决策

用 **Rspress 2.0.23（React）** 替换 VitePress，内容根仍是 `docs/` 本身，页面 URL 与 GitHub Pages `base: /KnowledgeRAG-OGAS/` 保持不变。

- **配置**：`docs/rspress.config.ts` 平移 `lang/title/description/base/head/sitemap/logo`；`nav` 原样保留；VitePress 的扁平 `sidebar` 数组改写为 Rspress 的 `Record<path, groups[]>`，用单一根键 `'/'` 让全站共用一套侧边栏，分组与顺序不变。`footer` 的 `message` 与 `copyright` 合并进 Rspress 的 `footer.message`；`editLink` 改 `docRepoBaseUrl`；`lastUpdated: true`；`search: true`（本地全文搜索）。
- **路由边界**：Rspress 把 `.ts/.tsx/.js` 也当作页面候选，而内容根就是包根，因此 `route.exclude` 排除 `rspress.config.ts`、`theme/**` 与 `doc_build/**`。缺少 `theme/**` 时配置本身会成为路由，把 Node 侧的 `@rsbuild/core` 拖进客户端产物；缺少 `doc_build/**` 时第二次构建会把上一次的产物 chunk 当成路由再打包一次，直接失败。
- **开发服务器**：`builderConfig.performance.buildCache` 关闭。RSPress 的 dev restart 监听器把 `dev.watchFiles.options.ignored` 写成字符串 glob，rsbuild 内置的 chokidar 只认函数或正则，字符串被当成字面路径，`node_modules` 因此没有被豁免；RSPack 持久缓存每次写 `node_modules/.cache/rspack`（`*.pack` 与 `.temp/*.lock`）都会触发「重启 → 写缓存 → 再重启」，dev server 到不了 ready。`mergeRsbuildConfig` 按条目拼接 `dev.watchFiles`，配置层无法替换那一条，所以关掉持久缓存。CI 只跑 `pnpm build` 且没有缓存复用，本地重建实测仍在 2 秒量级。
- **主题**：删除 `.vitepress/`；`docs/theme/index.tsx` 只做 `export * from '@rspress/core/theme-original'` 并引入 `custom.css`（Rspress v2 要求具名重导出，不再用默认导出）。品牌色映射到 `--rp-c-brand{,-light,-lighter,-dark,-darker,-tint}`；`--rp-c-brand-rgb` 因少数组件按 `rgba(var(--x), a)` 消费，另给逗号分隔值并在 `html.dark` 下切换。
- **界面文案**：`lang: 'zh-CN'` 在 Rspress 内置 i18n 里没有对应键（内置只有 `zh`），因此新增 `docs/i18n.json` 提供 `zh-CN` 覆盖（上一页/下一页/编辑此页/最后更新时间/复制代码等）。Rspress 另有 8 个占位键（版本选择器与 overview 列表用）没有 `zh-CN` 文案，本站在界面里不使用这些组件，因此保留英文回退。
- **内容**：`::: tip` → `:::tip`（标题形式保留）；容器正文以列表或代码块结尾时，closing `:::` 前补一个空行——紧贴列表项或代码围栏的 `:::` 会被前者按 lazy continuation 吞掉，之后的容器解析随之错位；` ```env ` → ` ```dotenv `（Shiki 无 `env` 语言）；任务列表复选框由 Rspress 原生支持。
- **`<Badge>`**：`.md` 里的尖括号标签只被当作原始 HTML（标签名转小写、属性原样保留），组件不参与渲染，版本号会静默消失。因此 `docs/theme/components/Badge.tsx` 以 default 重导出 Rspress 内置 Badge，并在 `markdown.remarkPlugins` 里用 `remarkBadge` 把行内 `<Badge ... />` 提升为内联 JSX 元素，`markdown.globalComponents` 负责注入导入。
- **Mermaid**：Rspress 无官方 mermaid 插件，用 `markdown.remarkPlugins` 里一个最小的 remark 变换把 ` ```mermaid ` 换成 `<Mermaid chart="..." />`，组件走 `markdown.globalComponents` 注册、客户端动态 import 渲染，并监听 `html.dark` 重画。
- **首页**：`ArsHome.vue` 本轮不移植，`docs/index.md` 改用 Rspress 的 `pageType: home` + `hero`/`features` 落地页（后续改成移植 web 的 React 首页，见 [文档站首页改为移植的 SPA 落地页](./2026-10-16-docs-home-page.md)），`ArsHome.vue` 仍在 Git 历史里可取回。
- **发布**：`deploy.yml` 改用 pnpm（`pnpm/action-setup` + `--frozen-lockfile`），构建 `pnpm build`，产物路径 `docs/.vitepress/dist` → `docs/doc_build`。
- **内容基线**：站点内容以 `HEAD` 的 147 个文件为基线，只施加上述机械变换与事实修正，不夹带其他改写。

## 替代方案

1. **Docusaurus**：生态更大，但比 Rspress 重，配置与目录约定离现有内容更远，搜索需要 Algolia 或自接本地搜索。站点规模与需求不值得这份代价。
2. **自建 Vite + React + MDX**：与 `web/` 完全同栈，但路由、侧边栏、目录、搜索、预渲染都要自己实现；这次只换文档框架，不换建站方式。
3. **保留 VitePress，只把首页改写成 React**：VitePress 的首页槽位是 Vue 组件契约，等于同时维护两套运行时，且不解决「文档站是 Vue」这个根因；且见「问题 3」，构建当时已经无法完成。
4. **扩大死链豁免让构建通过**：`docs/AGENTS.md` 明令禁止。两处 `../../../alembic/*` 指向的目标目录本就不存在，属于真实断链，按修复处理（改成行内代码）；只有指向 `docs/` 之外真实仓库文件的两条链接（`CONTRIBUTING.md`、`docker-compose.yml`）按 VitePress 原有豁免语义排除。
5. **把 `<Badge>` 改写成正文文本**：改动最少，但丢掉版本徽标的呈现，也让内容重新带上框架取舍；用 remark 变换保留原写法，内容仍是框架无关的 Markdown。
6. **为 dev server 打补丁或换 chokidar**：修的是依赖内部实现，升级即失效，且把 Node 侧的补丁引进文档站。

## 后果

- 文档站与前端同栈（React 19 + TypeScript），首页组件后续可用 React 重写；站点结构、导航分组与 URL 不变，外部链接不失效。`develop-guides/roadmap.md` 与 `develop-guides/changelog.md` 仍是站点页面，导航与站内引用一致。
- 构建产物目录从 `.vitepress/dist` 变为 `doc_build`；已在 `.gitignore` 增加 `docs/doc_build/`，否则 140 个 HTML 与资源会被提交。
- `pnpm dev` 与 `pnpm build` 都可用；关掉持久缓存后本地全量构建约 4 秒、命中页面的增量构建约 2 秒。
- `docs/AGENTS.md`、`contributing.md`、`documentation-guidelines.md`、`README.md` 里「新页面写进 `.vitepress/config.mts`」「Mermaid 由 VitePress 渲染」的指导改为 Rspress；`scripts/bump-version.sh` 去掉对已删除的 `ArsHome.vue` 的版本改写。
- Mermaid 改为客户端渲染：SSR 阶段只输出空容器，图表在浏览器里出现；构建产物不再包含图，静态抓取拿不到图内文字。
- `docs/vibe/` 与 `docs/AGENTS.md` 仍会被构建成页面（与 VitePress 时期一致）。前者被 Git 忽略、CI 上不存在，不构成发布泄露；后者是既有行为，未在本次扩大范围。
- 首页暂时失去原官网视觉效果，等 React 版 `ArsHome` 落地后恢复。

## 验证

- `cd docs && pnpm install --frozen-lockfile && pnpm build`：通过，`sitemap.xml` 列出 140 个页面，`doc_build` 产出 141 个 HTML（含 `404.html`）与 `search_index.zh-CN.*.json`。
- 逐页核对渲染结果（构建产物 + dev server 双重检查）：18 个 `:::` 容器全部渲染为 `rp-callout--{tip,warning,danger}`，没有 `:::` 泄漏成正文；3 处 `<Badge>` 全部渲染为 `rp-badge` 并显示 `0.3.5`，没有残留 `<badge>` 元素。上一步的判定脚本同时读取源文件与产物并比较数量，是这两项的下一次回归检查。
- 真实浏览器复核（`pnpm dev`，http://localhost:3000/KnowledgeRAG-OGAS/）：导航、侧边栏分组与顺序、右侧目录、「在 GitHub 上编辑此页」、上一页/下一页、代码块的「复制代码」「切换代码换行」、搜索占位符与结果（查询「沙盒」返回沙盒相关页面与片段）、`roadmap.md` 的 4 个任务列表渲染为 10 个复选框、首页 hero 与 4 张 feature 卡片均正常；`--rp-c-brand` 亮色取到 `rgb(22 93 255)`，用界面上的外观开关切到暗色后为 `rgb(60 126 255)`，切回后还原。
- `mechanisms/sandbox.html` 的 Mermaid 在浏览器里渲染为 1 个 SVG、9 个 `g.node`，`.rp-mermaid--failed` 为 0。
- dev server 稳定性：连续运行 30 秒以上 `restarting server` 计数为 0，首页与四条抽样路由均返回 HTTP 200。修复前同一命令会每几秒重启一次并始终不 ready。
- `pnpm audit --audit-level=high --prod`（CI `dependency-audit` 对 `docs` 跑的同一命令）：`No known vulnerabilities found`。
- `python3 scripts/verify_engineering_contracts.py` 与 `python3 -m unittest scripts.test_verify_engineering_contracts`（62 tests）与 `git diff --check`：只有既有的 `2026-10-15-knowledge-file-table-layering.md` Owner 引用一条失败，与本次无关。
- 未验证范围：GitHub Pages 上的真实发布链路（本地只验证 `pnpm build` 产物与 `deploy.yml` 的配置一致性）；VitePress 站点未修复，`{{...}}` 导致的原站构建失败按新站替换处理，不再回到旧站。
