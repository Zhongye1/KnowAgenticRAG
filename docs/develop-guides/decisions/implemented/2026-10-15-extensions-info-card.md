# 扩展页四类卡片统一为参照 InfoCard 的一套结构

状态：implemented
类型：feature
Owner：web/src/shared/ui/info-card.tsx

事实分工：`web/src/shared/ui/info-card.tsx` 拥有卡片词汇（32px 图标块、名称 + 等宽副标题、两行描述、自绘标签行、右上动作区、可选的 children 扩展位），结构与数值逐条对照参照 `components/shared/InfoCard.vue` 的 default 形态；四类卡片（知识库 / 技能 / 工具 / MCP）各自只提供数据与动作。标签色的映射（`gray` / `blue` / `orange` 等）与参照 `main.css` 的 `.card-tag.tag-*` 同键。词汇的事实源是参照仓库，本仓的卡片此前各写各的。

## 问题

1. **四类卡片没有共同结构**：知识库卡把类型与只读徽标放在标题下（antd Tag）、统计摘要用 `dl`；技能卡用 antd Tag；工具卡用 antd Tag；MCP 卡没有标签行——四个文件四套间距与字号，与参照的 `InfoCard`（32px 图标块 + 名称/副标题 + 两行描述 + 标签行）完全不同。
2. **参照的行为事实**（`InfoCard.vue` 491 行）：图标块 32px / gray-50 底 / gray-150 边框 / 7px 圆角；名称 14px/600、副标题 12px 等宽 gray-600；描述 13px、最多两行、`min-height: 2.8em`（单行描述的卡片不塌）；标签 11px/600、22px 高、4px 圆角；整卡 hover 换 gray-300 边框 + gray-25 底；右上动作区 `min-height: 24px`。
3. **知识库副标题的口径差**：参照是「2 天前创建 · 0 文件」（相对时间），本仓此前没有副标题、统计摘要直接铺在卡底。

## 决策

1. **抽 `shared/ui/info-card.tsx`，四类卡片共用**：props 是 `slug`（挂 `data-slug` 供测试定位）、`testId`（知识库卡沿用 `knowledge-card`，其余默认 `info-card`）、`title` / `subtitle` / `description` / `tags` / `icon` / `action` / `onOpen` / `children` / `className`。标签是自绘 `<span>` 而不是 antd `Tag`：参照的标签更小更扁（11px/22px vs antd 12px/24px），色键要按参照映射。
2. **知识库卡对齐参照的副标题口径**：副标题改为「{相对时间}创建 · {N} 文件」，相对时间用 shared 的 `formatRelativeTime`（与参照的 `formatCreatedTime` 同档：刚刚 / N 分钟前 / N 天前 / N 个月前 / N 年前）；统计摘要（文件 / 分块 / 大小 / 处理中）保留在描述下方——这是本仓比参照多的信息，不删。
3. **`formatRelativeTime` 上移到 shared**（出现了第三个消费方：chat 项目选择、知识库卡、以及此前两处重复实现）：`features/chat/lib/project-selection.ts` 改为 re-export `@/shared/lib` 的实现，行为逐档等价。
4. **技能卡的勾选框进动作区**：参照在批量模式下把勾选框叠在卡片左上角，本仓放进 `action` 位（与启停按钮互斥）——同一信息架构下更整齐，测试与读屏的定位不受影响。
5. **MCP 卡走同一组件的精简形态**：无副标题、无标签行，emoji 进图标块——与参照 mini 形态的视觉结果一致。
6. **显式偏离参照**：

| 参照 | 本仓 | 理由 |
|---|---|---|
| 知识库标签带共享范围与嵌入模型 | 只留类型与只读 | 共享范围在详情页的「共享设置」里改，卡上不放 |
| 工具分类色键写死四类映射 | `toolCardTags` 按分类名映射（内置工具/MySQL → blue，其余 gray） | 分类来自数据推导，映射同源 |
| 技能卡的「已被个人版本覆盖」是 antd error 红 | `orange`（与参照 `.tag-orange` 同色：error-50 底 error-700 字） | 参照的 orange 本来就是 error 色对 |
| hover 有 `cursor: pointer` 但无阴影变化 | 一致（只有边框与底色变化） | — |

不造：参照的 `mini` 变体、`card-more-action-corner`（右上更多菜单——本仓知识库卡把菜单放在动作区）、`status` 状态点、`footer` 插槽（当前四类卡片都没有这些需求）。

## 替代方案

**给四类卡片各自补类名，不抽组件。** 最少的改动行数，但参照 InfoCard 的间距/字号/行高有十余处数值，抄四遍必然漂移（这四个文件此前已经各漂移了一轮）。

**只改知识库与技能，工具与 MCP 保持自绘。** 工具与 MCP 是上一批刚落地的，结构与参照已经接近；但「一套词汇」的价值在于下次调整只改一处。

## 后果

- **`shared/ui/info-card.tsx` 成为第五个公共控件**（empty / list-toolbar / confirm-dialog / notifications 之后）。它的 props 面向「参照 InfoCard 的形态」，不是通用卡片。
- **`features/chat/lib/project-selection.ts` 的 `formatRelativeTime` 变成 re-export**：chat 内部消费方不变；`shared/lib/format/relative-time.ts` 是新的实现位置。
- **技能卡标题从原名变为 `formatExtensionTitle` 格式化**（`shared one` → `Shared One`），与工具 / MCP 卡同一口径；三处测试断言已同步。
- **知识库卡高度从 170px 到 180px**（多了副标题行）；技能 / 工具卡 154px，MCP 卡 112px——与参照对应形态的密度一致。

## 验证

**单测与门禁（本机 Node 26）**

| 命令 | 结果 |
|---|---|
| `NODE_ENV=test vitest run` | 227 文件、2429 例通过（本批未新增用例：卡片是纯展示重组，既有用例继续覆盖行为——搜索、启停、批量选择、详情入口；`model-provider-panel` 的既有装载失败与本批无关） |
| `tsc --noEmit` / `oxlint src` / `steiger` / `depcruise` / `check:tokens` / `prettier --check` / `vite build` | 全部通过（oxlint 0 error / 28 warning，与改动前同数） |
| `python3 scripts/verify_engineering_contracts.py` | 通过 |

**真实页面走查（zwj / superadmin，真实后端 `localhost:5173`，参照在 `localhost:5175` 同库对照）**

以参照量了四个属性：图标块 32px、名称 14px/600、卡高、标签内容。四个 tab 与参照的对应形态一致——知识库卡（副标题「1天前创建 · 0 文件」、标签「ARS」）、技能卡（副标题 slug、标签「只读全局」）、工具卡（副标题 slug、标签「内置工具 / skill / 安装」）、MCP 卡（无副标题、无标签）。截图：`web/alembic/pages/extensions/evidence/cards-{knowledge,skills,tools,mcp}-1440x900.png` 与 `yuxi-cards-knowledge-1440x900.png`。

**未验证范围（不计为通过）**

- 深色主题与窄屏下的四类卡片。
- 工具卡分类色的完整映射（数据里只有「内置工具 / 知识库」两类的真实样本）。
- 知识库卡的创建时间为空时副标题只剩文件数的分支（库里所有库都有 created_at）。

**重新引入条件**

`InfoCard` 的 props 开始只为某一个消费方增加时（例如给它加一个只有知识库卡用的统计行），说明它已经不是共同词汇——那一处退回调用方用 `children` 自组，而不是把特例塞进共享组件。
