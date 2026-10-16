# Run 事件流进入响应契约

状态：implemented
类型：feature
Owner：backend/package/ars/services/run_event_models.py

## 问题

前端消费运行事件流时，事件名与载荷形状都靠约定。契约里这条路由的 200 响应只有一个 `description`，`web/openapi.json` 与生成类型里它是 `unknown`，生成客户端给的是普通 `.get` 调用。

约定漂移的代价在终态上最直接。`end` 事件的 `status` 改名后，前端落进兜底分支，那里 `sawTerminalEvent` 已置真因此不再回查 run，`finalizeRunStream` 不会被调用，界面停在一个没有收尾的运行上而没有信号。2026-10-16 落地的 `warnIfUnknownTerminalStatus` 让这次漂移可见，产侧仍然可以发出契约无法表达的形状。

成因是可查的：`GET /api/agent/runs/{run_id}/events` 用 `response_class=StreamingResponse` 声明，FastAPI 不从它推导媒体类型，所以 2xx 响应没有 `content`；响应契约门禁只检查声明了 `application/json` 的响应，流式响应按构造在它的视野之外。事件流因此成为这份契约里最后一块没人看得见的部分。

## 决策

1. **事件模型由 `ars.services.run_event_models` 拥有**：信封（`schema_version`、`run_id`、`thread_id`、`event`、`created_at`、`request_id`）加六个 wire 事件名的载荷（`metadata`、`messages`、`custom`、`interrupt`、`error`、`end`），`event` 为判别键组成 `RunEvent` 联合。载荷建模到控制字段，`chunk`/`msg`/`stream_event` 保持开放对象并经载荷基类允许额外键。
2. **产侧构造模型**：`run_queue_service.build_run_event_envelope` 按事件名取模型、构造并 `model_dump(exclude_unset=True)`。信封字段全部显式传入因此一定出现，`exclude_unset` 只让 producer 没有赋值的载荷字段保持缺席，输出形状与建模前一致。未知事件名与未知终态在产侧即失败。
3. **终态取值以 `Literal` 表达**，取值与 `AGENT_RUN_TERMINAL_STATUSES` 的一致性由用例守住。
4. **服务自身的失败帧也走同一个信封**：事件流在 run 不存在、DB 不可用、Redis 不可用三处发出的 `error` 帧此前是裸 dict，契约描述不了它们，现在同样经 builder 构造。
5. **紧凑信封只裁剪 payload**：`verbose=false` 时保留 `schema_version`、`run_id`、`thread_id`、`event`、`created_at`，并把载荷里的 `request_id` 提到信封顶层（既有行为）。前端默认 `verbose=false`，这是浏览器实际收到的形状；帧上的事件名与信封上的 `event` 因此恒等（builder 用同一个值生成两者），前端按判别键收窄才成立。信封模型把 `request_id` 声明为可选字段，紧凑帧才满足发布出去的 `RunEvent`——测试用 `TypeAdapter(RunEvent)` 校验真实产出的每一帧。
6. **路由声明 200 为 `text/event-stream` 且 schema 是 `$ref #/components/schemas/RunEvent`**；`server/utils/openapi_run_events.install_run_event_schema` 在 `app.openapi()` 之后把 `TypeAdapter(RunEvent).json_schema(ref_template="#/components/schemas/{model}")` 的 `$defs` 注入 `components.schemas` 并把联合本身注册成 `RunEvent`（注入前检查重名，避免静默覆盖含义不同的模型）。注入后不残留内联 `$defs`：`@hey-api/json-schema-ref-parser` 会把 `#/$defs/X` 按文档根解析，内联定义会让契约生成崩溃。
7. **响应契约门禁扩展到流式响应**：声明了 `text/event-stream` 且给出 schema 的 2xx，其 schema 必须可用（`_is_usable` 本就支持 `oneOf`/`$ref`）。门禁的边界要按实际实现理解：schema 缺失时该响应按「不声明这份契约」跳过，所以**整条声明被删掉不会触发通用扫描**，拦住它的是同文件里的锚点断言 `test_run_events_stream_declares_event_schema`；通用扫描拦的是「声明了流却给出不可用 schema」。
8. **前端只吃类型**：`features/chat/api` 暴露 `RunStreamEvent` 与 `RunEndStatus`，`run-stream.ts` 的 `metadata`/`end`/`error` 三处按判别键收窄，终态集合由生成的字面量类型约束。手写分帧解析、断线重连与 `runLastSeq` 游标归属保持现状。

## 替代方案

- **换用 `fastapi.sse.EventSourceResponse` 并把端点改成真异步生成器**：实测 FastAPI 0.141.1 会把事件模型注册进 `components.schemas` 并写成 `$ref`，后处理能缩到一次搬键（把 `itemSchema.properties.data.contentSchema` 移到 `schema`）；代价是分帧、心跳与 `id:` 的所有权要从 `stream_agent_run_events` 迁给框架，改动贯穿 `run_worker`、`agent_run_service` 与路由。留作后续独立决定。
- **自定义 Pydantic 模型的钩子（`__get_pydantic_core_schema__` 与 `__get_pydantic_json_schema__`）取代后处理**：钩子只在模型被 FastAPI 当字段 walk 时生效，手写 `responses` 的 `content` 从不进入 walk，类对象写进 schema 后会在 `app.openapi()` 的序列化阶段抛 `PydanticSerializationError`。载荷侧也不需要自定义类型，字段都能由标准 `BaseModel` 表达。
- **用 `{"model": RunEvent}` 简写触发组件注册，再用手写 `content` 声明 `text/event-stream`**：实测成员模型确实因此进入 `components.schemas`，但简写同时声明一个路由不会返回的 `application/json`，生成器据此把端点按 JSON 处理并产出 `.get` 而不是 `.sse.get`。另外裸 `$ref` 指向联合别名会悬空：联合别名不是可注册模型。
- **门禁改为要求每个 2xx 都带可用 schema**：更彻底，但会把 10 条完全不声明 `content` 的 2xx 一起卷进来（8 条文件下载与另外两条流），那是文件下载契约的独立议题。现在的规则只拦「声明了流却给不出事件模型」，边界写进了门禁的 docstring。
- **只发布 schema、不校验产出**：模型退化为文档，实际产出继续漂移，本次要修的正是这一点。
- **一次性建模全部 chunk status**：`chunk` 是 LLM 流载荷，字段跨多个 producer 且仍在演进，收益集中在信封与判别键处。

## 后果

- 运行事件流在契约里有了形状，生成客户端从 `.get` 变成 `.sse.get`，`200` 是 `RunEvent` 联合；`@tanstack/react-query` 生成物里该端点的 `QueryKey`/`Options` 随之消失（SSE 端点不该包成 query），仓库内无引用。
- 终态漂移从「前端静默不收尾」变成「产侧构造即失败」。失败被 `_append_run_event_best_effort` 记录并跳过该帧，run 的 PostgreSQL 终态不受影响，前端的 `getRun` 补偿路径仍会收尾。
- `warnIfUnknownTerminalStatus` 保留：它现在防的是部署错配（仍在跑的旧 worker、契约之外的第三方实现），而不是自家产出的漂移。
- **仍有 10 条 2xx 完全不声明 `content`**（文件下载与另外两条流），仍在门禁之外。补齐文件下载契约是独立议题；另外两条流可以复用本次的信封建模方式。
- **联合描述的是本 builder 写出的帧**。`list_run_stream_events` 的归一化分支会把不合规记录补成信封，其中 `event` 取自 Redis 字段、缺省是字面量 `"message"`（不在六个事件名内），`created_at` 为 `null`（模型要求字符串）。这类只可能来自更早版本或外来写入，前端与后端都不会把它们当已知事件处理；契约不覆盖它们，也没有为它们发明第二个形状。
- 本次未接入生成的 `.sse.get`，前端仍用自己的分帧与游标。

## 验证

- `docker compose exec -T api sh -c 'cd /app && python -m pytest test/unit -m "not slow" -q -p no:cacheprovider'`：1819 passed, 40 skipped, 0 failed（建模前基线 1808/40，增量来自新增用例）。注：仓库文档里的 `uv run --group test pytest` 在本机因可编辑安装的 `.pth` 权限失败，改用 `python -m pytest`。
- `test/integration/api/test_agent_run_events_router.py`：1 passed。真实 HTTP 上断言每一帧满足 `event` 信封键与帧事件名恒等、`schema_version == 1`、`run_id` 一致、`created_at` 存在。该用例需要 `TEST_USERNAME`/`TEST_PASSWORD`，本次用临时超管账号运行后清除。它的夹具此前缺 `runtime_scope_id`、`source`、`channel`、`origin_metadata`、`token_usage` 五个 NOT NULL 列，属于与本次改动无关的既有漂移，本次一并补齐。
- 负向案例，逐条实测「恢复缺陷后变红」，改回后复绿：删掉路由响应里的 `$ref` 声明 → 锚点断言 `test_run_events_stream_declares_event_schema` 失败（通用扫描此时按「未声明该媒体类型」跳过，不报错）；把声明留着但把 schema 掏空 → `test_stream_schema_scan_recovers_a_route_without_events` 与通用扫描报出该路由；把 `EndPayload.status` 的 `Literal` 放宽成 `str` → `test_builder_rejects_unknown_terminal_status` 失败；从 `_COMPACT_ENVELOPE_KEYS` 移除 `event` → 紧凑信封用例失败；从信封模型移除 `request_id` → 紧凑用例以 `extra_forbidden: 'req-1'` 失败（证明「紧凑帧必须满足发布出去的 schema」这条断言真的接在产出上）。
- 契约快照与生成物：`pnpm run api:snapshot && pnpm run api:gen`；`pnpm run api:check` 报「契约生成物一致：17 个文件」。
- 前端：`pnpm run test:unit` → 16 failed / 2505 passed，失败文件清单与「回退本次前端改动后」的基线逐条一致（受控回滚 + sha256 校验，未用 `git stash`）。`pnpm run check-types` 仍 5 个既有错误（全在 `test/unit/features/workspace/workspace-ui.test.tsx`）；`lint:check` 在 Node 26 下 3 errors + 31 warnings，全在知识库与 dashboard，本次改动文件零诊断；`arch:check`、`check:tokens`、`lint:fsd` 通过；`pnpm run build` 仍红在既有 tsc 错误，单独执行 `vite build` 通过。
- `python3 scripts/verify_engineering_contracts.py`：通过（113 decisions）。
- ruff 在宿主与容器内都不可用（无该可执行文件，`uv run` 受权限限制）：`Not run`，按 pyproject 的 `line-length = 120` 自行核对行长。
