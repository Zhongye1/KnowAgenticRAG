# Web 外壳向 Yuxi 单侧边栏对齐

状态：implemented
类型：architecture
Owner：web/ARCHITECTURE.md

事实分工：`web/ARCHITECTURE.md` 拥有分层与依赖方向；`web/src/app/layouts/app-shell.tsx` 拥有外壳装配；`web/src/widgets/app-sidebar` 拥有导航列的品牌、导航、会话列表、折叠状态与底部；`web/src/features/debug` 拥有调试面板开关与快捷键判定；`web/src/entities/session/lib/system-info.ts` 拥有导航列品牌投影；`web/src/shared/config/links.ts` 拥有文档站与仓库地址；`web/src/shared/lib/theme.ts` 拥有主题状态与切换动作，导航列的开关与用户菜单的主题项都走它。

## 问题

`web/` 登录后的外壳曾经是 shadcn 的 `SidebarProvider + AppSidebar + SidebarInset + AppHeadbar`：230px 导航列之外还有一条 48px 顶栏，装着面包屑、GitHub 图标、设置抽屉、帮助抽屉与日夜切换。参照实现 Yuxi 的 `AppLayout.vue` 是单侧边栏：`.app-layout` 为 `flex-direction: row`，左侧 `.header` 是 `flex: 0 0 230px` 的导航列（折叠 56px），右侧 `#app-router-view` 直接铺满内容区，不存在顶栏；品牌、搜索、折叠按钮、导航、会话列表、GitHub 入口与用户信息都在导航列内部。

顶栏来自上一轮 React 迁移（提交 `984e685`），没有决策记录为它背书。它带来的差异会在后续每一项页面迁移里重复出现：每个页面都要单独决定顶栏怎么处理，页面的垂直空间与参照对不上。roadmap 把外壳排在对话、知识库、扩展面与长尾之前，正是因为第 4 至第 10 项都渲染在这层外壳里。

导航列自身也与参照有实质差异：品牌是硬编码的 `ARS` 与一个图标，参照取系统信息接口的 `organization.avatar` 与 `organization.name`；导航项的顺序与文案不同；用户菜单缺文档中心与日夜切换，且 `Account`、`Notifications` 两项没有处理函数；导航列的 DOM 与样式完全由 shadcn 决定，参照的 465 行结构样式无法逐条承接。折叠态还存在 cookie `sidebar_state` 里，参照存在 localStorage。

## 决策

外壳改成参照实现的单侧边栏结构：`web/src/app/layouts/app-shell.tsx` 只做装配，`web/src/widgets/app-sidebar` 渲染导航列，内容区独立滚动。`web/src/widgets/app-headbar/` 已删除。

导航列用原生 flex 列加 CSS Modules，承接 `AppLayout.vue` 的 `<style scoped>`：宽 230px、折叠 56px、内边距 `6px 8px`、条目高 32px、图标 16px、品牌头像 28px、背景 `--main-5`、右边框 `--gray-100`、宽度过渡 0.18s。`web/src/shared/ui/sidebar.tsx` 是 shadcn 组件，`migration-guide.md` 把它列为「antd 没有等价物、需要重写」的三处之一；改为原生实现后它的引用归零，已删除。用户菜单留在 `app-sidebar/ui/` 内：拆成独立 widget 会被 Steiger 的 `fsd/forbidden-imports`（跨 widget 切片导入）与 `fsd/insignificant-slice`（切片无人引用）同时拒绝，`web/ARCHITECTURE.md` 记录这条约束。

顶栏三处功能各有去处：GitHub 入口在导航列底部，与参照同位置；日夜切换有两个入口——展开态的导航列底部是已有的 `web/src/shared/ui/DayNightSwitcher` 开关，用户菜单里有一个主题项，与参照把主题放在用户菜单里的做法一致，折叠态因此不会失去切换入口；语言切换已删除，它是不接 i18n 的本地状态，参照也没有。主题状态与切换动作由 `web/src/shared/lib/theme.ts` 拥有，两个入口走同一条路径。

逻辑契约按参照的 9 个 Pinia store 对齐。`runtimeCapabilities`、`agent`、`database` 在本仓已有等价物；`user` 走 `/api/auth/me` 而不落字段副本，角色文案在 `web/src/entities/session/lib/user-role.ts`；`chatThreads` 由 `web/src/features/chat/model/thread-list-store.ts` 承担，当前会话以路由参数为事实源；`chatUI.sidebarCollapsed` 落 localStorage 的 `ars_sidebar_collapsed`，读写与容错在 `web/src/widgets/app-sidebar/lib/sidebar-preference.ts`，参照用 `chat-ui-store`，键名按本仓 `ars_*` 约定记偏离；`info` 的导航列品牌投影在 `web/src/entities/session/lib/system-info.ts` 的 `selectShellBranding`；调试面板开关在 `web/src/features/debug/model/debug-panel-store.ts`，与 `web/src/features/debug/lib/debug-shortcut.ts` 的快捷键判定共用。

`config` 不接：参照在外壳挂载时预加载 `/api/system/config`，供其他组件读 `configStore.config`，而本仓没有任何读取者。按仓库「抽象与依赖都要有当前 consumer」的约定，不引入只在挂载时发一次、结果无人消费的请求。

滚动收缩随本切片推进：`shared/ui/sidebar.tsx` 与只被它引用的 `skeleton.tsx` 已删除；`breadcrumb`、`drawer`、`separator`、`tooltip` 原本只服务顶栏，引用归零后一并删除，`drawer` 的唯一依赖 `vaul` 从 `package.json` 与 lockfile 移除。

本切片不做：任务中心 `TaskCenterDrawer`（690 行）与 `tasker` store、设置面板 `SettingsModal` 及其六个子面板（3702 行）、全局搜索的工作区文件模式、路由 `keep-alive` 等价物、GitHub star 数外部请求。用户菜单因此不放「设置」入口，等设置分片落地再接。

## 替代方案

- **保留顶栏并声明偏离**：改动最小，面包屑、设置抽屉与帮助抽屉留住。代价是外壳不向参照对齐，roadmap 的 M2 出口条件不成立，后续每页仍要单独核对顶栏差异，页面的垂直空间也持续与参照差 48px。
- **只保留导航列底部的开关，折叠时靠展开后再切**：折叠态会完全失去主题入口，而参照在折叠态可从用户菜单切，这是能力回归，不接受。
- **把 `DayNightSwitcher` 开关本身嵌进用户菜单**：DOM 位置与参照一致，但它是带圆形 View Transition 的开关控件，嵌进菜单项需要阻止菜单关闭并接管键盘焦点；改为在菜单里放一个普通菜单项（参照用的就是普通菜单项），开关留在导航列底部。
- **把用户菜单拆成独立 widget**：分层上更干净，但本仓的 Steiger 配置禁止跨 widget 切片导入，只被单个 widget 使用的切片还会被 `insignificant-slice` 判为无人引用，两处同时失败。
- **保留 shadcn 的 `sidebar.tsx` 只换外观**：省去折叠与移动端行为的重写。代价是导航列的 DOM 与样式仍由组件库决定，参照的 465 行结构样式无法逐条承接，滚动收缩也少清一处。
- **把任务中心与设置面板并入本切片**：外壳一次成型。代价是分片从约 1400 行参照代码涨到约 5100 行，且设置面板的六个子面板在本仓都是全新能力，会掩盖外壳本身的验收。

## 后果

导航列从组件库换成原生实现，DOM 结构随之改变；针对侧边栏的既有测试断言已按新结构重写，测试通过不能替代真实页面核对。

扩展导航项在 LITE 模式下仍然显示，文案从「扩展」改为「技能」：参照如此，且本仓扩展页的「技能」tab 在 LITE 下本来可用，此前整项隐藏是行为不同。

`ars_sidebar_collapsed` 与参照的 `chat-ui-store` 键名不同，后续若要统一持久化语义需要迁移已写入的值。

`shared/lib/hooks/use-mobile.ts` 的唯一消费者是已删除的 `shared/ui/sidebar.tsx`，本切片一并删除，两处 barrel 导出同步移除。

用户菜单留在侧边栏切片内，首页顶栏若要复用它，必须先让它在多个页面真实出现，再拆成独立 widget。本轮不做任务中心与设置面板，用户菜单因此少一个「设置」入口，与参照的可见差异登记在 `web/alembic/pages/shell/report.md`，避免被读成遗漏。

外壳不预加载 `/api/system/config`，后续若出现「挂载后立即读配置」的组件，要在那个分片里补预加载点。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 外壳装配不回归门禁与构建 | 导航列或内容区的装配牵连路由与类型 | `web/src/app/layouts/app-shell.tsx` | `pnpm run test:unit`（131 文件 / 1480 例）；`pnpm run check-types`；`pnpm run lint:fsd`；`pnpm run arch:check`（328 模块 / 1198 依赖）；`pnpm run build` | 装配里引用已删除的 `shared/ui/sidebar` 时 `check-types` 与 `lint:fsd` 必须失败 | Passed |
| 已落地页面在真实浏览器里仍正常渲染与导航 | 导航列换成原生实现后页面内容被挤出可视区 | `web/src/app/layouts/app-shell.tsx` | 真实浏览器走查 `/agent`、`/dashboard`、`/extensions`、`/extensions/knowledgebase/:kbId`、`/extensions/skill/:slug`、`/agent-manage` | 差异必须落在台账的「声明偏离」清单里 | Not run（本机没有浏览器；unit 用例都 mock 了外壳，不构成页面渲染证据） |
| 导航列品牌取后端配置，配置缺失时兜底 | 未加载时显示硬编码名称或裂图 | `web/src/entities/session/lib/system-info.ts` | `system-info.test.ts` 的 5 条 `selectShellBranding` 用例 | 去掉 `ARS` 兜底后「组织名与品牌名都缺失时落到 ARS」必须失败（已做变异验证） | Passed（单测；真实页面核对未做） |
| 导航项与参照同序同文案，权限与能力门禁生效 | 普通用户看到数据总览，或 LITE 下扩展项不可用 | `web/src/widgets/app-sidebar/lib/nav-items.ts` | `app-sidebar.test.tsx` 的三条顺序与门禁用例 | 去掉超管判定后普通用户可见数据总览时对应用例必须失败 | Passed |
| 折叠态刷新后保持 | 刷新回默认展开，或写入后读不到 | `web/src/widgets/app-sidebar/lib/sidebar-preference.ts` | `sidebar-preference.test.ts`（8 例）与 `app-sidebar.test.tsx` 的三条折叠用例 | 去掉持久化写入后「点击折叠后写入本地存储」必须失败；去掉损坏值拒绝后「存储值损坏时按展开处理」必须失败（已做变异验证） | Passed（单测；真实页面折叠走查未做） |
| 折叠态保留搜索入口 | 折叠后无法打开全局搜索，相对参照与改动前都是回归 | `web/src/widgets/app-sidebar/ui/app-sidebar.tsx` | `app-sidebar.test.tsx` 的「折叠态把搜索入口放进导航项，展开态由品牌区承担」与「展开态只在品牌区放搜索入口，导航项里没有」 | 去掉折叠态搜索项后对应用例必须失败（已做变异验证） | Passed |
| 折叠态不渲染放不下的日夜切换开关 | 44px 的开关被 39px 内容宽裁切 | `web/src/widgets/app-sidebar/ui/app-sidebar.tsx` | `app-sidebar.test.tsx` 的「折叠态不渲染放不下的日夜切换开关」，断言 `role="switch"` 不存在 | 恢复成「只藏文字、开关仍在」的写法后该用例必须失败（已做变异验证） | Passed |
| 折叠态仍能切换主题 | 折叠后全应用没有主题入口——参照在折叠态可从用户菜单切，本仓若只把开关藏起来就丢了入口 | `web/src/widgets/app-sidebar/ui/user-menu.tsx` | `app-sidebar.test.tsx` 的「折叠态仍能从用户菜单切主题，补回被隐藏的开关」 | 去掉菜单里的 `theme` 项后该用例必须失败（已做变异验证） | Passed |
| 12 秒状态同步在折叠或页面不可见时跳过 | 折叠或后台标签页仍在轮询 | `web/src/widgets/app-sidebar/ui/app-sidebar.tsx` | `app-sidebar.test.tsx` 用假定时器断言两种跳过条件 | 去掉可见性判断后「页面不可见时跳过同步」必须失败 | Passed |
| 全局快捷键只在超管下切换调试面板 | 普通用户可打开调试面板 | `web/src/app/layouts/app-shell.tsx`、`web/src/features/debug/lib/debug-shortcut.ts` | `app-shell.test.tsx`（5 例）与 `debug-shortcut.test.ts` | 去掉超管判定后「普通用户按同一个组合键不打开面板」必须失败；去掉 Shift 判断后对应用例必须失败（已做变异验证） | Passed |
| 会话列表的重命名、删除、置顶与参照等价 | 动作失败后本地状态与后端分叉 | `web/src/features/chat/model/thread-list-store.ts` | 逐条 8 维对照留待对话页分片 | — | Not run（本轮只核对导航列侧的 12 秒同步与折叠跳过两条） |
| 搬运后仍满足 FSD 与依赖方向 | 导航列与用户菜单落错层或跨层引用 | `web/ARCHITECTURE.md`、`web/steiger.config.ts` | `pnpm run lint:fsd`、`pnpm run arch:check` | 把用户菜单拆成独立 widget 时 `fsd/forbidden-imports` 与 `fsd/insignificant-slice` 必须报错（实测即此结果） | Passed |
| 导航列的样式不写硬编码颜色 | 颜色字面量绕过 token | `web/src/widgets/app-sidebar/ui/app-sidebar.module.css` | `pnpm run check:tokens`（门禁脚本 `web/scripts/check-design-tokens.mjs`） | 在 CSS Modules 里写入颜色字面量时 gate 必须失败（参照 `box-shadow` 的字面量因此换成 `--shadow-0` / `--shadow-2`） | Passed |
| 导航项的层叠顺序与参照的 Less 编译结果一致 | 激活态被 hover 或主操作样式压过，`/agent` 上的「新建对话」外观偏离参照 | `web/src/widgets/app-sidebar/ui/app-sidebar.module.css` | `test/unit/widgets/app-sidebar-cascade.test.ts` 断言四条规则的源码顺序与主操作悬停态的三元素选择器 | 把 `.navItem:hover` 挪回 `.navItem.primaryAction` 之前，该用例必须失败（已做变异验证） | Passed |
| 导航列的视觉与参照逐条对齐 | 与参照的尺寸、间距、状态外观差异 | `web/src/widgets/app-sidebar/ui/app-sidebar.module.css` | 浅色 / 暗色 / 窄屏截图与参照同尺寸对照 | 差异必须落在台账的「声明偏离」清单里 | Not run（本机没有浏览器） |

待执行的验证（交接给迁移方）：真实浏览器走查 `/agent`、`/dashboard`、`/extensions`、`/extensions/knowledgebase/:kbId`、`/extensions/skill/:slug`、`/agent-manage` 的浅色 / 暗色 / 窄屏；折叠 → 刷新 → 保持；用户菜单的调试入口与快捷键；导航项的超管与 LITE 两种门禁；导航列底部日夜切换的圆形过渡。逐页台账与截图放在 `web/alembic/pages/shell/report.md`。

已知未验证范围：真实页面的三套视觉走查（本机没有浏览器）、`DayNightSwitcher` 放进 32px 导航项后的高度与对齐、全局搜索的工作区文件模式、任务中心与设置面板。
