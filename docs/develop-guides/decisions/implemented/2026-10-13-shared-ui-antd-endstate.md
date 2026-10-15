# shared/ui 收口到 antd 终态

状态：implemented
类型：simplification
Owner：web/src/app/theme/antd-provider.tsx

事实分工：本决定拥有 `shared/ui` 下 shadcn/Radix 组件的删除时序、`features/chat/ui/antd-*` 适配层的删除、以及通知与确认框收口到 antd `App.useApp()`；antd 主题与全局覆盖仍归 `app/theme/antd-provider.tsx` 与 `styles/antd-overrides.css`。

## 问题

`design.md` 已登记「UI 基础：antd 5；`shared/ui` 下的 shadcn/ui 组件处于滚动收缩期，最后一个使用者消失后删除」，但收缩此前只完成 chat 切片，且是通过 `features/chat/ui/antd-*` 适配层间接完成：调用方写的是适配层的 `variant="outline"` / `size="sm"` 词汇，antd 词汇藏在中间层。其余 5 个 feature 切片与 app/widgets/pages 仍直接引用 `shared/ui` 的 shadcn/Radix 实现。参照 Yuxi 前端是纯 antd 体系（ant-design-vue，无 shadcn/Radix）。双轨并存让「按钮该写哪个词汇」没有唯一答案，拉高认知负担。

## 决策

1. **调用方直写 antd 词汇，删除全部适配层**：`features/chat/ui/antd-{button,dialog,dropdown,input,notifications,spinner}` 与两个小模块样式删除；词汇映射在调用点展开（`variant="ghost"`→`type="text"`、`variant="outline"`→`variant="outlined"`、`size="sm"`→`size="small"`、`type="button"`→`htmlType="button"`、填充/描边切换→`variant={on ? 'solid' : 'outlined'} color="primary"`）。chat 切片保留一个纯函数助手 `features/chat/ui/chat-dropdown.tsx`：它只做「描述性 items → antd `menu.items`」的数据折算，不承载词汇映射。
2. **通知收口到 antd `App.useApp()` 的 `message` 轻提示**：删除 `shared/ui/notifications` 的 zustand store、自绘右上角堆叠宿主与 `app/index.tsx` 的挂载点，改为 `const { message } = App.useApp()`；`{type, title, message}` 折叠成 `message[type]('标题：正文')`。与参照主力用法一致（Yuxi 中 `message.*` 483 处、`notification.*` 仅 14 处）。
3. **确认框收口到 `App.useApp().modal.confirm`**：`shared/ui/confirm-dialog.tsx` 从 Radix AlertDialog 宿主改为 `useConfirm()` 包装 `modal.confirm`，破坏性确认走 `okButtonProps: {danger: true}`。
4. **删除 shadcn 文件与依赖**：`shared/ui` 下 avatar/badge/button/card/checkbox/collapsible/dialog/dropdown-menu/input/select/sheet/switch/textarea 十三个文件删除；卸载 `radix-ui`、`class-variance-authority`、`@radix-ui/react-icons`、`shadcn`，删除 shadcn CLI 配置 `components.json`，移除 `src/index.css` 的 `@import 'shadcn/tailwind.css'`。
5. **区分「有外部依赖的 shadcn 组件」与「仓内自研组件」**：只删前者。`markdown`、`md-preview`、`content-layout`、`page-placeholder`、`head`、`error-fallback`、`DayNightSwitcher`、`empty`、`progress`、`spinner`、`table`、`types` 都是仓内实现（不 import radix/cva），本轮不迁：它们不构成依赖双轨，也没有 antd 等价物能无损替换（`spinner` 是尺寸类映射、`progress` 带 `role="progressbar"` 数值语义、`table` 供 TanStack v9 的原语渲染）。
6. **`autoInsertSpace` 必须由装配层关闭，测试同构挂载**：antd 默认在两个汉字间插空格（「附件」→「附 件」），影响可访问名。`app/theme/antd-provider.tsx` 用组件通道 `button={{autoInsertSpace: false}}`（不是 `theme.components.button`，那是 token 通道）关闭；页面级测试因此必须包 `<AntdProvider>`，否则查不到「附件」这类两字按钮。

## 替代方案

**`shared/ui` 原地换 antd 实现并保留旧词汇**：调用方零改动，但旧词汇（`variant`/`asChild` 复合组件）长期存在，与 antd 词汇双轨，最终仍要做词汇收口；design.md 终态明确调用方直写 antd，不采用。

**保留自绘 notifications 宿主**：右上角堆叠行为与参照不一致，且 store 的 dismiss API 没有外部消费者，为无人使用的功能维护双轨，不采用。

**保留 `shadcn/tailwind.css` 与 `shadcn` 依赖**：它的 9 个 `@custom-variant`（`data-open`/`data-checked`/…）、7 个 keyframes（accordion）与 25 个 `@utility`（`no-scrollbar`/`scroll-fade-*`/`shimmer-*`）在 `src` 下命中数为 0，全量删除后构建 CSS 只少 888 字节的 `@property` 与 `.shimmer` 死规则；留着一个只产死 CSS 的依赖没有 consumer，不采用。

**把 `table.tsx` 一并换成 antd `Table`**：`knowledge-file-table` 用 TanStack v9 的列助手与 `flexRender` 渲染单元格、表头排序也走它的行模型；换 antd `Table` 要重写列定义与排序接线，属于行为改造而非词汇替换，本轮不做，留在下面「已知未验证范围」。

## 后果

- `src` 下只剩 `knowledge-file-table.tsx` 引用 `shared/ui/table.tsx`（仓内文件，无外部依赖）；`shared/ui` 里再没有 import radix 或 cva 的文件。
- `package.json` 的 UI 依赖只剩 `antd` 与 `lucide-react`；`pnpm-lock.yaml` 净减 3057 行。
- 组件测试统一挂 `<AntdProvider>`，与 `pnpm dev` 的装配一致；这同时修掉了「附件」查不到、`每页条数` 命中两个元素、共享弹窗没有 testid 三类只在测试侧暴露的差异。
- 通知与确认框不再有自绘 DOM 宿主，`app/index.tsx` 少一个挂载点。
- shadcn 语义色工具类（`bg-muted`、`hover:bg-sidebar-accent` 等）仍有 4 个文件 9 处使用；它们的 `--color-*` 映射在 `src/index.css` 的 `@theme inline` 里，不依赖 `shadcn/tailwind.css`，因此随依赖删除保持不变。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| `src` 下不再引用 shadcn/Radix 组件文件 | 残留 import 绕过收口 | `web/src/shared/ui` | `rg "shared/ui/(avatar\|badge\|button\|card\|checkbox\|collapsible\|dialog\|dropdown-menu\|input\|select\|sheet\|switch\|textarea)" web/src` 空结果 | 删掉 `button.tsx` 后 `tsc` 立刻在 `error-fallback.tsx` 报 `Cannot find module './button'`（本次复现并修复） | Passed |
| 调用方不再引用 `antd-*` 适配层 | 适配层继续作为中间词汇 | `web/src/features/chat/ui` | `rg "antd-(button\|dialog\|dropdown\|input\|notifications\|spinner)" web/src` 空结果 | 同上：适配层删除后 21 处未用导入被 `lint:check` 报出（本次修复） | Passed |
| 通知只有一个实现（antd message） | 自绘宿主与 store 残留 | `web/src/shared/ui/notifications/index.tsx` | `rg "zustand" web/src/shared/ui/notifications` 空结果；`test/unit` 中 `addNotification` 断言仍过 | 组件不在 `<AntdProvider>` 内时 `App.useApp().message` 不是函数，`message-actions` 用例抛未处理拒绝（本次复现并修复） | Passed |
| 依赖与 shadcn 文件已删除 | 依赖仍在 package.json | `web/package.json` | `rg "radix-ui\|class-variance\|shadcn" web/package.json web/src` 空结果；`pnpm build` 通过 | 删掉 `@import 'shadcn/tailwind.css'` 前后构建 CSS 对比：仅少 `@property --scroll-fade-*`/`--shimmer-*` 与 `.shimmer` 死规则（170999→170111 字节） | Passed |
| 行为不回归 | 组件替换破坏交互语义 | `web/test/unit` | `pnpm test:unit`：184 文件 / 2102 例全过，0 未处理错误 | 两字按钮可访问名、antd Select 双 `aria-label`、Modal 关闭断言三处随实现更新（本次复现） | Passed |
| 静态门禁不退化 | 类型/分层/Token/依赖边界被破坏 | `web/package.json` | `pnpm check-types`、`pnpm check:tokens`、`pnpm lint:fsd`、`pnpm arch:check`（429 模块）、`pnpm lint:check` 0 error 全过 | — | Passed |
| 旧能力不存在： shadcn/Radix 组件、`antd-*` 适配层、radix/cva/shadcn 依赖与 `components.json` 均已删除 | 半套体系共存 | 本记录 | 上表四条 `rg` 空结果 + `git ls-files web/src/shared/ui` | — | Passed |
| 重新引入条件： 出现 antd 5 无法覆盖的可访问性或组合需求时，按 design.md 重新评估并新增决策记录，不恢复适配层 | 无条件回退 | 本记录 | — | — | Passed |

## 风险

- 视觉回归面大：Modal/Dropdown/Select/Tag 的间距、圆角、动画、暗色表现与 shadcn 版本不同。本轮只由 Token 门禁与构建保证「没有硬编码颜色」，逐像素对照未做。
- `shared/ui/table.tsx` 与 `spinner.tsx`/`progress.tsx`/`empty.tsx` 仍是仓内实现，`design.md` 的「只减不增」继续适用；`table.tsx` 是唯一有真实 consumer 的遗留项。
- `spinner`/`empty` 未被替换成 antd `Spin`/`Empty`，两处加载与空态外观与参照实现存在差异；它们没有 shadcn 依赖，不阻塞终态，但「对齐 Yuxi」的视觉目标未在这些点闭合。

## 证据

- 全量门禁（`web/`）：`pnpm check-types`、`pnpm lint:check`（347 文件，0 error / 25 warning）、`pnpm check:tokens`、`pnpm lint:fsd`、`pnpm arch:check`、`pnpm test:unit`（184 文件 / 2102 例）、`pnpm build` 全部通过。
- 根门禁：`python3 scripts/verify_engineering_contracts.py` 与 `python3 -m unittest scripts.test_verify_engineering_contracts` 通过。
- 依赖事实来源：`web/package.json` 与重新生成的 `web/pnpm-lock.yaml`（`pnpm install --lockfile-only`）。
- `shadcn/tailwind.css` 的内容与用量结论来自读取 `node_modules/shadcn/dist/tailwind.css` 并逐项 `rg` 命中数，不是猜测。

## 已知未验证范围

- 真实浏览器下的视觉走查（各页面截图与参照逐点对照）未执行；Modal 宽度/圆角/遮罩、Dropdown 弹层位置、Tag 与 Badge 的外观差异都还没有视觉证据。
- `knowledge-file-table` 仍在仓内 `table.tsx` 上渲染，未换 antd `Table`。
- 读屏（NVDA/VoiceOver）下的 message 播报与 Modal 焦点环未走查。
