# 对话页的消息渲染面样式（阶段二 B2）

状态：implemented
类型：feature
Owner：web/src/features/chat/ui/message-item.module.css

事实分工：本批新增 `web/src/features/chat/ui/message-item.module.css` 与 `web/src/features/chat/ui/tool-call-row.module.css`；`message-item.tsx`、`tool-call-row.tsx`、`tool-calls-group.tsx`、`message-list.tsx` 四个文件的呈现层类从 Tailwind 换成模块类。结果渲染器内部（kb-query、web-search、todo 等）与输入区不在本批。

## 问题

阶段一的四个消息面文件仍是 Tailwind 工具类，颜色走 `--color-color-*` 语义 token（`text-color-text-1` 等）——与 `yuxi-tokens.css` 的 `--gray-*` 是两套体系，B6 收口时前者要整体清掉。参照侧 `AgentMessageComponent.vue` 381 行样式定义了消息气泡（human 主色底、ai 透明）、思维链折叠、工具行容器的既定形态。

## 决策

1. **用户消息气泡对齐参照 `.message-box.human`**：`--main-50` 底色、0.5rem 圆角、0.5/1rem 内边距、15px/24px 行高与 0.25px 字距；复制按钮移到气泡左侧 -2rem（参照是 `human-copy` 的悬浮位）。
2. **助手消息透明排版**：参照的 ai 态是 `background: transparent; padding: 0`，回答以排版段落呈现；本仓阶段一的纵向布局结构保留为 `.assistantRow`。
3. **思维链对齐 `.reasoning-box`**：13px/20px、`--gray-700` 触发器、加载态自转 1s、内容区 `--gray-800` + 1.6 行高 + 左边线。
4. **错误提示用 `--color-error-500`**：参照 `.error-hint` 的错误色来自 base.css 的 `--color-error-*`（yuxi-tokens 同段并入），与旧语义 token 的取值一致。
5. **工具行与组**：行容器 `--gray-150` 边框 0.5rem 圆角；状态图标三态（运行 = `--gray-500` 自转、完成 = `--main-600`、失败 = `--color-error-500`）；组摘要行对齐 `ToolCallsGroupComponent` 的 hover 变色与 chevron 旋转；「耗时 Ns」过程摘要行同步换模块。
6. **布局类一并迁移**：`data-testid` 与 `aria-*` 全部保留，单测不感知类名变化。

## 替代方案

**只换颜色令牌、布局留 Tailwind**：migration-standards 的目标形态是「布局与间距迁移期仍用 Tailwind」，但消息面四个文件的布局类与颜色类大量同串——只拆颜色会留下半套体系，B5 换 antd 时还要再动一遍同样的行。

**给每个结果渲染器也建模块**：八个渲染器（kb-query / web-search / todo 等）各有独立视觉，与工具行外壳不同批验证；塞进 B2 会让 diff 无法按面走查。它们归 B3/B4 的相邻批次。

## 后果

- 消息面四个文件 `grep "text-color-\|bg-color-\|border-color-"` 清零；令牌只用 `--gray-*` / `--main-*` / `--color-error-*`。
- 用户消息的主色气泡与助手消息的平面排版首次与参照同构；有真实数据时的对照截图已入 evidence（空态页面）。
- `prose prose-sm` 的 Markdown 排版类换成模块类 `.assistantBody`（`font-size: 14px; max-width: none`），prose 的内部排版由 `Markdown` 组件自带样式承载，行为不变。
- 结果渲染器内部的 Tailwind 尚在；B2 范围按「外壳四个文件」划界，渲染器内部随 B3/B4。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 消息面四文件无残留语义 token 类 | B6 收口时漏拆 | 四个 tsx | `grep -rn "text-color-\|bg-color-\|border-color-"` 四文件 0 结果 | — | Passed |
| 复制按钮的 aria 与测试选择器不变 | 类名迁移破坏交互测试 | `message-item.tsx` | `message-item.test.tsx`、`tool-calls-group.test.tsx` 等全过（184 文件 / 2095 例） | — | Passed |
| 旧能力不存在： 四个文件的呈现层 Tailwind 类（含 `text-danger-6`、`bg-color-fill-2`、`border-color-border-1`）已删除，样式只有模块类一个来源 | 半套体系在 B6 爆炸 | 本记录 | 上述 grep | — | Passed |
| 重新引入条件： 仅当某条样式被证明必须由全局工具类承载（如跨组件复用）时回退，且要记录 | 无条件回归 | 本记录 | — | — | Passed |

## 风险

- 0.25px 字距与 15px 字号在部分渲染引擎下有亚像素渲染差异；参照同值，接受。
- 空态截图不含真实消息；气泡与思维链的视觉核对要等有真实运行数据（B7 走查补）。

## 证据

- 全量门禁：`oxlint src test` 0 errors（539 文件）、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`vitest run`（184 文件 / 2095 例全过）、`vite build` 通过。
- 真实页面：headless Chrome 截图 `evidence/b2-light-1440x900.png` 与 `b2-narrow-390x844.png`（开发栈可达，空态页面）。

## 已知未验证范围

- 带真实消息的视觉对照未做（需要真实后端与模型返回）；B7 三套视觉走查时归档。
- 结果渲染器内部样式（kb-query 表格、web-search 列表等）仍为 Tailwind，归 B3/B4。
