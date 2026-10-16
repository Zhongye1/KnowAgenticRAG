# 知识库文件面板：编排层与列定义离开 UI 组件

状态：implemented
类型：simplification
Owner：web/src/features/knowledge-base/model/use-file-actions.ts

## 问题

`knowledge-file-table.tsx` 的 1254 行里同时住着三件事：11 个写操作的 mutation 编排、13 个视图 state、542 行 JSX（其中单块 190 行是列定义 memo）。已经抽出去的 `file-panel-header` 与 `file-row-actions` 都是纯视图，而设计写操作的那一半——mutation、确认框、通知文案、分批循环、门禁派生——全部内联在组件里，于是每个子组件都靠一个胖回调袋接线（`FilePanelHeader` 收 6 个现写的箭头函数，每个都是「mutate 完挑一句文案通知」）。同一目录还平铺着 11 个文件，分不出哪些属于表格、哪些是弹窗。

## 决策

1. 写操作编排抬到 `model/use-file-actions.ts`：11 个 mutation、通知标题「文件」的全部文案、单删与批删的确认、50 个一批的分批与成败累计、`locked` / `canMutate` / `batchBusy` / `repairing` / `folderBusy` / `canBatch*` 的派生都归它。组件只把视图事实喂进去（`items`、`selectedIds`、`stale`、`filtered`、`virtualPath`）并把回调接上。
2. 七列定义抬到 `ui/files/table/file-table-columns.tsx`，做成纯函数 `fileColumns(options)`；`useMemo` 与依赖收集留在持有数据的组件里。
3. `ui/files/` 按职责分四个子目录：`table/`（容器、行操作、列定义）、`panel/`（面板首行）、`dialogs/`（六个弹窗）、`preview/`（预览与其 PDF 分支）。纯路径移动，文件名不改。
4. 视图碎片的进一步切分（工具栏、批量条、分页行）不在本批：工具栏与分页在 B1 会被重写，现在切会移动两次。
5. 分工：`model/use-file-actions.ts` 拥有写操作编排，`ui/files/table/file-table-columns.tsx` 拥有七列定义与单元格渲染，`ui/files/` 的目录分层约定由 `web/ARCHITECTURE.md` 拥有。

## 替代方案

- **保持单文件**：列定义与编排继续内联。代价是 B1 的每一项改动都落在一个 1200 行的文件里，且胖回调袋继续扩散。
- **编排与组件同目录**（`ui/files/table/use-file-actions.ts`）：放弃的原因是它不是展示；`model/` 才是「状态、校验、业务规则」的段，同切片已有 `model/use-department-management.ts`、`model/use-user-management.ts` 的先例，两者也都从 `shared/ui` 取确认框与通知。
- **列定义做成 `useFileTableColumns` hook**：依赖收集一并搬走，但契约就变成 15 个入参，看不出「谁持有数据」。纯函数加调用方 memo 更直白。
- **连工具栏、批量条、分页一起切**：本批可以做完，但会把 B1 的重写面扩大一次。按「做到哪块切哪块」处理。

## 后果

- 容器 1254 → 818 行，其中不再有 mutation、通知文案与列定义；新增两个文件（编排 464 行、列 257 行）。
- 批量条的三个按钮不再各自写一遍 `items.some((item) => selectedIds.includes(...) && canX(item))`：选择先收成 `Set`，三个可用性由编排层派生。
- 目录多了一层，`web/ARCHITECTURE.md` 的「切片与分段」补了判据（职责或引用簇，不看文件数）与「写操作不放进 `ui/`」一条。
- 未处理：`ui/files/table/knowledge-file-table.tsx` 仍有 483 行 JSX（工具栏、批量条、表格外壳、分页行、五个弹窗接线）；面板首行的三个批量入口（`parsePending` / `indexPending` / `repairStats`）与文件夹新建/重命名的失败文案，从空兜底改成 `操作失败。`（这几条失败分支没有测试覆盖）。

## 验证

- `pnpm run lint:check`（错误与告警数不比改前多，本批文件零发现）、`pnpm run check:tokens`、`pnpm run lint:fsd`、`pnpm run arch:check` 通过；`pnpm run check-types` 只剩 `test/unit/features/workspace/workspace-ui.test.tsx` 的 5 个既有错误。
- `NODE_ENV=test pnpm exec vitest run test/unit/features/knowledge-base/ test/unit/pages/knowledge-base-page.test.tsx test/unit/pages/extensions-page.test.tsx test/unit/app/router-knowledge-route.test.tsx`：563 通过、2 失败，失败集合与改前逐条一致（`展示名称、类型、描述与统计卡` 与 `刷新文件列表时一并刷新详情，统计卡不会停在旧数字`，均为统计卡搬入文件表后遗留的过时断言）。
- 表格用例 66 个在三次改动后分别全绿：纯路径移动后、抽编排层后、抽列定义后。它们是本次重构的 oracle，不需要修改。
- 旧能力不存在：组件内不再有 mutation 对象、`addNotification` 调用、确认框调用、分批循环与列定义 memo；`ui/files/` 下不再有平铺的弹窗与预览文件。
- 重新引入条件：只有当文件面板不再是唯一消费者、或编排需要被第二个面板复用时，才考虑把 `use-file-actions` 再往上提（提到 `features/knowledge-base/model/` 之外），而不是把编排放回组件。
