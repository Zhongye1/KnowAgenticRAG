# 首页新增「知识问答 / 任务执行 / 自动 Wiki」能力总览段

状态：implemented
类型：feature
Owner：web/src/pages/home/ui/knowledge-work-section.tsx

## 问题

首页的产品能力只有能力段那份「数据能力清单」（Discover/Retrieve/…），没有把 RAG、Agent、Wiki 三种产品能力并列讲清楚的一段。参考一张外部产品的首页截图，需要在同一页里补一段「眉标 + 大标题 + 右侧说明 + 三等分能力列」。

## 决策

1. 新增 `web/src/pages/home/ui/knowledge-work-section.tsx`，挂在能力段之后、任务链段之前。一段一文件。
2. 结构与文案照参考图（中文原文）：金色 mono 眉标「01 / KNOWLEDGE AT WORK」；大标题靠左、说明文字靠右同一行；一条通栏横线；下方三等分列，列间竖分隔线，每列是「图标 + 序号标签 / 小标题 / 说明 / 标签组 / 了解 X →」。
3. 配色取样自参考图：段底 `#fdfcf9`、淡标签底 `#f5f2ed`、分隔线 `#e1e2e4`；文字沿用页面既有 token（标题 `--ink`、正文 `--site-muted`），金色眉标与序号复用 `--accent-gold`。全部写在 `src/styles/home.css` 的 `.knowledge-work-*`，因为 `scripts/check-design-tokens.mjs` 禁止 `.tsx` 出现硬编码色值。
4. 视口 ≤1024px 转单列，列间竖线改为分段的上边框（移动端仍靠分隔线区分三段）。
5. 三个「了解 X →」指向 `outbound` 里最接近的文档地址（RAG→`docsKnowledge`、Agent→`docsMcp`、Wiki→`docsOperations`）。

## 替代方案

- 复用能力段的视觉（无分隔线、无眉标）：参考图的版式本身就是这段的诉求，复用会看不出是独立一段。
- 底纹/分隔线复刻参考图的蓝灰色系：与页面暖色调冲突；只对取样得到的底色与分隔线取值，文字仍走页面 token。
- 小标题与正文的上外边距用 Tailwind 工具类：`home.css` 里 `:where(h3)` / `:where(p)` 是无层重置，会赢过 utilities 层的 `mt-*`，只能在同层 CSS 里写。
- 三列在 ≤720px 才转单列：三列在 1024 附近每列不足 250px，读完一段再读一段比横着挤更合适。

## 后果

- 首页多一段三段式能力总览，并新增一组页面级色值（`#fdfcf9` / `#f5f2ed` / `#e1e2e4`），都限定在 `.knowledge-work` 作用域内。
- 小标题/正文的 margin 是首页 CSS 里少数仍然存在的布局声明，原因是层叠顺序，不是遗漏。
- 参考图的眉标是装饰性编号「01」，页面其他段落没有编号，这段的「01」不构成系列约定。
- 三个文档链接是就近猜测，若文档站有更贴切的入口，改 `PILLARS` 的 `href` 即可。

## 验证

- 5174 开发服务器实测：1440 下标题与右侧说明同一行、通栏横线与竖分隔线正确（第 2/3 列 `border-left: 1px rgb(225,226,228)`）、三列图标/序号/标签/链接齐全且链接底对齐；390 下转单列，列间变为 `border-top: 1px`、`border-left: 0`，三列首尾相接。
- 门禁：`node scripts/check-design-tokens.mjs` 通过；`npx oxlint src` 仍为 `31 warnings and 3 errors`；`npx tsc --noEmit` 6 个错，均落在既有的 `workspace-ui.test.tsx` 与 `nexus-console.test.tsx`；`git diff --check` 干净。
- 单测：`test/unit/pages/home-page.test.tsx` 仍是 5 failed / 3 passed，与本段无关（失败都来自已删除的 endpoint/metrics/nexus/context 段落文案断言）。
