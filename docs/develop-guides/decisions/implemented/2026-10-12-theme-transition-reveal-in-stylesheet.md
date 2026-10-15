# 主题切换的圆形扩散动画改由样式表承载

状态：implemented
类型：bug-fix
Owner：web/src/index.css

事实分工：`web/src/index.css` 拥有 `--reveal-x` / `--reveal-y` / `--reveal-r` 三个自定义属性、`theme-reveal-expand` 关键帧与两条伪元素动画规则；`web/src/shared/ui/DayNightSwitcher/index.tsx` 拥有圆心与半径的取值与写入时机。

## 问题

主题切换的圆形扩散原先用 Web Animations API 实现：在 `transition.ready` 的回调里调用 `document.documentElement.animate({ clipPath }, { pseudoElement })`。伪元素从建好到 `transition.ready` 之间至少隔一帧，那一帧里新快照按「没有裁切」绘制。由深转浅时那一帧就是整屏浅色，观感是「先白一下，再从圆心展开」；由浅转深看不出来，因为那一帧的旧快照本来就长那样。

## 决策

动画移进样式表。`DayNightSwitcher` 在调用 `startViewTransition` **之前**把点击坐标与最远角距离写到 `<html>` 的 `--reveal-x` / `--reveal-y` / `--reveal-r` 上；`web/src/index.css` 用 `@property` 给这三个属性声明 `<length>` 语法与初值，并用 `theme-reveal-expand` 关键帧把 `clip-path: circle(0px at …)` 补到 `circle(var(--reveal-r) at …)`：

- 切到亮色：新快照在上层，`::view-transition-new(root)` 正向播放，从点击处向外展开。
- 切到暗色：旧快照在上层，`::view-transition-old(root)` 用 `animation-direction: reverse` 反向播放，向点击处收缩。

两条规则都限定在 `html.theme-transitioning` 内，与既有的 `animation: none` 抑制规则和 z-index 层级共存。伪元素一建出来就已经带着裁到 0 的 `clip-path`，不再有未裁切的那一帧。

**每个方向只让一个快照参与裁切**：亮色方向的正向展开必须写成 `html.theme-transitioning:not(.dark)::view-transition-new(root)`，不能省掉 `:not(.dark)`。两个方向都挂裁切会同时出现内缩与外扩——旧快照半径从 `r` 收到 `0`、新快照从 `0` 涨到 `r`，两个半径互补，中途它们的并集盖不满视口，四角会露出没被任何快照覆盖的区域。另一个快照保持基线的 `animation: none`（整屏画满）垫在下面。

## 替代方案

- **在 `transition.ready` 之前用内联样式先裁到 0，ready 后再交给 WAAPI**：能消掉那一帧，但同一段动画被拆到两个地方维护，且 ready 与动画启动之间仍有一次样式切换。
- **保留 WAAPI，改为在 `startViewTransition` 前用 `document.documentElement.style.clipPath` 直接裁切**：裁的是根元素而不是伪元素，会把整个页面的绘制一起裁掉，观感与设计不符。
- **不用圆形扩散，改回浏览器默认的交叉淡入**：实现最简单，但失去点击处扩散的观感，且与 `DayNightSwitcher` 的视觉语言不符。
- **降级为直接切换主题**：`prefers-reduced-motion: reduce` 或不支持 View Transition 的环境本来就走的这条路，不能作为通用方案。

## 后果

动画的事实 Owner 从组件挪到基础样式表：改时长、缓动或裁切形状都要动 `web/src/index.css`，改圆心取值要动 `DayNightSwitcher`。

`@property` 需要浏览器支持，不支持时三个属性退化成普通自定义属性——`clip-path` 里的 `var()` 仍会解析，但动画的插值不再走 `<length>` 语法。这类浏览器同时也不支持 View Transition，实际走的是直接切换主题的分支。

`--reveal-*` 在切换后留在 `<html>` 上，不清除；下一次切换会覆盖它们。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 圆心与半径在 `startViewTransition` 之前写到 `<html>` 上 | 属性写在过渡开始之后，伪元素仍会先画一帧未裁切的新快照 | `web/src/shared/ui/DayNightSwitcher/index.tsx` | `test/unit/shared/day-night-switcher.test.tsx` 的「圆心与半径在 startViewTransition 之前写到 <html> 上」；桩在过渡开始的瞬间读属性 | 把三行 `setProperty` 挪到 `startViewTransition` 之后，该用例必须失败（已做变异验证） | Passed |
| 裁切动画不再由 WAAPI 承担 | 两套机制并存，闪帧问题回归 | `web/src/shared/ui/DayNightSwitcher/index.tsx` | 同文件的「不再用 WAAPI 给伪元素挂裁切动画」，用 `animate` 桩断言零调用 | 在组件里重新调用 `document.documentElement.animate`，该用例必须失败（已做变异验证） | Passed |
| 动画规则进入构建产物并按方向分流 | 关键帧或 `@property` 被构建丢掉，或方向搞反 | `web/src/index.css` | 产物含 `@property --reveal-x/y/r`、`@keyframes theme-reveal-expand`，以及 `html.theme-transitioning::view-transition-new(root){…animation:.4s ease-out both theme-reveal-expand}` 与 `html.theme-transitioning.dark::view-transition-old(root){…animation:.4s ease-out reverse both theme-reveal-expand}` | 删掉 `@keyframes theme-reveal-expand` 后，产物里该关键帧定义的出现次数从 1 变 0，动画退化成无效果（已做变异验证） | Passed |
| 过渡期间的类名成对增删 | 异常路径下 `theme-transitioning` 残留，后续过渡被错误裁切 | `web/src/shared/ui/DayNightSwitcher/index.tsx` | 同文件的「过渡期间挂 theme-transitioning，结束后摘掉」 | 去掉 `transition.finished` 的摘类回调后，该用例必须失败（已做变异验证） | Passed（只覆盖 `finished` 兑现的路径；拒绝路径没有用例） |
| 不支持 View Transition 时直接切主题 | 在不支持的环境里写圆心或抛错 | `web/src/shared/ui/DayNightSwitcher/index.tsx` | 同文件的「环境不支持 View Transition 时直接切主题，不写圆心」 | 去掉能力判定后该用例必须失败 | Passed |
| 每个方向只有一个快照参与裁切 | 两个方向同时内缩与外扩，中途四角露出没被快照覆盖的区域 | `web/src/index.css` | 同文件的「每个方向只有一个伪元素参与裁切，且方向限定正确」，断言带 `theme-reveal-expand` 的规则恰好是 `:not(.dark)::view-transition-new(root)` 与 `.dark::view-transition-old(root)` 两条 | 去掉 `:not(.dark)` 限定后该用例必须失败（已做变异验证） | Passed |

已知未验证范围：真实的闪帧观感（本机没有浏览器）。判定依据是动画声明在伪元素选择器上、圆心在过渡开始前写入，构建产物已核对；「由深转浅不再先白一帧」需要在真实浏览器里确认。
