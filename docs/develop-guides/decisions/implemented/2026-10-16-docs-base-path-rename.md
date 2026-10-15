# 文档站站点路径跟随仓库改名（Pages base）

状态：implemented
类型：bug-fix
Owner：docs/rspress.config.ts

事实分工：`docs/rspress.config.ts` 拥有 `base` 与 `siteOrigin`；`web/src/shared/config/links.ts` 拥有前端引用的文档站地址（`DOCS_URL`）；`README.md` 与文档站内的站外链接各自引用这两处的值；`.github/workflows/deploy.yml` 拥有构建与部署的触发条件。

## 问题

仓库从 `Zhongye1/KnowledgeRAG-OGAS` 改名为 `Zhongye1/KnowAgenticRAG` 之后，GitHub Pages 的项目站点路径变成 `/KnowAgenticRAG/`，但配置里仍写着旧路径：

1. `docs/rspress.config.ts` 的 `base: '/KnowledgeRAG-OGAS/'` 与 `siteOrigin` 指向旧路径。产物里所有资源与站内链接都会带这个前缀，部署到 `/KnowAgenticRAG/` 后整站资源 404。
2. `web/src/shared/config/links.ts` 的 `DOCS_URL` 同样指向旧路径，SPA 首页的所有文档入口都会 404。
3. `.github/workflows/deploy.yml` 的部署任务条件是 `github.ref == 'refs/heads/main'`，而本仓库的默认分支是 `master`，条件不成立时部署任务不执行；`pull_request` 的 `branches: [main]` 同理，面向 `master` 的 PR 不会跑文档构建检查。
4. 线上现状印证了这三点：`https://zhongye1.github.io/KnowAgenticRAG/` 返回的仍是迁移前的 VitePress 产物，且它的资源指向更早的仓库名 `/KnowledgeRAG-GZHU/`（同样 404）；`https://zhongye1.github.io/KnowledgeRAG-OGAS/` 直接 404。

## 决策

1. **站点路径改为 `/KnowAgenticRAG/`**：`docs/rspress.config.ts` 的 `base` 与 `SITE_ORIGIN`、`web/src/shared/config/links.ts` 的 `DOCS_URL`、`README.md` 里的站内链接一起改；Pages 的项目站点路径由仓库名决定，这三处必须在同一次变更里对齐。
2. **部署条件改成默认分支**：部署任务与 PR 触发都从 `main` 改为 `master`，否则修好的产物不会被发布，线上继续停在旧构建。
3. **保持 `base` 与产物相对路径的关系不变**：站内链接仍由 Rspress 的 `Link` / `withBase` 生成前缀，页面里不出现硬编码的站点路径。

本次不处理：文档站正文与历史决策记录里残留的上游引用（`xerrors/ARS`、`ARS.git`、`blob/main`、旧的 `/KnowledgeRAG-OGAS/` 字样，共 57 处，含 `REPO_BLOB` 的 socialLinks / editLink / English 入口），以及文档站正文仍以 ARS 作为产品名。它们属于改名与去上游引用的一次独立清扫，见「替代方案 2」。

## 替代方案

1. **只改 `base` 保留旧地址**：Pages 项目站点的路径由仓库名决定，改不了；旧路径已经 404，保留它只会让站点继续不可用。
2. **本次顺带清扫全部上游引用与 ARS 字样**：涉及 8 个以上页面、`REPO_BLOB` 的三处用法（其中 English 入口指向的 `README.en.md` 在本仓库并不存在，需要单独决定去掉入口还是补文件）以及产品名的品牌取舍，属于独立的一次清扫，混进本次修复会让「路径可用」这个验收点失焦。
3. **用自定义域名绕开路径问题**：需要 DNS 与证书，且默认发布方式仍是 Pages 项目站点，不解决当前缺陷。

## 后果

- 站点地址是 `https://zhongye1.github.io/KnowAgenticRAG/`，旧地址 `https://zhongye1.github.io/KnowledgeRAG-OGAS/` 不再使用。
- 本地 dev 与 preview 的路径前缀也变成 `/KnowAgenticRAG/`（例：`http://localhost:3000/KnowAgenticRAG/`），文档站相关的手工验证命令与截图脚本按新前缀执行。
- 线上要等一次成功的 Pages 部署才会更新：默认分支推送 `docs/**`（或三条 web 首页路径）触发构建，`master` 上的推送会执行部署任务；也可以从 Actions 手动触发 `workflow_dispatch`。
- 文档站正文里指向旧仓库与旧路径的链接仍然存在，见「问题 4」与「替代方案 2」的清扫范围。

## 验证

- `cd docs && pnpm run build` 成功（148 页）：产物 `index.html` 里 `/KnowAgenticRAG/` 前缀的资源引用存在、`/KnowledgeRAG-OGAS` 出现 0 次；`sitemap.xml` 的绝对地址为 `https://zhongye1.github.io/KnowAgenticRAG/`。
- `pnpm exec rspress preview` 起站后由真实浏览器打开 `http://localhost:3011/KnowAgenticRAG/`：首页正常渲染，站内链接（顶栏快速开始、六个 pillar 入口、流程五步、集成段入口）都带新前缀；`<link rel="icon">` 指向 `/KnowAgenticRAG/favicon.svg`。
- `curl` 复核线上路径：`/KnowAgenticRAG/` 200、`/KnowledgeRAG-OGAS/` 404、`/KnowledgeRAG-GZHU/` 404。
- 未验证：本次没有触发真实 Pages 部署（改动尚未提交/推送），因此「部署后站点可用」只有本地产物与路径推断这层证据；线上仍是旧的 VitePress 产物。
