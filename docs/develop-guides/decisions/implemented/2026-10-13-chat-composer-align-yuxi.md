# 对话页输入面板对齐参照的输入面板

状态：implemented
类型：feature
Owner：web/src/pages/chat/ui/chat-input-form.tsx

事实分工：本记录拥有输入面板的**分区与挂载位置**（左簇 `[+][审批模式][智能体]`、右簇 `[引导][用量环][模型][发送]`、胶囊顶灰条挂在胶囊之外）与**拖放所有权**（在胶囊上，不在编辑器上）。`web/src/features/chat/ui/composer-options.tsx` 拥有「+」面板的内容与二级页；`web/src/features/chat/ui/mention-editor.tsx` 拥有编辑器的命令式插入接口；`web/src/features/chat/ui/context-usage-ring.tsx` 拥有用量环的命中区与说明；`chat-page.module.css` / `input-selector.module.css` / `composer-options.module.css` 各自拥有其视觉值。

## 问题

输入面板是照着参照的 `.input-box` 移植的，但只搬了容器与编辑区，选项行与顶区在结构上走样：

- 参照的左簇是 `[+ 展开] [审批模式] [智能体]`、右簇是 `[引导] [用量环] [模型] [发送]`；本仓把七项全部塞进左侧，右侧只剩发送钮，模型选择器因此从发送钮旁挪到了最左边。
- 参照的附件与图片是「+」展开面板里的条目；本仓是两颗顶层 antd 描边按钮（32px、1px 边框、14px），与相邻的无边框选择器触发钮是两套视觉语言，且 `gap: 0` 让它们的边框贴在一起。
- 参照的顶灰条 `.composer-extra-region` 在胶囊**外面**；本仓把它放成胶囊内的首个 grid 行，叠加面板自身的 `padding: 0.8rem` 后，灰条距上边框 12.8px、左右内缩 24px，成了内嵌灰带。
- 编辑区下边距被算了两次（`.inputEditor` 与内层 `.editor` 各 `0.5rem`，flex item 建立 BFC 不外溢），比参照多约 8px。
- 拖拽高亮只覆盖编辑区，且没有参照的虚线叠层与「释放以上传附件」文案。
- 待发送图片渲染在 `.chat` 列里、`.contentRow` **之后**，即输入停靠区下方，与胶囊脱开。

## 决策

1. **按参照的 `.agent-composer` + `.input-box` 重组 DOM**：顶灰条移出胶囊（`.composerExtra`，`margin: 0 12px -2px`，靠 `.composerExtra + .inputPanel { z-index: 1 }` 让胶囊压住它的下缘）；胶囊内保持四区 `top / input / options / send`，其中 `options` 是 `[+]` 加 `.inputActionsLeft`、`send` 是 `.inputActionsRight` 加发送钮——与参照的槽位边界一一对应，因此 `gap` 也是参照的两档（`+` 与动作行之间 0、动作行内 2px）。
2. **附件与图片移进「+」面板**（`ComposerOptions`），面板内容与参照的 `AttachmentOptionsComponent` 同构：添加附件 / 上传图片，分隔线，再按资源分组进二级页（返回行 + 同层列表）。分组只放知识库与技能——与参照的 `RESOURCE_GROUPS` 同值，MCP 与子智能体在参照里也只走 `@` 候选。
3. **给 `MentionEditor` 加命令式 `insertMentionToken`**：面板选资源要往编辑器里插令牌，而 `@` 候选那条路径要求先存在 `@查询`（`insertMention` 依赖 `popup` 范围）。光标不在编辑器里时追加到末尾，而不是丢弃这次选择。
4. **拖放整体搬到胶囊上**（含虚线叠层与文案，即参照的 `.input-box.dragging-files`）：拖放事件与高亮必须同一个 Owner——高亮覆盖整块而接受范围只有编辑区，等于对用户说谎；何况落在胶囊其他位置的 drop 会走浏览器默认行为（把文件当导航，整页跳走）。`MentionEditor` 因此不再有 `onDropFiles` / `onDraggingChange`，只剩编辑器本身的职责。
5. **待发送图片与「已绑未用」附件移到胶囊的 top 区**，按参照的 `.input-top-stack` 纵向排列（图片在上、卡片在下，整块与编辑区留 8px；没有内容时整块不渲染，否则白占 8px）。附件的判据复用 `pendingThreadAttachments`，与随发送下发的 `pendingAttachmentFileIds` 同源，避免「预览显示了却没下发」。
6. **修掉停止钮永远点不动**：`disabled={!canSend}` 里的 `canSend` 要求 `!isStreaming`，于是运行中按钮被禁用，而它是页面上唯一的 `cancelRun` 入口——运行中的回答停不下来。参照的 `isSendButtonDisabled` 同样把 `isProcessing` 排除在外。改为 `disabled={!canSend && !isStreaming}`，恢复代码本就写好的 `isStreaming ? 停止 : 发送` 分支。
7. **触发钮按参照补宽度上限与窄屏收缩**：智能体 240px / 审批模式 180px / 模型 168px；`@container (max-width: 640px)` 时审批模式与智能体收成 30px 纯图标钮（参照的 `.config-dropdown-compact-icon` 就是宽屏隐藏、窄屏才出现的那个图标）。胶囊补参照的 520px 断点。
8. **模型选择器去掉箭头**、**用量环只在有会话时出现**：参照的 nano 触发钮只有模型名（`.model-select` 是 div，无箭头），用量环的 `showStateEntry` 是 `Boolean(currentChatId)`。用量环同时补上参照的 26px 命中区、hover 底色与 antd Tooltip 说明；「+」面板项补参照的 `:focus-visible` 环。

## 替代方案

**只改样式、不动结构**：做不到。左簇七项挤在一行、附件与图片是顶层描边按钮、灰条在胶囊内，都是结构差异，改配色与间距解决不了。

**保留顶层附件/图片按钮，只补一个「+」**：会比参照多出两个入口，附件上传因此有两条路径，且视觉上仍是描边按钮与无边框触发钮混排。

**「+」面板用 antd Menu 的 submenu 做二级**：参照是面板内钻取（返回行 + 同层列表），submenu 是浮层飞出，形态不同；面板内容是自有类名，本就不吃 `.chat-dropdown-overlay` 那套 Menu 皮肤。

**附件卡片保留移除钮**：本仓没有删除附件的端点，附件是「确认即绑到会话、被请求用掉后消失」。渲染一个点了没反应的按钮比不渲染更糟——同 `agent-selector` 对「编辑/新建智能体」两个入口的处理。

**把模型选择器改成参照的 div**：参照的触发钮是无角色的 `div`，点击目标不可聚焦、读屏读不到。保留 `button` 与 `aria-label`，只对齐视觉（去掉箭头）。

**用量环的说明照抄参照的数字格式**：参照是一位小数百分比、1000 进制的 K/M、斜杠不留空格；本仓的用量卡片用 `formatTokenCount` / `getTokenUsagePercentLabel`（整数百分比、1024 进制）。同一个用量在卡片和环上给出不同数字，比与参照的格式差异更糟，因此只对齐回退顺序与 Tooltip 形态。

**去掉「上传图片」的加载态**：参照的面板项始终显示 Image 图标，没有 spinner。本仓保留它——上传在途时面板项需要给出反馈，且它与参照的差异只在上传期间存在。

## 后果

- 打开附件上传从一步变两步（点「+」→「添加附件」）。这是与参照一致的代价，也是 `chat-page.test.tsx` 四处用例改走 `openAttachmentDialog()` 的原因。
- 拖放从编辑器搬到胶囊：`MentionEditor` 不再接受拖放，任何落在胶囊内的文件都由页面注入的 `onDropFiles` 处理（图片槽只取第一个）。
- 停止钮在运行中恢复可点：这是本批唯一的行为修复，改变了「运行中点它无效」的现状。
- 输入面板不再依赖 antd `Button` / `Spin`；发送钮本来就是原生 button，现在整块面板只有 Dropdown/Tooltip 是 antd 组件。
- 附件卡片不显示状态文本，meta 只给文件大小；用户不能撤销已绑定的附件。
- 「+」面板的资源项依赖智能体配置给出的候选；没有候选时面板只剩附件与图片两条（与参照同规则）。
- 窄屏收缩依赖 `.inputPanel` 的 `container-type: inline-size`；去掉它会静默失效。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 同宽下左右两簇与参照一致 | 选项行分区回归 | `chat-input-form.tsx` | 真实页面 1120×760 截图，与 Yuxi `127.0.0.1:5174` 同视口并排比对 | 七项合到左侧时右簇为空，截图立刻可见 | Passed |
| 顶灰条挂在胶囊之外 | 灰条变内嵌带 | 同 | 同上的真实页面截图 | 放进胶囊内会多出面板 padding 的 12.8px 上间距 | Passed |
| 「+」面板能开附件/图片，并能插入提及令牌 | 入口消失或令牌插不进去 | `composer-options.tsx` / `mention-editor.tsx` | `composer-options.test.tsx` 8 例、`mention-editor-component.test.tsx` 的命令式插入 2 例；真实页面点「+」→「添加附件」开出 `dialog "添加附件"` | 不实现 `insertMentionToken` 时二级页选中不落令牌 | Passed |
| 窄屏触发钮收成图标 | 窄屏文字溢出 | `input-selector.module.css` | 真实页面 900px 视口截图（面板 603px）显示 `[+][手][机器人]`；1120px 视口显示全标签 | 去掉 `@container` 后窄屏仍显示全标签 | Passed |
| 拖拽接受范围与高亮同界 | 高亮说谎或 drop 走浏览器默认 | `chat-input-form.tsx` | 真实页面把 `dragover` 派发到胶囊右下角（落点是发送钮而非编辑器）后整块出现虚线叠层；`chat-input-form.test.tsx` 3 例 | 拖放留在编辑器上时胶囊其他位置不接受、也不高亮 | Passed |
| 运行中的回答能被停止 | 停止钮永远禁用 | `chat-input-form.tsx` | `chat-input-form.test.tsx`「运行中保持可点，点了停止而不是发送」 | 用 `disabled={!canSend}` 时该用例取不到可点的停止钮 | Passed |
| 顶区按参照纵向排列、空时不占位 | 图片与卡片并排 / 白占 8px | `chat-page.module.css` | `chat-input-form.test.tsx` 顶区 2 例（空时不渲染、有内容时两者都在） | 空顶区仍渲染时会多出 8px | Passed |
| 输入区顶栏只预览还没被用掉的附件 | 预览与下发不同源 | `lib/attachment-upload.ts` | `chat-page.test.tsx` 新增用例（待发送出现、已用掉不出现） | 用 `requestId` 之外的第二套判据时会两处不一致 | Passed |
| 用量环与模型选择器的出现条件同参照 | 空会话出现无意义入口 | `chat-input-form.tsx` / `model-selector.tsx` | 真实页面空会话截图：无环、模型名无箭头；与 Yuxi 同视口一致 | 无会话仍渲染环时与参照截图不一致 | Passed |
| 旧能力不存在： 选项行里的顶层「附件」「图片」按钮、`inputTop` 的灰底顶区、`wrapperDragging` 编辑区高亮、`MentionEditor` 的 `onDropFiles`/`onDraggingChange`、模型选择器的箭头已删除 | 半套体系共存 | 本记录 | `chat-input-form.tsx` 已无 antd `Button`/`Spin` import；`mention-editor.module.css` 无 `.wrapperDragging`；编辑器 props 无拖放项 | — | Passed |
| 重新引入条件： 仅当参照新增分组，或本仓出现附件删除端点时，按同一形态回填 | 无条件回归 | 本记录 | — | — | — |

## 风险

- 打开附件的路径变长一步，用户若习惯顶层按钮会有一段适应期。
- 窄屏收缩是容器查询，容器是 `.inputPanel`；将来若去掉 `container-type`，收缩会静默失效而不是报错。
- 附件卡片不显示 `status`，用户看不出后端侧的解析状态。

## 证据

- `pnpm run check-types`、`pnpm run lint:check`（24 warnings / 0 errors，与改动前基线一致）、`pnpm run check:tokens`、`pnpm run lint:fsd`、`pnpm run arch:check`、`pnpm run format:check`、`pnpm run build` 全部通过。
- `pnpm run test:unit`：186 文件 / 2118 例全过（改动前 184 / 2102）。
- 真实页面：`127.0.0.1:5173`（本仓）与 `127.0.0.1:5174`（参照 `Yuxi/web` 的 vite，代理同一个 api 容器）同视口截图并排比对，覆盖空态、宽屏、窄屏、拖拽、「+」面板一级与二级页，以及「+」→「添加附件」开出上传弹窗。
- 独立 Reviewer（不继承开发上下文）审过完整需求、diff、测试与规范；其提出的 9 条中，停止钮禁用、拖放所有权、顶区排列、格式化、注释与 `:focus-visible` 已在本批修掉；用量环说明的数字格式与「上传图片」的加载态保留本仓做法（见「替代方案」与「后果」）。
- 未做：`pnpm run api:check` 失败，但它在干净工作树上同样失败（后端容器的 OpenAPI 与已提交快照不一致），与本次改动无关。

## 已知未验证范围

- 深色模式未逐像素对照（两侧 token 同源，只核对了取值）。
- 附件与图片的真实端到端（选文件 → 上传 → 解析 → 确认 → 卡片出现）未在浏览器里走通：顶区的渲染由 `chat-input-form.test.tsx` 覆盖、图片槽的粘贴/选图路径由页面用例覆盖、弹窗打开已在真实页面确认；真实上传会往 dev 库与对象存储写数据，因此没做。
- 「+」面板的 `menu` / `menuitem` 键盘导航（方向键）未走查；参照同样没有方向键处理。
- 读屏下的面板语义未走查。
- 项目选择器（页面级组件，挂在顶灰条槽位）与参照仍差一个箭头，未在本次范围内改动。
- `insertMentionToken` 在「光标前已有提及芯片」时落点会偏（`setSelectionRawOffset` 只按文本节点长度算，不认芯片的原始长度）。这是 `@` 候选插入路径（`insertMention`）共有的既有局限，本次沿用；空编辑器与追加到末尾两种常见情况正确。
