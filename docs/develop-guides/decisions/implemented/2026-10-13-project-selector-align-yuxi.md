# 对话页的项目选择器对齐参照

状态：implemented
类型：feature
Owner：web/src/features/chat/ui/project-selector.tsx

事实分工：本记录拥有项目选择器的**触发钮与面板结构**、**新建项目的形态**（Modal）与**目录选择的交互**。`web/src/features/chat/ui/workspace-path-picker.tsx` 拥有目录浏览器本身（面包屑、新建文件夹、刷新、目录列表）；`web/src/features/chat/api/filesystem-api.ts` 拥有这两个动作的端点与归一；`web/src/features/chat/ui/input-selector.module.css` 拥有面板视觉值。数据加载仍在页面（`model/project-queries.ts` 的 react-query）与 `pages/chat/ui/chat-page.tsx` 的装配处。

## 问题

项目选择器此前只对齐了参照的文案与纯逻辑（`lib/project-selection.ts`），形态与交互都走样：

- 触发钮多一个箭头；参照的触发钮只有文件夹图标与文字（`ProjectSelectionSection.vue` 的 `.project-trigger`）。
- 面板是手写的「全屏透明遮罩 + 绝对定位面板」，参照用的是 antd 下拉（`a-dropdown` + `placement="topLeft"`）。同页的「+」面板已经用 antd 下拉，两套弹层并存。
- 面板缺参照的交互：搜索行没有放大镜、没有加载态、加载失败只在列表上方给一行文字（没有「重新加载」）、列表项没有图标、没有 `aria-pressed`、空文案不随查询词变化、打开面板不聚焦搜索框。
- 历史对话是「整面板换视图 + 底部返回按钮」；参照是搜索行里带返回钮的二级页（`.history-search-row`）。
- 新建项目是面板内嵌表单、目录靠手填路径；参照是 Modal（640px，「创建并选择 / 取消」），目录用 `WorkspacePathPicker` 浏览选择。

## 决策

1. **触发钮与面板换成 antd 下拉**（与 `composer-options.tsx` 同形：`popupRender` 承载自有面板）。触发钮去掉箭头，补参照的 `active` 态（展开时灰底）、`max-width: min(280px, calc(100vw - 64px))`、768px 与 520px 断点。
2. **面板补参照的交互**：搜索行（放大镜 + `input[type=search]`）、列表加载态（antd Spin）、每行图标（不使用项目用 FolderX，项目用 FolderClosed）、选中项 `aria-pressed` + 勾、空文案随查询词切换（「暂无已有项目」/「没有匹配的项目」）、加载失败的错误块带「重新加载」按钮、操作行「新建项目 / 从历史对话添加 ›」。打开面板与切视图都把焦点放进对应的搜索框（参照的 120ms 延时，等弹层挂载）。
3. **历史视图改成搜索行带返回钮的二级页**，条目补会话图标，空态文案合并错误（`historyError || '没有可添加的历史对话'`）。
4. **新建项目改成参照的 Modal**：640px、标题「新建项目」、「创建并选择 / 取消」、`confirmLoading`、名称为空或目录未选时禁用确认、名称框 autofocus 且回车提交。
5. **新增目录选择器组件**（`workspace-path-picker.tsx`）：面包屑（首段 Workspace，可点回上级）、新建文件夹（行内表单 + 提交/取消）、刷新、目录列表（选中打勾、未选中给箭头）、当前选择行、加载/空/错误三态。只做**目录模式**——参照还有 files 多选模式，本仓没有消费方。
6. **根目录能进不能选**（参照的 `unselectableDirectories` 默认 `['/']`）：项目要挂在子目录上，挂到个人空间根等于把整个空间当一个项目。
7. **新接一个写端点**：`POST /api/workspace/directory`（新建文件夹），列目录复用 `GET /api/workspace/tree` 并带上 `include_unbound_project_dirs`，否则刚建好还没绑项目的目录在选目录界面里看不到。
8. **数据加载仍留在页面**（用户选定）：项目列表、历史候选与创建继续由页面的 react-query 注入，组件只做交互；面板里的「重新加载」通过 `onReloadProjects` 回到页面已有的查询。参照把加载放在组件里，是因为它没有数据层。

## 替代方案

**只对齐样式、保留手写遮罩与绝对定位**：弹层的定位与翻转要自己维护，且同页会有两套弹层实现；换成 antd 下拉后这两件事都消失。

**新建项目保留面板内视图**：参照是 Modal，且面板只有 300px 宽，塞不下目录浏览器；把目录选择器放进面板等于把参照的两层结构压成一层。

**目录继续手填路径**：参照做目录浏览器的理由就是不让用户手打宿主机路径；手填把「这个路径存不存在、能不能写」全部推给后端，用户要等一次失败才知道。

**把数据加载搬进组件（照参照）**：本仓有 react-query 数据层与创建后的缓存前置（`useCreateLinkedProject` 的 `onSuccess`），组件再拉一份会让「创建后立刻选中」变成两处状态同步。用户选定保持页面注入。

**目录选择器连 files 模式一起做**：参照的 files 模式服务它的上传弹窗与产物卡片，本仓没有消费方，按「抽象要有当前 consumer」不做。

## 后果

- 新建项目从「面板内两步」变成「面板 → Modal」；目录从手填变成浏览选择，用户不再需要知道个人空间的目录结构才能填对。
- 目录选择器会调一个**写端点**（新建文件夹），它在个人空间下建真实目录；这是本批唯一新增的写能力，也是唯一会改动用户数据面的入口。
- antd 弹层收起时是隐藏而不是卸载，面板内容仍在 DOM 里；测试因此改看触发器的 `aria-expanded`，不再断言「面板内容消失」。
- 目录选择器每次打开按 `key` 重新挂载（创建会话的幂等键），当前目录与「新建文件夹」行随会话重置，不需要在收起时同步重置状态。
- 目录选择器只支持目录模式；将来若要选文件，需要按参照补 files 模式与 `isFileSelectable`。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 下拉面板与参照同构 | 面板少了加载/重试/图标/焦点 | `project-selector.tsx` | `project-selector.test.tsx` 18 例；真实页面与 Yuxi `127.0.0.1:5174` 同视口并排截图 | 去掉加载态时列表在请求期间显示「暂无已有项目」 | Passed |
| 新建项目是 Modal，目录来自目录浏览器 | 回到面板内视图或手填路径 | 同 | 同上的并排截图（两侧 Modal 结构一致）；`project-selector.test.tsx` 的创建用例 | 目录手填时没有面包屑与「新建文件夹」 | Passed |
| 目录选择器只列目录、根不可选、能新建文件夹 | 列出文件 / 能选中根 / 建不出目录 | `workspace-path-picker.tsx` | `workspace-path-picker.test.tsx` 9 例 | 不滤 `isDir` 时 `readme.md` 会出现在列表里（用例已断言） | Passed |
| 列目录带上未绑定项目目录 | 刚建的目录看不到 | `filesystem-api.ts` | `project-selector.test.tsx` 断言请求参数 `includeUnboundProjectDirs: true` | 不带该参数时未绑定目录不返回 | Passed |
| 历史视图是带返回钮的二级页 | 返回路径丢失 | `project-selector.tsx` | `project-selector.test.tsx` 的返回用例；真实页面并排截图 | — | Passed |
| 收起面板后迟到的响应不落到列表上 | 关掉弹窗后列表被写脏 | `workspace-path-picker.tsx` | `workspace-path-picker.test.tsx` 的「收起后迟到的响应不再落到列表上」 | 去掉请求序号时会渲染出迟到的目录 | Passed |
| 旧能力不存在： 手写遮罩与绝对定位面板、面板内嵌的新建视图、手填的「目录路径」输入、触发钮的箭头已删除 | 半套体系共存 | 本记录 | `input-selector.module.css` 已无 `.projectOverlay` / `.projectPanelFloating` / `.projectView` / `.optionMeta`；`project-selector.tsx` 无 `ChevronDown` | — | Passed |
| 重新引入条件： 仅当出现第二个目录选择消费方（如上传弹窗）时按参照补 files 模式 | 无条件回归 | 本记录 | — | — | — |

## 风险

- 目录选择器是本仓第一个「浏览并新建目录」的界面，它的写端点会真实改动个人空间；权限最终仍由后端判定，前端只负责把拒绝原因显示出来。
- 面板的搜索框在打开时自动聚焦（参照行为），在移动端会唤起软键盘；参照如此，未改。
- 名称输入框的 `autoFocus` 会触发 `no-autofocus` 提示（本仓 `global-search-modal` 已有同样一处）；这是参照的行为，保留。
- 目录选择器只在创建弹窗打开时加载；关闭后不保留当前目录，下次打开回到 `value` 或根目录。

## 证据

- `pnpm run check-types`、`pnpm run lint:check`（24 warnings / 0 errors，与本次改动前一致）、`pnpm run check:tokens`、`pnpm run lint:fsd`、`pnpm run arch:check`、`pnpm run format:check`、`pnpm run build` 全部通过。
- `pnpm run test:unit`：187 文件 / 2133 例全过（本次改动前 186 / 2124）。
- 真实页面：`127.0.0.1:5173`（本仓）与 `127.0.0.1:5174`（参照 `Yuxi/web` 的 vite，代理同一个 api 容器）同视口并排截图，覆盖触发钮展开、面板一级页、历史二级页、新建 Modal 与目录浏览器；目录列表取自真实个人空间（`agents` / `projects`）。
- 新端点 `POST /api/workspace/directory` 的契约来自已生成的 SDK 类型（`CreateWorkspaceDirectoryRequest`），不是猜测。

## 已知未验证范围

- 真实创建项目未走通：会往 dev 库写一条项目记录，因此只验证到「目录选择器把路径交给表单、确认按钮随名称与目录就绪」。新建文件夹同理（会真实建目录）。
- 深色模式未逐像素对照。
- 目录选择器的键盘导航（Tab 顺序、面包屑的横向滚动）未走查。
- 面板搜索框自动聚焦在移动端唤起软键盘的影响未评估。
