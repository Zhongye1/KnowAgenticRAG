# 生成客户端补默认请求超时，并把失败载荷折成 ApiError

状态：implemented
类型：architecture
Owner：web/src/shared/api/base.ts

## 问题

全站没有任何请求超时。生成客户端没有 `timeout` 配置项（`generated/client/client.gen.ts` 与它的类型里都没有），`base.ts` 里那条把 `TimeoutError` 映射成"请求超时，请重试。"的分支因此是死代码，查询层的 `retry` 又是关的——一个卡住的后端会让界面无限等待，不会自己失败出来。

同时出现第二个前提：契约生成物在 `throwOnError: true` 时抛的是**响应体本身**（`{detail}` 或 `{code, message}`），不是项目的 `ApiError`（抛之前只经过 `interceptors.error.fns`，见 `generated/client/client.gen.ts:206-231`）。生成的全部 React Query options 与 mutation 都带 `throwOnError: true`，因此一旦有调用点改用它们，错误文案就会集体退化成调用方给的兜底文案——`describeFailure` 只在 `error instanceof ApiError` 时取后端文案，全仓有 35 处。

另外，超时与取消由浏览器抛 `DOMException`，它不是 `Error` 子类，原实现按 `detail instanceof Error` 判断会漏掉，浏览器英文 message 会漏进界面。

## 决策

在 `base.ts` 装配两件与生成客户端有关的事，浏览器路径与生成路径共用同一套语义：

1. 请求拦截器注入默认超时 `DEFAULT_TIMEOUT_MS = 120_000`。`Request.signal` 是只读的，因此重建一个 `Request`；调用点显式传了 `signal` 就不覆盖，长耗时端点（模型生成、知识库入库）与需要更短边界的调用点都靠它。注入逻辑抽成具名函数 `applyRequestTimeout(request, options, timeoutMs)`：`Request.signal` 永远存在（浏览器默认给一个不会中止的），"挂没挂上超时"只能靠返回值是否被重建来判断，时长作为参数才能让该判断用毫秒级取值在测试里观察到。
2. 错误拦截器把抛出的载荷折成 `ApiError`：已是 `ApiError` 的原样返回，否则取 `payload.detail ?? error` 交给 `ApiError` 的构造器决定文案。
3. `describeDetail` 的超时/取消识别改为按 `error.name` 而不是 `instanceof Error`，并给取消一句独立文案。

手写入口 `apiFetch` **不设**默认超时：SSE 流与文件下载共用它，全局超时会把合法长连接掐断；需要边界的调用点自己传 `signal`。

## 替代方案

- 默认 30 秒：更早暴露卡死，但会误伤同步的模型生成类端点（`/api/chat/call` 的简单调用、生成描述、示例问题、导图生成），它们合法地超过 30 秒。取 120 秒是"有界"与"不误伤"之间的折中，真正的收紧留给调用点。
- 不设默认超时、只在需要的调用点传 `signal`：没有改善，绝大多数调用点不会有人补。
- 把超时做进 `apiFetch` 并让 SSE 例外：需要按路径维护一份例外名单，且生成路径仍然没有超时。
- 在 `getConfig()` 上挂一个自定义 fetch 包装：多一层间接，收益与拦截器相同而可见性更差。
- 让每个调用点自己 `unwrap` 生成结果（不用生成的 options）：那是保留现状，不是本节要解决的问题；错误折叠的两条路径口径不一致这件事本身要消掉。

## 后果

- 卡住的后端现在最多等 120 秒就会以"请求超时，请重试。"失败，而不是永远挂着。
- 生成路径的失败文案与手写路径一致：`describeFailure` 与各处 `error.message` 不需要按来源分支。
- 默认超时对**所有**生成路径请求生效，包括知识库入库、评估跑批这类可能超过 120 秒的端点。它们目前没有显式传 `signal`，因此被纳入了新边界；这是本节接受的代价，需要更长边界的调用点应显式传。
- `apiFetch` 的调用点（6 个 `api` 段、9 处）仍然没有超时边界。SSE 与下载本来就不该有；表单编码登录那条属于未处理的小缺口。
- 生成客户端的拦截器装配第一次有了直接测试（`test/unit/shared/api-generated-client.test.ts`），此前所有相关用例都 mock 掉 `sdk.gen`，真实客户端从未被驱动过。

## 验证

- `npx vitest run test/unit/shared/api-generated-client.test.ts`：5 passed。前两条直接断言 `applyRequestTimeout`：未传 signal 时重建请求且注入的信号在 20ms 后 abort，显式传 signal 时原样返回同一个 Request。后三条用真实 SDK 驱动错误折叠：409 `{code, message}` 折成 `ApiError` 且文案取自后端、字符串 `detail` 原样作为文案、`TimeoutError` 的 `DOMException` 得到"请求超时，请重试。"。
- 负向案例 1（恢复目标缺陷）：把 `applyRequestTimeout` 改成恒等返回 `request` 后，`未显式传 signal 时重建请求并挂上超时` 失败于 `expect(timed).not.toBe(request)`；其余 4 条仍通过，说明该断言确实只在检测注入。
- 负向案例 2：停用错误拦截器后，3 条折叠断言失败（409 那条取到的是兜底文案而不是后端的 `已有运行中的任务`），超时注入的两条仍通过。
- 最初写的第一版超时断言是恒真的（只断言 `request.signal` 存在且未 aborted），负向案例 2 暴露了这一点：去掉注入后它照样通过。抽出具名函数并改用返回值同一性判断后才成为有效证据。
- `pnpm run check-types`：仍是 5 个既有错误，全在 `test/unit/features/workspace/workspace-ui.test.tsx`，本次新增 0。
- `pnpm run test:unit`：`16 failed | 2501 passed`，失败集合与改前逐条一致（改前为 16 failed | 2496 passed）。
