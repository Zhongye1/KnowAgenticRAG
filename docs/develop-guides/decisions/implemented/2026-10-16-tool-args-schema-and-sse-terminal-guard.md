# 工具参数下发完整 JSON Schema，事件流终态漂移改为显式告警

状态：implemented
类型：feature
Owner：backend/server/routers/tool_router.py

## 问题

两处「契约表达不了的形状」各有一个具体缺口。

**工具参数**：元数据只下发拍平后的 `args`（名称/类型/描述），没有必填、枚举与嵌套结构。LLM 生成的工具参数（`tool_calls[].args`）与前端读它的代码之间因此没有任何形状约束，而中继这层信息的契约也表示不了它——`args_schema` 是运行期数据，不是 OpenAPI 类型图里的东西。

**SSE 事件流**：后端用 `format_sse` 拼裸 dict，`text/event-stream` 不进 OpenAPI，前端处理的事件名全靠约定。`end` 事件的 `status` 一旦改名，代码会落进兜底分支——那里 `sawTerminalEvent` 已置真（不会再回查 run），但 `finalizeRunStream` 不会被调用，界面停在一个没有收尾的运行上却没有任何信号。这是本次最值得修的一处：失败是静默的。

本记录写作时事件流还没有契约表达；**后续由 [`2026-10-16-run-event-stream-contract.md`](./2026-10-16-run-event-stream-contract.md) 取代了这一部分**：Run 事件流现在有 `RunEvent` 联合、终态取值在产侧按 `Literal` 校验，下面第 2 条决定的 `warnIfUnknownTerminalStatus` 因此改为防部署错配（仍在跑的旧 worker、契约之外的第三方实现）。工具参数那部分仍由本记录拥有。

## 决策

1. **工具元数据增加 `args_schema`**：`_extract_tool_info` 把工具自身的参数声明统一折成 JSON Schema 后原样透传，不在后端做二次翻译（工具自己声明的 schema 就是事实，翻译一次只多一处漂移点）；`tool_router.ToolItem` 声明 `args_schema: dict[str, Any]`。拍平后的 `args` 保留，界面的一行说明继续用它。折法覆盖三种真实形态：pydantic 模型（`model_json_schema`）、v1 风格的 `.schema()`、裸 dict；都没声明时给空对象。
2. **SSE 终态守卫**：`run-stream.ts` 的 `end` 兜底分支在收尾前调用 `warnIfUnknownTerminalStatus(status)`，未知或缺失的 status 给一条 `console.warn`。**只告警不抛错**——事件流要前向兼容，后端新增一个状态名不该让整条流断掉，所以这里的目标是"让漂移可见"，不是"拒绝未知输入"。事件流进入契约后这条守卫保留，防的是部署错配。

两条决定的分工：第 1 条由 `server/routers/tool_router.py` 拥有（工具元数据与它的响应契约），第 2 条由 `web/src/features/chat/model/run-stream.ts` 拥有（终态判定与收尾都在那里）；本记录的 Owner 字段只指前者。

## 替代方案

- **给工具参数生成或手写 zod schema**：`args_schema` 是每个工具自己声明的运行期数据，不在 OpenAPI 类型图里，生成物给不出它；手写则会成为第二份事实源（快照 + 逐字段读取 + 手写 schema），而它的所有权在工具定义处。要对运行期数据做校验只能选一个 JSON Schema 校验器，那是独立决定，且新依赖要过供应链门禁。
- **把 15 个事件建进 OpenAPI**：`text/event-stream` 的载荷目前没有可依赖的表达方式，生成器也不会为它产出类型。正路是后端为事件建模型、并让 event builder 构造模型（否则模型与真实产出继续漂移）——那是一次跨多个 service 的后端改造，不在本次范围。
- **前端手写事件的 discriminated union**：形状所有权在后端 builder，前端手写会立刻漂移，且漂移没有信号（`api:check` 管不到）。
- **把 JSON Schema 子集校验接进 `tool-call-row`**：`features/chat` 目前完全不依赖 `entities/tool`，而且没有任何测试渲染该组件——接进去等于新增一处无测试的跨切片耦合，违反"每个新守卫都要有一个能恢复目标缺陷的负向测试"。这一条是本次刻意不做的部分，落点见后果。

## 后果

- 工具参数的必填与默认值现在可见（用例守住"真实工具里至少一个声明了 `required`"，即这个字段不是字段名的复述）；UI 与调用方首次有依据判断必填。
- 契约快照与生成类型随之给 `ToolItem` 增加 `args_schema`（生成类型里表现为 `{[key: string]: unknown}`），`pnpm run api:check` 一致。
- `end` 事件的 status 仍走原来的兜底分支，行为未变；终态漂移从静默变成一条告警。
- **工具参数的运行期校验没有接**。接它需要先在渲染路径上有测试（或换一个已测试的落点），再决定校验器是"依赖自由的 JSON Schema 子集"还是引入一个校验库（后者要过依赖供应链门禁）。

## 验证

- `docker compose exec -T api sh -c 'cd /app && python -m pytest test/unit -m "not slow" -q -p no:cacheprovider'`：1808 passed, 40 skipped, 0 failed。
- `test/unit/routers/test_system_and_provider_response_contract.py`：`_json_schema_of` 的三种声明形态各断言一次（含 `required` 保留）；真实工具集逐个断言 `args_schema` 是对象、带参工具都有 `properties`、且至少一个带 `required`。
- `test/unit/services/test_tool_service.py`：既有用例的全量字典断言补上新键；新增用例断言声明了参数的工具同时给出 `args` 与完整 `args_schema`（含 `default` 与 `required`）。
- `npx vitest run test/unit/features/chat/run-stream-terminal-guard.test.ts`：2 passed。只桩掉发起请求那一层，驱动真实 SSE 帧（`id:` + `event: end` + `data:`），断言未知终态告警、已知终态不告警。
- 负向案例（事件流）：去掉 `warnIfUnknownTerminalStatus(terminalStatus)` 这行调用后，`未知终态告警并带上原值` 失败于 `expected "warn" to be called 1 times, but got 0 times`；恢复后通过。这一条同时证明守卫真的接在 `end` 的兜底分支上，而不只是函数本身可用。
- 前端门禁：`pnpm run check-types` 仍 5 个既有错误（全在 `test/unit/features/workspace/workspace-ui.test.tsx`）；`pnpm run test:unit` 仍 `16 failed | 2505 passed`，失败集合与改动前逐条一致，新增 2 条来自新用例。`pnpm run api:check` 报"契约生成物一致：17 个文件"。`lint:check` 与 `arch:check` 在本机 Node 20 下仍无法运行（依赖要求 Node ≥22）。
