# 对话上下文用量环与状态栏取舍

状态：implemented
类型：feature
Owner：web/src/features/chat/ui/context-usage-ring.tsx

事实分工：`web/src/features/chat/lib/token-usage.ts`（既有）拥有用量换算、档位与文案；`ui/context-usage-ring.tsx` 拥有环形呈现；`web/src/pages/chat/ui/chat-page.tsx` 拥有数据来源与点击目标。

## 问题

参照的第 6 片是「状态栏 + 上下文用量」：`StatusBar.vue`（332 行）与 `ContextUsageRing.vue`（144 行），后者依赖 `utils/contextUsage.js`（85 行）。

## 决策

**不搬状态栏**：`StatusBar.vue` 全仓零消费者，是死代码；且它的内容（品牌 / 用户 / 主题切换 / 系统设置 / 任务中心）与外壳（侧边栏品牌、用户菜单、日夜切换）已提供的高度重叠。搬回来等于**把顶栏重新加回来**，与外壳片已定的「无顶栏、单侧栏」拓扑冲突。

**不另造用量换算**：参照的 `contextUsage.js` 与本仓既有的 `lib/token-usage.ts` 概念重叠（比例 / 档位 / 文案）。本仓那一份的档位阈值与参照**完全一致**（≥90% 危险、≥75% 警告），因此用量环直接复用，不新建模块——否则同一个百分比会在用量卡片与环上算出不同结果。

**上限未知时只画底环**：画一个 0% 的进度弧会让人以为「用量是 0」，而实际是「不知道上限」。

**点击目标改为右侧面板**：参照里用量环点击切换「状态面板」，本仓对应的就是右侧面板。这是一处**有意的映射，不是等价实现**。

## 替代方案

- **搬状态栏并去掉与外壳重复的项**：剩下的只有时间与任务中心；任务中心是外壳片明确列为非目标的能力，时间在对话页没有位置。搬过来是一个只有时间的空条。
- **照搬 `contextUsage.js` 作为独立模块**：会与 `token-usage.ts` 形成两份换算，同一个百分比可能算出两个值。
- **点击环不做任何事**：放弃参照的一个交互入口；本仓有对应的面板，映射过去成本更低。

## 后果

**顺带修的真实缺陷**：本仓 token 分两套命名（`--color-color-*` 语义、`--color-*` 调色板），而 `text-color-link-6` / `text-color-danger-6` / `text-color-success-6` / `border-color-warning-3` 这类**类名不存在**——写了不报错，颜色静默不生效。全仓 14 处（11 个文件，含本片之前几轮新写的）已全部改成正确的调色板类，并核对构建产物确认新类已生成。

**门禁盲区（未修）**：`check-design-tokens.mjs` 检查的是「硬编码颜色与默认调色板类」，不检查「类名是否真实存在」。这类问题目前只能靠人工核对构建产物。

**与 Yuxi 的 UI 差异（待阶段二对齐）**：环的半径、线宽与旋转角度与参照一致；但**档位配色未逐像素核对**（本仓用 `text-danger-6` / `text-warning-6` / `text-link-6`，参照用 Less 变量），环在输入行中的位置也未与参照的分隔线布局对齐。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 当前结果 |
|---|---|---|---|---|
| 按比例画进度弧 | 比例算错或弧长不对 | `ui/context-usage-ring.tsx` | `test/unit/features/chat/context-usage-ring.test.tsx` 的 dash offset 断言 | Passed |
| 上限未知 / 用量为 0 时不画弧 | 画成 0% 让人以为用量是 0 | 同上 | 同文件三条用例 | Passed |
| 档位按 75% / 90% 分界 | 配色与卡片不一致 | `lib/token-usage.ts` | 同文件的档位用例 | Passed |
| 点击回调、禁用不回调 | 禁用态仍可点开面板 | `ui/context-usage-ring.tsx` | 同文件 | Passed |
| 修好的颜色类真实存在于产物 | 颜色继续静默失效 | 11 个文件 | `grep -c "\.text-danger-6" dist/assets/index-*.css` → 1 | Passed |
| 全量门禁 | — | — | `oxlint` / `tsc` / `check:tokens` / `steiger` / `depcruise` / `vitest` / `build` | Passed |

已知未验证范围：**真实页面未验证**（本机没有浏览器）；环在输入行中的位置与点击后打开面板的观感未验证；`StatusBar` 不搬是判断而非遗漏，理由见上；本片未做变异验证。
