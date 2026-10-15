# 对话页的容器 / 视图 / 提交编排拆分

状态：implemented
类型：simplification
Owner：web/src/pages/chat/ui/chat-page.tsx

事实分工：提交编排归 `pages/chat/model/use-chat-submission.ts`，线程生命周期副作用归 `pages/chat/model/use-chat-thread-lifecycle.ts`，页面结构与条件渲染归 `ui/chat-page-view.tsx`；`features/chat` 的运行时、流式订阅、文件面板 hook 不变。

## 问题

`ChatPage` 同时承担页面 JSX、发送/建线程/附件编排和线程生命周期副作用，是过度承担协调职责的上帝组件：`submitMessage` 与附件确认各自维护建线程路径，发送策略的修改要穿过大量无关 UI 编排。

## 决策

1. 提交编排收拢到 `use-chat-submission`：普通发送与引导共用「必要时先建线程」这一条路径；附件确认走它建线程但不发消息；发送冷却、409 run_interrupted 恢复输入、引导失败还原输入、切线程后放弃迟到结果都在这里。
2. 线程生命周期副作用收拢到 `use-chat-thread-lifecycle`：挂载时确保默认智能体、进入线程标记已读并加载历史（加载完强制滚底）、按智能体同步队列、离开线程断开排队事件流。
3. 页面 JSX 移入纯视图 `ChatPageView`：按 header / conversation / composer / sidePanel / overlays 分组接收数据与回调，不读路由与 store、不发起业务动作；空态问候与生成中计时等纯展示状态由容器传入或视图派生。
4. `ChatPage` 保留为组合容器：路由身份（线程只以地址为准）、运行时装配、面板/附件/项目/模型/审批状态，并把结果装配成视图数据。
5. 页面与视图需要而 barrel 未导出的类型（`AttachmentUpload`、`ThreadRequest`、`QueueRowContext`、`QueueView`、`ConversationMessage`）补进 `features/chat/index.ts`，跨切片只走 public API。

## 替代方案

- 只抽提交 Hook：UI 与编排仍在同一组件，页面仍是多职责集线器，不采用。
- 全部状态并入单一页面 Hook：复制原页面的多职责形态，接口变宽，不采用。
- 提交/生命周期迁入 `features/chat`：页面提交依赖路由、草稿与 UI 状态，跨层迁移动模糊 Owner，不采用。

## 后果

- `chat-page.tsx` 从 1179 行降到 796 行，其中 JSX 装配移到视图；发送/建线程/附件确认只有一处实现。
- 提交 Hook 的注入接口较宽（提交需要线程、草稿、模型、审批、附件、导航与通知），是本次拆分的已知代价；新增提交相关行为只改 `use-chat-submission`。
- 视图不持有业务流程；`steiger` no-public-api-sidestep 由此前 1 error 降为 0。

## 验证

旧能力不存在：页面内联的 `submitMessage` 与 `ensureThreadForAttachments` 双建线程路径已从 `chat-page.tsx` 删除；发送正文只存在于 `use-chat-submission.ts`，页面 JSX 只存在于 `chat-page-view.tsx`，见矩阵第 4 行。
重新引入条件：无；不恢复页面内联提交编排。若提交 Hook 接口继续膨胀，下一步是把「建线程 + 导航 + 项目重置」再收成独立动作，而不是放宽注入参数。

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 页面可观察行为不变：建线程/发送/引导/审批/模型/项目/附件/图片/已读/事件流清理 | 上述任一参数或时序变化 | `web/src/pages/chat/ui/chat-page.tsx` | `vitest run test/unit/pages` 130 例全过（含 61 例对话页用户流程） | 建线程失败保留输入、切线程放弃迟到发送、附件先建线程、引导失败还原输入 | Passed |
| 视图不持有业务流程：无路由/store 读取与网络动作 | 视图内出现 useNavigate、store 选择器或 API 调用 | `web/src/pages/chat/ui/chat-page-view.tsx` | `steiger ./src` 通过（0 error） | 视图 import 深路径被 no-public-api-sidestep 拒绝 | Passed |
| 类型与构建产物可生成 | Hook/视图签名不匹配 | `web/src/pages/chat` | `tsc --noEmit` 通过、`vite build` 通过 | — | Passed |
| 提交与生命周期有聚焦边界，页面容器无发送/附件正文 | 发送正文仍在页面，或两条建线程路径继续分叉 | `web/src/pages/chat/model/use-chat-submission.ts` | `submitMessage` / `confirmAttachments` / `ensureThread` 仅存在于 model Hook | — | Inspected |

## 已知未验证范围

- 全量 `test:unit` 退出码为 1，但 185 文件 / 2105 例全部通过；唯一 error 是 `message-actions.test.tsx` 的 unhandled rejection（antd message mock），在不含本次改动的干净工作区同样出现，属既有问题。
- `lint:check` 剩余 5 error（`file-tree.tsx` / `project-selector.tsx` 未用导入）与 `arch:check` 剩余 1 违规（`thread-title.ts` → generated SDK）为基线既有，本次未触碰。
- 真实浏览器走查与截图未做：本重构不改变 DOM 结构与样式类名，页面测试覆盖交互语义；UI 改动验收按 `docs/develop-guides/design.md` 需要真实页面截图，登记为后续验证项。
