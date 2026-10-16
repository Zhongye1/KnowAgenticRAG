# 智能体切片改用契约生成的查询 options（试点）

状态：implemented
类型：architecture
Owner：web/src/entities/agent/api/agents-api.ts

## 问题

前端两套并行实现同一件事：各切片的 `model/*-queries.ts` 手写 query key 与 queryFn，而契约生成物里已经备好每个端点的 `...QueryKey` 与 `...Options`（411 个导出、10150 行），全仓零引用。手写的 key 与端点的真实参数靠人保持一致，改一个查询参数就要同时改 key 与失效点。

同时上一节把生成客户端的默认超时与错误折叠装配好了（[生成客户端补默认请求超时](2026-10-16-web-request-timeout-and-error-folding.md)），生成 options 依赖的 `throwOnError` 错误形态已经能折成 `ApiError`，具备接入前提。

## 决策

先在一个切片上量出真实成本，再决定是否铺开。智能体切片是最小可行试点：两个 query、三个 mutation、一个失效入口。

- query key 与 queryFn 交给生成 options：`api/agents-api.ts` 导出 `agentsListOptions(includeSubagents)`、`agentBackendsListOptions()` 与失效用的 `agentsListKey()`，`model/agent-queries.ts` 只负责展开 options 并加 `select` 归一。
- 生成物的接触点留在 api 段：`arch:check` 的 `generated-import-boundary` 只豁免 `shared/api` 与含 `/api/` 的路径，`model/` 引用生成物会违反该规则。
- `agentsListKey()` 是函数而不是模块级常量：生成 key 会读客户端的 `baseUrl`，在模块顶层求值可能早于 `base.ts` 的装配，固化成一个匹配不上真实缓存的键。
- 写入仍走 api 段的 `createAgent`/`updateAgent`/`removeAgent`：生成的 `...Mutation` 只省掉一次 `unwrap`，却要求每个调用点把实参改成 `{ body }` 形状，不划算。
- 列表读取不再经 api 段包装，因此这两个端点的错误折叠只由上一节的错误拦截器负责。

## 替代方案

- 让组件直接用生成 options（官方示例的形态）：省掉 model 段这一层，但 `model/` 的归一（`toAgents`）与 hook 的返回形状（`isLoading`/`isFetching`/`refetch`）无处安放，且违反生成物边界规则。
- mutation 也改用生成的 `...Mutation`：见决策，收益低于调用点的改造面。
- 保留手写 key，只把 queryFn 换成生成物：两种 key 并存，缓存条目与失效点仍要各写一遍，等于没解决。
- 一次性铺开到 31 个 model 文件：在量出单切片成本之前就动全仓，风险与认知负担都不划算。

## 后果

- 源码净减 16 行（4 个文件 +49/−65）：删掉两个 request 函数与三个 key 常量（`agentsQueryKey`、`AGENTS_QUERY_ROOT`、`agentBackendsQueryKey`）及其切片再导出，新增 api 段的三个导出与 `select`。
- 查询参数与缓存条目不再可能漂移：参数写在 options 里，同时进入 key 与 queryFn（生成物的 `queryFn` 从 `queryKey[0]` 取回参数）。
- 失效语义从"领域根 key"变为"操作名前缀"：`invalidateQueries` 的部分匹配用 `_id` 命中该操作的全部参数变体。生成物默认不填 `tags`，因此按领域整体失效要逐个列出操作名。
- 试点暴露的一处不一致：`select` 归 observer 层，`queryClient.fetchQuery` 不套用它，只有挂载的 hook 才观察得到。这决定了断言必须走 `renderHook`。
- 查询 options 只在智能体切片落地。全仓铺开试过一次（知识库切片 + 技能/MCP/供应商/任务/调试），**已整体回退**：集中跑测试得 `210 failed | 2309 passed`（基线 `16 failed | 2503 passed`）。原因是各切片的组件测试 mock 的是 **api 段对象**（知识库目录里对 `knowledge-api` 14 处、`evaluation-api` 5 处、`graph-api` 4 处、`mindmap-api` 2 处），而生成 options 的 `queryFn` 绕过 api 段直接调 `sdk.gen`，这些桩全部失效；智能体切片之所以没暴露这一点，是因为它的测试本来就 mock `sdk.gen`。铺开的正确处理形状因此是：**key 用生成物、queryFn 仍走 api 段**（`queryFn: () => unwrap(await api.xxx(params))`），这样既消除 key 与参数的漂移，又保住 api 段这个接缝（错误折叠、测试桩点），代价是每个 hook 只换 key。这一形状尚未实施。

## 验证

- `pnpm run check-types`：仍是 5 个既有错误，全在 `test/unit/features/workspace/workspace-ui.test.tsx`，本次新增 0。
- `pnpm run test:unit`：`16 failed | 2503 passed`，失败集合与改前逐条一致（改前 16 failed | 2501 passed），新增 2 条来自新用例。
- `npx vitest run test/unit/entities/agent/agent-queries.test.tsx`：2 passed。一条用 `renderHook` 断言 `useAgents` 仍把响应体归一成领域对象；一条在 `QueryClient` 上种两份列表缓存与一条无关缓存，断言 `invalidateQueries({ queryKey: agentsListKey() })` 把该操作的两份都标为失效、且不动无关 key。
- 负向案例 1：把 `agentsListKey` 退回 `['agents']` 后，失效那条失败（`listInvalidated` 不再是 `[true, true]`）。
- 负向案例 2：去掉 `useAgents` 里的 `select` 后，归一那条失败。
- `npx vitest run test/unit/features/agents test/unit/pages/agent-manage-page.test.tsx`：45 passed。管理面板用例 mock 的是 `sdk.gen` 并让 api 段、归一与查询层真实跑一遍，因此覆盖了"生成 options 与既有 mock 桩法兼容"这一点。
- 边界：`pnpm run arch:check` 在本机 Node 20 下无法启动（dependency-cruiser 要求 Node ≥22），因此生成物边界是按 `.dependency-cruiser.cjs` 的规则配置人工核对——`src/entities/agent/model/` 已不再引用生成物，全部生成物接触点集中在 `api/agents-api.ts`。
