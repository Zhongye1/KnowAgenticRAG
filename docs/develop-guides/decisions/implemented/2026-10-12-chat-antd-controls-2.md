# 对话页的交互控件替换为 antd（阶段二 B5）

状态：implemented
类型：feature
Owner：web/src/features/chat/ui/antd-button.tsx

事实分工：本批两份决策同属一批（第一批是 button/dropdown，本批是其余五类控件）。新增适配层：`antd-dialog.tsx`（Radix Dialog 复合形态到 antd Modal 的映射，含焦点进弹层与 Esc 关闭的行为补齐）、`antd-input.tsx`（Input/Textarea 直通）、`antd-notifications.tsx`（store 词汇到 antd message）、`antd-spinner.tsx`（尺寸类）。`conversation-list` 的标题编辑 Input 的 ref 类型改为 antd `InputRef`。

## 问题

对话页剩余五类 Radix 控件（dialog、input、textarea、spinner、notifications）仍在 `shared/ui`。migration-standards 的目标形态是 antd 5；`shared/ui` 滚动收缩的约定要求本页迁完后引用归零（`markdown` 与 `content-layout` 是 standards 与 gaps.md 都登记过的保留项）。

## 决策

1. **Dialog 保留复合形态**：五个调用方的 JSX 结构（Header/Title/Description/Footer）不变，适配层把各段映射进 Modal 的 children——footer 由 `DialogFooter` 承担，`footer={null}` 关掉 Modal 自带的确认/取消。
2. **补齐 antd Modal 缺失的两个 Radix 行为**（对照 Radix `DialogPrimitive.Content` 的既有行为逐条确认）：
   - **焦点进弹层**：Radix 挂载时自动聚焦第一个可聚焦元素。适配层在 ref 回调里聚焦第一个 `input, textarea`（限定表单元素，避免把 Modal 自带的关闭按钮当目标），portal 挂载晚于首帧，聚焦放 `setTimeout(0)`；测试以 `waitFor` 等待落地。
   - **Esc 关闭不依赖焦点**：Radix 的 Esc 在容器层处理；antd 的 Esc 挂在 Modal 根且要焦点在弹层内。适配层经 Context 把 `close` 传给 `DialogContent`，容器 `onKeyDown` 里 Esc → `close()`（可被调用方的 `defaultPrevented` 拦截）。
3. **Input/Textarea 直通**：受控用法与 ref 转发一致；唯一的类型变化是 `useRef<HTMLInputElement>` → `useRef<InputRef>`（两处，`.focus()` 方法同名）。
4. **notifications 保留调用方词汇**：`{type, title, message}` 并成 antd message 的正文（`title：message`），不引入 `notification.open` 的堆叠形态——它的 Context 依赖与布局影响要单独评估，放 B6。
5. **Spinner 直通**：`size` 词汇（sm/md）映射到字号类，aria 属性透传。

## 替代方案

**notifications 换 antd notification（右上角堆叠）**：与参照 `message.error()` 的轻提示形态不同；参照对话面用的是轻提示（`AgentChatComponent.vue` 从 ant-design-vue 只 import 了 `message`）。对齐参照选 message。

**Esc 只依赖 antd Modal 的默认行为**：焦点不在弹层内时 Esc 无效——全局搜索弹窗打开时焦点在触发按钮上的路径是真实存在的（侧栏按钮点击打开）。适配层的容器级 Esc 覆盖这条路径。

**焦点落到最后聚焦的元素**：Radix 是首个可聚焦；全局搜索弹窗的视觉焦点一直是搜索框，限 input/textarea 与之一致。

## 后果

- 对话页范围 `shared/ui` 引用只剩 `markdown` 与 `content-layout`（保留项，登记在 gaps.md 2.2）。
- antd Modal 的默认宽度 520px、圆角走 token；与 Radix 版本的居中/遮罩视觉由 antd token + 覆盖层承载，差异归 B6。
- 弹窗关闭后内容销毁（`destroyOnHidden`），与 Radix 版本行为一致。
- 全局搜索的键盘交互（↑↓/回车/Esc）在容器 keydown 上的绑定不变。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 五个弹窗的打开/关闭/Esc/点遮罩不变 | 弹窗关不掉或重复关闭 | `antd-dialog.tsx` | `global-search-modal` 17 例、`attachment-upload`、`conversation-list`、`project-selector`、`message-actions` 各组测试 | — | Passed |
| 打开时焦点落在搜索框 | 键盘用户要先 tab 找输入框 | 同 | `global-search` 焦点测试（waitFor 等待） | 无聚焦逻辑时不通过（本次复现） | Passed |
| 受控输入（value+onChange）与 ref.focus() 不变 | 标题编辑不能聚焦 | `antd-input.tsx` | `conversation-list` 重命名流程 | ref 类型不改时 tsc 拒绝 | Passed |
| 通知的类型与文案结构不变 | 通知变成无头正文 | `antd-notifications.tsx` | page 测试 61 例（notifications.addNotification 断言） | — | Passed |
| 旧能力不存在： 对话页范围的 Radix dialog/input/textarea/spinner/notifications import 已清零（markdown/content-layout 除外，属登记的保留项） | 半套体系共存 | 本记录 | `grep "from '@/shared/ui"` 两文件保留 | — | Passed |
| 重新引入条件： 仅当 antd 无法承载某交互形态时按组件回退并记录 | 无条件回归 | 本记录 | — | — | Passed |

## 风险

- antd message 的自动消失时长（默认 3s）与 shared/ui 堆叠（常驻可关）不同：错误提示若超过 3 秒未读会丢失。参照用 message（同 3s），接受；如需常驻错误归 B6 评估。
- Modal 挂载在 body portal，`data-testid="global-search-modal"` 在弹层容器上，页面级选择器不受影响。
- 焦点补齐只在挂载时触发；Tab 循环（focus trap）antd Modal 自带。

## 证据

- 全量门禁：`oxlint src test` 0 errors（545 文件）、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`vitest run`（184 文件 / 2095 例全过）、`vite build` 通过；根 `verify_engineering_contracts.py` 通过。
- 行为差异的结论来源：Radix `DialogPrimitive.Content` 与 antd `Modal` 的行为对照（焦点/Esc 逐条探测），rc-menu 的角色渲染读源码确认（第一批）。

## 已知未验证范围

- 真实读屏下的 Modal 焦点环与 message 播报未走查；B7 归档。
- Modal 视觉（宽度、圆角、遮罩透明度）与参照的逐像素差异归 B6 覆盖层。
