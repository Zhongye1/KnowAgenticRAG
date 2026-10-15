# 首页新增「任务链」内容段

状态：implemented
类型：feature
Owner：web/src/pages/home/ui/task-chain-section.tsx

## 问题

首页只有 hero（一句价值主张）与能力清单，缺少一段把「知识管理 → 多智能体编排 → 文件交付」串成同一件事的产品实证。参考一张外部产品的首页截图，需要在同一页里新增「左列四条环节 + 右侧产品截图」的段落，并且四条可以切换查看各自截图。

## 决策

1. 新增 `web/src/pages/home/ui/task-chain-section.tsx`，挂在 `CapabilitySection` 之后、`SiteFooter` 之前。一段一文件，不并入能力段。
2. 结构与文案照参考图（中文原文）：大标题 + 副标题；下方约 1:2.6 两列 —— 左列四条「标题 + 说明」，右侧米色圆角卡片内嵌产品截图，图下小标题标示当前展示的那一条。视口 ≤1024px 转单列，卡片落到文字下方。
3. 左列是一条竖向 tablist：四条选项卡，点击或键盘（↑↓←→ 移动、Home/End 跳首尾，焦点随选中项走）切换，待选选项卡用 roving `tabindex`；右侧是同一个 `role="tabpanel"`，`aria-labelledby` 指向当前选项卡，截图与图下小标题跟着换。初始停在第二条。
4. 截图为四条地址的数组，与四条说明一一对应；面板里只渲染当前那一张 `<img>`，切换时换 `src`，不同时下载四张。
5. 配色取样自参考图（段底 `#f6f5f0`、米色卡 `#f6eedb`、高亮卡 `#fefefa`），写在 `src/styles/home.css` 的 `.task-chain-*`；布局用 Tailwind 工具类。颜色不能进 `.tsx`：`scripts/check-design-tokens.mjs` 禁止硬编码色值。
6. 容器沿用页面既有的 `--content-gutter` 与 1720px 上限，不照抄参考图更窄的边距 —— 与页面其他段落对齐优先于复刻外部站点。

## 替代方案

- 只做静态高亮、不做切换：四条截图地址已经齐了，静态展示会浪费三条，且用户明确要求可切换。
- 用 `<button aria-pressed>` 而不是 tablist：同一时刻只有一块面板可见，正是 tab 的语义；`aria-pressed` 表达的是可多选开关。
- 四条 `<img>` 都渲染再靠显隐切换：会同时发起四次下载。
- 文案译成英文与页面其余正文一致：用户明确选择中文原文。
- 并入 `capability-section`：两段内容各自独立，合在一起会让那个文件承担两件事。

## 后果

- 首页多一段内容区与一组新页面级色值（暖白底、米色卡），都限定在 `.task-chain` 作用域内，不影响其他段落。
- 面板里是单个 `<img>` 且不带 `width`/`height`：四条截图尺寸不一致，写死反而会在切换时变形；代价是换图瞬间有布局跳动。
- 截图都是外链（其中两条 zhimg 对 `curl` 返回 403，浏览器里正常加载）；离线时卡片只剩米色底。

## 验证

- 5174 开发服务器实测：1440 下标题单行、四条环节可点、切换后 `aria-selected` 与面板 `aria-labelledby` 都跟着变、`src` 换成对应地址且图片加载完成（`naturalWidth` 有值，第 4 条 1440×960）；390 下转单列，卡片落在列表下方。
- 门禁：`node scripts/check-design-tokens.mjs` 通过；`npx oxlint src` 仍为 `31 warnings and 3 errors`；`npx tsc --noEmit` 6 个错，均落在既有的 `workspace-ui.test.tsx` 与 `nexus-console.test.tsx`；`git diff --check` 干净。
- 单测：`test/unit/pages/home-page.test.tsx` 仍是 5 failed / 3 passed（失败都来自已删除的 endpoint/metrics/nexus/context 段落断言；hero 粒子画布那条通过）。
