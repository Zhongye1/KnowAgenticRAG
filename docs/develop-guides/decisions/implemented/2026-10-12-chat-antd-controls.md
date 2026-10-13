# 对话页的交互控件替换为 antd（阶段二 B5 之一）

状态：implemented
类型：feature
Owner：web/src/features/chat/ui/antd-button.tsx

事实分工：本批新增 `web/src/features/chat/ui/antd-button.tsx`（shared/ui 的按钮词汇到 antd 的映射）、`web/src/features/chat/ui/antd-dropdown.tsx`（描述性 items 到 antd menu 的组装）及两者的小模块样式；十个 Button 消费方与四个 DropdownMenu 消费方换入；`app/theme/antd-provider.tsx` 关掉按钮两字间距。

## 问题

对话页的交互控件仍是 Radix 系的 `shared/ui/button` 与 `shared/ui/dropdown-menu`。migration-standards 的目标形态是 antd 5 + 覆盖层；`shared/ui` 按「滚动收缩，归零即删」的约定随页面迁移逐个退场。参照侧的 antd 用法（Vue）与本仓 antd 5 的类名前缀同为 `.ant-*`。

## 决策

1. **Button 走薄适配而不是直接换 antd**：shared/ui 的 `variant`（ghost/outline/destructive/default）与 `size`（sm/icon/icon-xs）词汇在十个调用方出现 36 处；一次性改写 props 的 diff 会淹没行为变化。适配层只做词汇映射（ghost→text、outline→text+边框类、destructive→primary+danger、sm→small），方块图标尺寸由适配层样式承担。B6 收口后调用方直接用 antd 词汇，适配层删除。
2. **Dropdown 走描述性 items**：Radix 的复合组件（Trigger/Content/Item + `asChild`）在 antd 里是单个 `menu={{items}}`。适配层接受 `{kind: 'item'|'label'|'separator'}` 数组，`onSelect` 在适配层内按 key 路由；触发器作为 children 由 antd 原生支持（`asChild` 的语义等价物）。
3. **选中态由调用方声明**：`selectedKeys` 从 `item.selected` 派生——审批模式的「当前项」跟着外部状态走，不由菜单内部维护（否则点过的项会错误地保持选中）。
4. **互斥选项的角色是 option 不是 menuitemradio**：rc-menu 只对 `role='option'` 渲染 `aria-selected`，`menuitemradio` 的 `aria-checked` 它不渲染。角色语义略降级（option 是 listbox 词汇），读屏用户得到的选中信息等价。
5. **关掉 `autoInsertSpace`**：antd 默认在两个汉字的按钮文案间插空格，「删除」的可访问名变成「删 除」，测试与读屏都受影响。ConfigProvider 全局关闭（参照的按钮文案没有这个间距）。
6. **测试迁移到 antd 的真实语义**：`aria-expanded` / `aria-haspopup` 是 Radix 的触发器行为，antd 的 Dropdown 都不渲染（逐条探测确认过）；开合的可观察结果是菜单出现与消失。Escape 收起antd 不保证，改断言点外部收起。`menuitemradio` → `option` + `aria-selected`。三处测试文件同步。

## 替代方案

**直接换 antd 词汇、不建适配层**：36 处 props 改写与行为变化混在一个 diff 里；走查无法区分「词汇改名」与「外观变化」。

**保留 shared/ui/button 作为适配层**：那个文件是 Radix 实现，语义不同源；在它上面叠映射等于两层适配。

**Escape 收起交给 antd 的 keyboard 配置**：antd Dropdown 的 Escape 处理依赖焦点在弹层内；对话页的触发器点击后焦点留在按钮上，Escape 不触发收起。改断言比给弹层加 focus 管理更诚实——后者是行为变化，要走决策。

## 后果

- 对话页的按钮与下拉从 Radix 换成 antd；外观由 antd token + `antd-overrides.css` 承载，覆盖规则走 `styles/antd-button.module.css`（仅容器尺寸，不重画颜色）。
- `shared/ui/button` 剩 47 处、`dropdown-menu` 剩 5 处引用，全部在本页范围之外（knowledge-base 等），等对应页面迁移时收缩。
- 下拉菜单的键盘导航由 antd 接管（方向键在 items 间移动）；此前 Radix 的实现相同但事件处理路径不同，未逐条对比。
- 页面测试需要 `ConfigProvider` 与 app 一致（否则 autoInsertSpace 回来）；chat-page.test.tsx 已带。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 十个 Button 消费方行为不变（variant 语义、点击回调、disabled） | 交互回归 | `antd-button.tsx` | 全量 2095 例（含 page 测试 61 例） | — | Passed |
| 四个下拉的选中路由与禁用不变 | 菜单项点了没反应或串项 | `antd-dropdown.tsx` | `agent-selector` / `model-selector` / `conversation-list` / `tool-approval` 四组测试 | — | Passed |
| 互斥选项的当前项可被读屏感知 | 选中状态只有视觉 | 同 | `tool-approval` 测试断言 `aria-selected` | 用 menuitemradio 时 aria-checked 不渲染（本次复现） | Passed |
| 按钮可访问名不带两字间距 | 「删除」变成「删 除」 | `antd-provider.tsx` | `conversation-list` 删除流程测试 | 不关 autoInsertSpace 时必挂（本次复现） | Passed |
| 时间分档测试与时钟解耦 | 跨午夜跑测试随机挂 | `message-actions.test.tsx` | 冻结时钟 | — | Passed（B4 批已修，本批复验） |
| 旧能力不存在： 对话页范围的 Radix Button / DropdownMenu import 已清零 | 半套体系共存 | 本记录 | `grep shared/ui/button src/features/chat src/pages/chat` 仅适配层文档注释 | — | Passed |
| 重新引入条件： 仅当 antd 无法承载某个交互形态时按组件回退并记录 | 无条件回归 | 本记录 | — | — | Passed |

## 风险

- antd 的下拉键盘导航与 Radix 的焦点模型不同：Radix 把焦点移进弹层，antd 留在触发器。真实读屏/键盘走查归 B7。
- `ghost` 在 antd 里是「深色底上的描边」，本适配把 outline 映射为 `text + 边框类`；如果 B6 的覆盖层改了 text 按钮的底色，outline 会跟着变——两处样式要一起核对。
- `aria-expanded` 的缺失对读屏用户的「展开态」感知有影响；antd 上游行为，不改。

## 证据

- 全量门禁：`oxlint src test` 0 errors（541 文件）、`tsc --noEmit`、`check-design-tokens.mjs`、`steiger ./src`、`vitest run`（184 文件 / 2095 例全过）、`vite build` 通过；根 `verify_engineering_contracts.py` 通过。
- 角色与属性的结论来自对 rc-menu `MenuItem.js` 源码的逐条读取（`optionRoleProps` 只处理 `aria-selected`），不是猜测。

## 已知未验证范围

- antd 下拉在真实读屏（NVDA/VoiceOver）下的体验未走查；B7 归档。
- dialog / input / spinner / textarea / notifications 五个控件未换，归 B5 下一批。
