# 对话页的直接引导

状态：implemented
类型：feature
Owner：web/src/pages/chat/ui/chat-page.tsx

事实分工：`web/src/features/chat/lib/queue-view.ts` 拥有引导可用性的判定（`canSubmitDirectSteer`）与「队列里是否已有等待执行的引导」（`hasPendingDirectSteer`）；`web/src/features/chat/model/chat-runtime.ts` 拥有发送动作与 `queue_policy` 的传递；`web/src/features/chat/api/agent-api.ts` 拥有请求体；`web/src/pages/chat/ui/chat-page.tsx` 拥有输入、建线程在途状态与入口。

## 问题

参照的 `AgentChatComponent.vue` 允许在运行中把当前输入作为**引导**插队：判定是 `canSubmitSteer`，动作是 `handleSendMessage({ queuePolicy: 'steer' })`，入口是输入区右侧一个「引导」按钮。后端支持这件事：`POST /api/agent/runs` 接受 `queue_policy`，`queue_policy: "steer"` 有 E2E 覆盖（`backend/test/e2e/test_agent_steer_e2e.py`）。

本仓原本缺两处：`sendMessage` 没有 `queuePolicy` 参数，页面也没有入口——`canSend` 要求 `!isStreaming`，运行中发不出任何消息。同一段代码还有一个既有缺陷：`canSend` 不看在途状态，而输入要到建线程成功之后才清空，那次网络往返里的重复点击会建出两条线程并发出两次请求。

## 决策

**`queue_policy` 贯通 `sendMessage`**：`ChatRuntime.sendMessage` 增加可选的 `queuePolicy`（联合类型 `'enqueue' | 'steer'`），透传给契约生成物的 `createRun`；不传时仍由 api 层的默认值落成 `enqueue`。

**判定抽成纯函数**：`canSubmitDirectSteer` 落在 `lib/queue-view.ts`，与 `describeQueueRow` 同一个 Owner。输入项与参照的 `canSubmitSteer` 对应：在流式中、活跃 run 可引导、输入非空、队列里没有等待执行的引导、没有待用户处理的提问；另加一项 `hasAgent`——线程切换期间智能体可能还没解析出来，那时提交会被丢掉，而渲染一个点了没反应的入口比不渲染更糟。

**不搬参照的 2 秒发送冷却**。参照的冷却注释写着它防的是「连续触发停止」——那里的发送按钮兼作停止按钮，连点会先停再发。本仓的停止是独立按钮（`chat-page.tsx` 的「停止」），冷却的动机不成立；而提交一旦通过，输入框在同一个事件里就被清空，`hasInput` 随即为假，没有可重复提交的窗口。参照的六项判定因此在本仓落五项。

**建线程在途单独挡**：`canSend` 增加 `!creatingThread`。真实的失败面是**同一条线程里发出两条请求**，不是建出两条线程——`model/chat-runtime.ts` 的 `createThread` 对同一个智能体有单飞，第二次调用拿到的是同一个 promise。窗口在于输入要到 `createThread` 成功之后才清空，而这段时间发送按钮虽已禁用，输入框的回车不走按钮。

**顺带对齐 `hasPendingDirectSteer`**：参照的口径是「存在 `queue_policy === 'steer'` **且** `status === 'queued'` 的请求」，本仓原先只看 `queue_policy`，已经派发过的引导会一直挡住后续引导。

**引导只带文字**：参照的 `handleDirectSteer` 不传图片，暂存的图片因此既不发出去也不被清掉。本仓同此——引导路径的 `imageContent` 固定为 `null`，`setImage(null)` 在引导时不执行，用户为下一条普通消息暂存的那张图留在槽里。

**入口与失败路径**：按钮放在输入区右侧动作区，文案「引导」、`CornerDownRight` 图标与悬浮说明「当前步骤结束后优先执行这条消息」与参照一致。引导被拒绝时把输入还原（只在仍停在同一线程、且输入框还空着时），与参照的 `queuePolicy === 'steer'` 还原分支同义。

## 替代方案

**照搬参照的 2 秒冷却。** 动机在本仓不成立（见「决策」），而且它会挡掉合法的快速重发：既有用例「建过线程后点新建对话再发送」就是一次立即重发，加了冷却后它必须靠等 2 秒才能通过。

**用「发送在途」布尔量替代冷却。** 语义上更贴切，但本仓的 `sendMessage` 覆盖整段运行（`handleCreatedRequest` await `startRunStream`），在途量在整个运行期间为真，`canSubmitDirectSteer` 会因此永远为假，引导入口不可达。要这样做得先把 `sendMessage` 拆成「提交」与「订阅」两段，属于运行时契约的改动。

**把引导做成队列条上的动作。** 队列条已有的 `steer` 作用于**已排队的请求**（把某条排队请求提前），与「把当前还没发出的输入插队」是两件事，合并会让同一份队列状态出现两个含义不同的入口。

## 后果

- 引导与普通发送共用 `submitMessage`，两条路径各有自己的准入判定（`canSteerNow` 与 `canSend`）。
- `canSend` 多了一项建线程在途判定，用户可感知的变化是：建线程期间发送按钮不可用。此前那段时间按钮可点，但会建出第二条线程。
- 参照的六项判定在本仓落六项，但不是同一组：去掉发送冷却，加上智能体就绪（`hasAgent`）。两处取舍都写在 `canSubmitDirectSteer` 的注释里，免得后来人以为漏了或多了。
- 普通发送失败时不还原输入这条既有差异仍然存在：参照只在引导失败与「运行被中断冲突」两种情况下还原，本仓这一批只补了引导那一种。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 当前结果 |
|---|---|---|---|---|
| 运行中能把当前输入作为引导发出 | 发出的仍是普通排队请求 | `model/chat-runtime.ts` | 真实链路：headless Chrome 在 `/agent` 发一条消息，运行中再输入一条并点「引导」，回读 `GET /api/agent/thread/{id}/requests?agent_slug=default-chatbot` 得到 `queue_policy: "steer"`、`content` 为那条输入、`status: "queued"`、`queue_position: 1`，线程 `queue.status` 为 `running` | Passed |
| `queue_policy` 透传到创建请求 | 参数在运行时被吞掉 | `model/chat-runtime.ts` | `test/unit/features/chat/queue-runtime.test.ts` 的「把 queue_policy 透传给创建请求」与「不传 queuePolicy 时不带引导语义」 | Passed |
| 引导入口只在可引导时出现 | 不可引导时按钮可点，点了没有效果 | `lib/queue-view.ts` | `test/unit/features/chat/queue-view.test.ts` 的 `canSubmitDirectSteer` 六项判定；真实页面在运行中且输入非空时按钮出现，点后输入被清空、按钮随之消失 | Passed |
| 已派发过的引导不再挡住后续引导 | 第二条引导被误挡 | `lib/queue-view.ts` | 同文件的 `hasPendingDirectSteer` 四例（等待中 / 已派发 / 普通排队 / 空） | Passed |
| 建线程在途时不会重复提交 | 同一条线程里发出两条请求 | `pages/chat/ui/chat-page.tsx` | `test/unit/pages/chat-page.test.tsx` 的「建线程在途时按回车不再提交第二条」：断言用户可见结果（`sendMessage` 只被调用一次） | Passed |
| 引导失败时输入不丢 | 失败了输入框空了，用户要重打一遍 | `pages/chat/ui/chat-page.tsx` | 同文件的「引导失败时把输入还原」 | Passed |
| 引导只发文字，暂存的图片留在槽里 | 引导把用户为普通消息暂存的图片一起发走，或顺手清掉 | `pages/chat/ui/chat-page.tsx` | 同文件的「引导只发文字，暂存的图片留在槽里」 | Passed |
| 守卫的负向案例能失败 | 守卫被删后测试仍然全绿 | 上述三个文件 | 八处「改坏 → 用例失败 → 还原」并核对 md5，基线 95 例：`hasPendingDirectSteer` 去掉状态判定（2 例失败）、`canSubmitDirectSteer` 去掉「已有引导」（2 例）、`canSend` 去掉建线程在途（1 例）、`canSubmitDirectSteer` 去掉智能体就绪（1 例）、`sendMessage` 不透传 `queue_policy`（1 例）、引导失败不还原输入（1 例）、引导带上暂存图片（1 例）、引导后清空图片槽（1 例） | Passed |
| 全量门禁 | — | — | `oxlint`（318 文件 0/0）、`tsc`、`check-design-tokens.mjs`、`steiger`、`depcruise`（365 模块 / 1315 依赖）、`vitest`（161 文件 / 1833 例）、`vite build` | Passed |

已知未验证范围：引导的执行时机（「当前步骤结束后优先执行」）由后端决定，验证只证到请求被记成 `steer` 并进入队列，没有等它真正执行完；三套视觉走查（浅色 / 暗色 / 窄屏）与截图归档未做，本批只做了浅色 1440×900 的功能核对；普通发送失败不还原输入这条既有差异未处理。
