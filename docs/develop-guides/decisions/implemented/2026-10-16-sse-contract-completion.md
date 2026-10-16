# 三条事件流与字节流端点的响应契约收口

状态：implemented
类型：feature
Owner：backend/server/utils/openapi_sse_schemas.py

## 问题

承接 [`2026-10-16-run-event-stream-contract.md`](./2026-10-16-run-event-stream-contract.md)：那次只把 Run 事件流建模进契约，并留下了四个已知缺口。

1. 另外两条事件流仍在契约之外：`GET /api/agent/requests/{request_id}/events`（排队位置与派发）与 `GET /api/knowledge/databases/{kb_id}/virtual-folders/migrations/{task_id}/events`（迁移进度）。
2. 八个字节流端点在契约里完全没有 `content`（技能包与知识库导出、查看器与工作区下载、文档下载、知识库图片、评估数据集下载），生成类型里是 `unknown`。
3. 响应契约门禁只检查「声明了 `application/json` 的响应」和「声明了 `text/event-stream` 的响应」，因此**整段不声明 `content` 的响应可以静默绕过**——上面两条与那八个端点就是这样长期无契约的。
4. 前端仍用自己的分帧解析器消费 Run 事件流；模型建好之后生成的 `.sse.get` 没有被用上。

## 决策

1. **两条流的载荷按各自真实形状建模**。请求流的载荷是四种字段集不同的裸 dict（排队位置、派发后的 run 与流地址、终态状态、错误），载荷里没有事件名（事件名在 SSE 帧上），因此建模成可选字段的合集而不是判别联合，由 `build_request_event_payload` 在产侧构造。迁移流不带事件名，载荷是 `Task.to_dict()` 去掉 `payload` 后的快照，由 `TaskProgressPayload` 在产侧构造。
2. **字节流端点声明通用字节流**：媒体类型在运行期由导出格式、对象 content type 或请求参数决定，所以声明 `application/octet-stream` 与 `string`/`binary` schema（技能包导出固定 zip、评估数据集导出固定 ndjson，各用固定类型），集中在 `server/utils/response_contracts.py`。前端据此拿到 `Blob` 而不是 `unknown`。
3. **注册器泛化为 `install_sse_event_schemas`**：三条流的载荷模型统一注入 `components.schemas`，注入前检查重名；原 `openapi_run_events.py` 随之更名，因为它已不只服务 Run 事件流。
4. **门禁改为按 HTTP 语义判定**：除 204/205 之外，每个 2xx 都必须在它声明的某一种媒体类型下给出可用 schema。迁移期的基线名单随缺口清零一并删除。
5. **前端接入生成的 `.sse.get`（Run 事件流）**：取流与解析交给生成客户端，**重连与续传游标仍归本应用**。`sseMaxRetryAttempts: 0` **只关掉生成客户端的重试**：它在非 2xx 或连接失败时不抛出，而是回调 `onSseError` 之后结束流，所以断线后仍由既有的「流结束后用 `getRun` 判定权威状态再决定重连或收尾」接手。跨会话游标仍走 `Last-Event-ID` 请求头（生成客户端的 `lastEventId` 只在进程内），新到的 `id:` 由 `onSseEvent` 交回 api 段再转给订阅循环。两个实测得到的坑写在这里：`onSseEvent.id` 是**模块级的粘性值**（没有 `id:` 行的帧会回传上一帧的 id，心跳也会触发回调），因此 api 段只在它变化时才当游标上报，否则那几帧会被误当重复帧跳过；又因为生成客户端在 SSE 路径上不跑响应拦截器，401 的副作用（清凭据并通知应用）只能落在 `onSseError` 里——放到调用方 `try/catch` 或 `.catch` 都是死代码。

## 替代方案

- **给请求流与迁移流的载荷加一个 `event` 字段再建判别联合**：能让前端按判别键收窄，但要改动两条没有出问题的流的线格式，而且前端本来就拿得到帧事件名。合集建模不动线格式。
- **字节流端点声明各自的具体媒体类型**：导出格式与对象 content type 都在运行期决定，写死任一种都会在别的请求上说谎。
- **门禁保留「按媒体类型分别判定」**：那正是缺口的成因——不声明就绕过。按 HTTP 语义判定之后，新增端点无法再靠「不写 content」逃逸。
- **前端把重连也交给生成客户端（用它的 `sseMaxRetryAttempts` 与进程内 `lastEventId`）**：会与本模块已有的重连与跨会话游标形成两个 Owner，且它在重连前不会先用 `getRun` 判定权威状态。
- **前端三条流一起切到生成的客户端**：请求流与迁移流的消费方（`chat-runtime.ts`、知识库 api 段）各有自己的状态机，本轮只切了本项要求的那条；那两条的生成入口已经就绪。

## 后果

- 三条事件流在契约里各有一个 `$ref` 载荷模型，八个字节流端点有了内容类型与 schema；`web/openapi.json` 里不再有「带响应体但无 schema」的 2xx。
- 门禁的旧口径（按媒体类型分别判定 + 迁移期基线名单）被更强的规则取代，基线文件与相关分支一并删除。
- 请求流与迁移流的载荷在产侧经模型构造：字段名写错或漏必填在写事件时就失败。
- Run 事件流的取流与分帧改由生成客户端负责（它与原手写解析器在分帧、心跳、多行 `data:` 上行为一致）；重连、游标与 401 副作用仍在应用侧。
- `shared/lib/files/sse.ts` 的分帧解析器保留：请求流与迁移流的消费方仍用它。

## 验证

- 后端单测 `test/unit -m "not slow"`：1819 passed / 40 skipped / 0 failed。新增 `test/unit/services/test_sse_payload_models.py`（7 条）覆盖请求流四种载荷的字段集、`request_id` 必填、迁移快照去 `payload` 后可构造、以及缺字段时的失败。
- `test/unit/routers/test_response_schema_gate.py`：7 条通过，含三条流的锚点断言（各自的 `$ref` 与媒体类型）与三个负向案例（掏空 schema、整段删掉 `content`、204 无响应体不参与判定）。
- 负向案例实测「恢复缺陷后变红」：去掉 Run 事件流的声明 → 4 条失败（扫描 + 锚点 + 两个精确断言）；去掉工作区下载的声明 → 3 条失败；改回后复绿，脚本以 sha256 校验回滚一致。
- `test/unit/routers/test_knowledge_response_contract.py`：68 passed，其中迁移流的用例新增了对帧形状的断言（`id`/`status`/`type` 就位且 `payload` 不出现），夹具改为 `Task.to_dict()` 的真实形状。
- 契约快照与生成物：`pnpm run api:snapshot && pnpm run api:gen`，`pnpm run api:check` 报「契约生成物一致」；生成物里三条流各有 `.sse.get`。
- 前端：`pnpm run test:unit` 235 文件 / 2538 用例全过（含 `run-stream-terminal-guard` 按新的 api 段契约重写的替身）；`check-types`、`lint:check`、`check:tokens`、`lint:fsd`、`arch:check`、`api:check`、`build` 七项全部通过。
- 未验证：三件都只到后端单测与前端单测这一层，没有在真实 worker 与浏览器里跑过事件流端到端；请求流的四种载荷只有模型级用例，没有路由级或 HTTP 级用例；字节流端点的 schema 只证明契约与生成类型，没有实际下载验证。
