# 对话页的令牌收口（阶段二 B6）

状态：implemented
类型：simplification
Owner：web/src/styles/antd-overrides.css

事实分工：本批把对话页范围（`src/features/chat`、`src/pages/chat`）残留的 157 处 `--color-color-*` 语义 token 类换成 `--gray-*` / `--main-*` / `--second-*` / `--color-error-*` 的任意值写法；测试断言同步三处。`.ant-*` 覆盖在 `styles/antd-overrides.css`（第一批已建立按钮图标对齐规则）与各 CSS Modules 内。

## 问题

B1–B5 迁移后，对话页呈现层还有一批阶段一遗留的 Tailwind 语义 token 类（`text-color-text-1/2/3`、`bg-color-fill-*`、`border-color-border-1` 等 157 处，19 个文件）。它们对应参照的 `--gray-*` 与 `--main-*`，是 migration-standards 里「全部页面迁完后删除旧变量」的目标删除对象。

## 决策

1. **机械映射一张表**：`text-1/2/3` → `--gray-1000/800/500`；`border-1/2` → `--gray-150/200`；`bg-1/2` → `--gray-0/25`；`fill-1/2/3` → `--gray-100/150/300`；`danger-6` → `--color-error-500`；`success-6` / `link-6` / `primary` → `--main-600/500`；`warning` → `--second-600`（辅助金色系，与 B3 审批警告态同源）。hover/focus 变体同步。
2. **测试断言同步三处**：`context-usage-ring.test.tsx` 的档位断言从旧类名换成令牌值（档位阈值 75%/90% 本身不变）。
3. **`.ant-*` 覆盖保持最小**：本页需要的只有按钮图标对齐（第一批写入）与 antd-button 适配层的容器尺寸；antd 的颜色 token 由 ConfigProvider 从 CSS 变量读取（`--antd-color-primary-seed` / `--main-color` / `--main-600` / `--main-800`），不写覆盖。
4. **Tailwind 任意值写法（`text-[var(--gray-500)]`）是过渡形态**：B 收口后如要彻底离开 Tailwind，把这批类下沉到各 CSS Modules——那是逐文件的机械工作，不影响行为。

## 替代方案

**保留语义 token、让 antd 主题去读它们**：两套 token 的映射关系（text-1 → gray-1000 等）会在 ConfigProvider 与 CSS 变量之间形成循环引用，且旧 token 的暗色段与 yuxi-tokens 的 `.dark` 段重复维护。收敛到单一来源是 standards 的既定方向。

**等全部页面迁完一起删旧 token**：对话页先清零可以验证映射表本身（157 处无一手工例外），给后续页面提供已验证的映射。

## 后果

- 对话页的样式令牌单一来源：`yuxi-tokens.css` 的四类变量 + Tailwind 任意值写法。
- `tokens.css` 的语义段（`--color-*`）在本页没有消费者；全局删除旧 token 要等所有页面迁移完成，不在本批。
- 测试对类名的三处断言（档位色）跟着换，阈值断言不动。

## 旧能力不存在

对话页范围（tsx/ts）的 `--color-color-*` 语义 token 类已清零（grep 计数 0）；`shared/ui/input` 等旧实现的对应类不进入本页。

## 重新引入条件

仅当 Tailwind 的 utilities 层在未来被证明必须引用这些语义 token（例如非对话页依赖），且对话页本身有交叉引用时才回来；目前没有。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 19 个文件 157 处类换令牌，grep 计数 0 | 残留类在 B 后期爆出 | 全部 tsx/ts | 上述 grep | — | Passed |
| 档位阈值不变（75%/90%） | 视觉分档漂移 | `lib/token-usage.ts` | `context-usage-ring` 档位测试（阈值断言未动，只换了类名期望） | — | Passed |
| 浅色/暗色双段令牌都有值 | 暗色下颜色缺失 | `yuxi-tokens.css` | 双段定义已存在（base.css / base.dark.css 原样并入） | — | Passed |
| 旧能力不存在： 语义 token 类在对话页清零 | — | 本记录 | grep | — | Passed |
| 重新引入条件： 仅当非对话页的 utilities 依赖被证明且对话页有交叉引用 | 无条件回归 | 本记录 | — | — | Passed |

## 风险

- 任意值写法让 Tailwind 的 JIT 为每个类生成一条规则，类名不再共享；构建产物体积略增（19 个文件几十个类，可忽略）。
- 映射表的取值是按参照 base.css 的灰阶注释对应（`--gray-1000` 注释「主文本」等）；个别场景参照用的可能是别的档位，真实视觉对照归 B7。

## 证据

- 全量门禁：`oxlint src test` 0 errors（545 文件）、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`vitest run`（184 文件 / 2095 例全过）、`vite build` 通过；根 `verify_engineering_contracts.py` 通过。

## 已知未验证范围

- 令牌值的视觉正确性（`--gray-800` 是否对应参照的「text-2」视觉）未逐像素核对；B7 三套视觉走查覆盖。
