# 补齐响应契约：所有返回 JSON 的路由声明响应模型

状态：implemented
类型：architecture
Owner：backend/server/routers/__init__.py

## 问题

前端契约流水线把 `web/openapi.json` 当作唯一事实来源（`web/AGENTS.md` 规定 `api:snapshot` 刷新快照、`api:gen` 生成、`api:check` 在 CI 拦住漂移），而这份快照对多数端点没有字段信息。按门禁同一口径统计 `git show HEAD:web/openapi.json`：256 个 2xx 响应中只有 48 个带真实 schema，208 个是空 schema `{}` 或 `{"type":"object","additionalProperties":true}` 的空壳。空壳来自两类端点：没有声明 `response_model`，或声明的是 `response_model=dict`。这 208 个空壳的去向是 197 个补上具名 schema、11 个改为显式非 JSON（流、文件、重定向），与整改后的 245 + 11 = 256 逐一对齐。

后果落在前端：生成产物只能给出 `unknown`，各 `api/` 段于是手写宽类型加运行时形状校验，`web/ARCHITECTURE.md` 也把「知识库端点因缺 `response_model` 而手写类型」记为现状。响应契约的语义 Owner 实际上被搬到了前端。

补 schema 有两个必须同时守住的语义，都在 api 容器内实测（FastAPI 0.141.1、pydantic 2.13.4）：

- `response_model` 按模型**裁剪**响应体。handler 返回 `{'a': 1, 'b': 2, 'c': {'d': 3}}` 而模型只声明 `a` 时，响应体是 `{'a': 1}`，其余字段静默消失。
- 模型声明了「有时不下发」的字段，会让响应**多出** `null` 键：载荷 `{'a': 1}` 配一个带默认值的可选字段时，响应变成 `{'a': 1, 'maybe': None, 'n': None}`。

## 决策

响应契约的语义 Owner 回到后端。Pydantic 响应模型定义在拥有该响应的 router 文件内（沿用 `dashboard_router.py` 既有的就地定义约定），字段按现实序列化来源（`to_dict()` / `serialize()` / service 返回的 dict）确定；动态字段用 `dict[str, Any]`，顶层模型必须有具名字段。

三条并发约定：

1. 本次转换的路由声明 `response_model`，并同时声明 `response_model_exclude_unset=True`。裁剪只会删字段，而 `exclude_unset` 让响应恰好等于 handler 装配出的键集合，于是"补 schema 不改变响应体"成为可验证的等式，且由该端点的契约用例作为 oracle。
2. 返回流或文件的路由声明 `response_class`（`StreamingResponse`、`FileResponse`、`Response`），让"非 JSON"由路由结构表达，OpenAPI 的 2xx 不再声明 `application/json`。这避免了维护一份会腐烂的豁免名单。
3. 混合形状端点（`workspace /file`、`viewer /file`、`workspace /knowledge/file`、knowledge 的预览与 `export` 等）按主路径声明模型，流分支由 handler 返回 `Response` 实例、FastAPI 直接透传。实测在本版本里给这类端点声明 `response_class=StreamingResponse` 会让返回 dict 的分支被当成迭代体而报错，因此不采用。

两项防护：

- 路由级门禁 `backend/test/unit/routers/test_response_schema_gate.py`：凡声明 `application/json` 的 2xx 响应，schema 必须带字段信息。判定会把 `$ref` 解析到目标模型（指向零字段模型的引用同样没有字段名，不能只看见引用就放行），并把 `additionalProperties: true` 这类形状不受限的 object 判为不可用。迁移期用一份只允许缩小的基线清单 `response_schema_baseline.json` 记录待补路由；补完后基线已删除，门禁现在按严格模式运行，新增端点无法再留空 schema。
- 字段级 oracle `backend/test/support/response_contract.py` 的 `uncovered_paths`：列出载荷有、模型没有的字段路径。每个转换批次配套一个 `test_*_response_contract.py`，断言**响应 JSON 与 handler 载荷完全相等**，一次守住丢字段、多出 null 键与类型强制转换三个方向。既有测试的假载荷因缺真实字段而失败时，修假数据使其对齐真实序列化输出，不放宽模型。

基础 router 的响应模型不导入 `ars.knowledge.*`，LITE 的启动与能力发现不被知识面重运行时绑定。

不统一响应信封：现状三种形状（`{"success": true, "data": ...}`、`{"message": "success", "data": ...}`、裸 dict）按现状逐一建模。统一是破坏 wire 的变更，需要自己的记录与前端同步改动。

## 替代方案

- 只给前端消费的端点补 schema：工作量可控，但契约继续分裂，未消费端点的消费者是仓库外用户与后续开发，仍没有类型可依赖。
- 前端手写类型镜像后端：类型与后端无强制关联，漂移无法被 gate 发现，且要维护 257 个端点的双份事实。参考项目 Yuxi 走的正是这条路（纯 JS、`@returns {Promise<Object>}`、无生成器），它提供不了 schema 来源。
- 自定义 `APIRoute` 或中间件挂中央 schema 注册表：schema 与真实载荷无耦合，字段漂移只能靠人盯，并引入一份可独立编辑的中央清单。
- 用 `response_class=JSONResponse` 配 `openapi_extra` 只写 schema、不改运行时：规避了裁剪风险，代价是 schema 与 handler 实际返回没有强制关联，门禁也查不出遗漏。
- 从真实响应自动推断 schema 再生成模型：oracle 由被测对象自己产生，违反证据规则，且推断出的可选性会掩盖真实契约。
- 统一响应信封后再建模：一次性消灭三种形状，但破坏 wire，前端 193 个端点函数的读取路径要同步改，风险与收益不成比例。
- 按域切分生成的客户端（把快照拆成多份、每份各跑一次生成）：本版本的生成器没有 split 选项，可行做法是 job matrix，`types.gen.ts` 可从 21015 行降到数千行。本地生产构建实测否掉了性能理由：`types.gen.ts` 是纯类型（1664 个 `export type`、零运行时代码），进 bundle 0 字节；`sdk.gen.ts` 编译成 69.0 KB / gzip 19.6 KB 的 `sdk.gen-*.js`，占首屏 gzip 的 2.5%（首屏合计 771.7 KB gzip）；17 个生成文件单独做类型检查只要 0.31 秒，而项目整体 `tsc --noEmit` 是 9.2 秒。切分的收益在可读性与 diff 噪声，代价是每个分片各生成一份 client 与 core、两个脚本与 30 个 import 点都要同步改，因此保留单文件。重新引入条件：单文件导致改一个后端字段就产生难审阅的 diff，或出现生成物相关的类型检查、编辑器索引性能回归。

## 后果

- 245 个 JSON 2xx 响应全部有可用 schema，空壳 0 个；11 个非 JSON 2xx 由 `response_class` 表达。`components.schemas` 从 132 增至 401，快照 826 KB。
- 生成类型从空 schema 的名称占位变成真实字段（`types.gen.ts` 1664 个类型），`slug`、`backend_id` 这类总是出现的字段生成必填属性，`description` 这类可空字段生成 `string | null`。
- 后端单元测试从 1557 增至 1801 通过（新增 244 个，多数是各批次的响应契约用例），0 失败。
- 五类既有测试的假载荷因不被真实序列化覆盖而被补齐（`test_subagent.py`、`test_mcp_router.py`、`test_skill_router.py`、`test_workspace_knowledge_tree.py`、`test_system_router_api.py`），这些假数据的形状从「随手几个键」变成与 `to_dict()`/`serialize()` 一致。
- 前端把 26 个 `api` 段的手写响应类型换成了契约生成类型（`Raw*`／`unwrap<{x?: unknown}>`／`Record<string, unknown>` → 后端声明的具名模型），并修掉这批 api 段里 9 处写着「后端没有 response_model」的失效注释（另顺手订正了三处同源的陈旧说法：`shared/api/result.ts`、`features/chat/lib/agent-state-readers.ts`、`features/chat/api/artifacts-api.ts`）。只替换响应体类型，运行期的形状校验、归一与兜底一律保留；UI 投影形状（驼峰字段、界面取值收窄）与请求体类型不属于响应体，继续手写并有注释说明。改完的集中验证是 `pnpm run check-types` 仍 5 个既有错误、`pnpm run test:unit` 仍 `16 failed | 2503 passed`，即对既有测试零影响——类型在运行期被擦除，且这些段仍是查询层的唯一入口。
- 该批里出现唯一一处运行期值变化：创建 API Key 时原本从 `payload.id` 读 id（后端返回的是 `{api_key, secret}`，所以那一读恒为 undefined、id 恒为 0），换成具名类型后这一行不再通过编译，改为 `payload.api_key.id`。它是被类型替换强制纠正的死读取，且 `id` 没有任何消费者（只有 `secret` 被用），因此不可观测。
- `response_model_exclude_unset=True` 成为新端点的一份额外约定：漏写不会破坏正确性，只会让响应多出 `null` 键，而契约用例会拦住它。
- 残留（本次未处理，属改动前既有状态）：另有 48 个端点在整改前就声明了 `response_model` 而没有 `exclude_unset`（`auth_router` 22、`chat_router` 13、`dashboard_router` 9、`auth_dept_router` 4、`user_router` 3、`knowledge_dashboard_router` 1、`mention_router` 1）。它们会把模型里有默认值的字段以 `null` 下发，并裁掉模型未声明的字段（例如 `read_user` 的载荷不含 `department_name`，响应里却出现 `"department_name": null`，同时 `login_failed_count` 等字段被裁掉）。这些行为在本次改动前后一致，且没有契约用例覆盖，因此不把它们纳入"响应体不变"这一主张；给它们补 `exclude_unset` 会**移除**当前下发的 `null` 键，属于破坏 wire 的变更，需要自己的记录与前端同步核读，不在此批顺手处理。

## 验证

- `docker compose exec -T api sh -c 'cd /app && python -m pytest test/unit -m "not slow" -q -p no:cacheprovider'`：`1801 passed, 40 skipped`，0 失败。改动前该命令是 `1557 passed, 40 skipped`。
- `docker compose exec -T api sh -c 'cd /app && python -m pytest test/unit/routers/test_response_schema_gate.py -q -p no:cacheprovider'`：2 passed。基线文件已删除，门禁按严格模式运行；上一次记录到的缺口数从 208 递减到 0，过程中每个批次都用「当前缺口 ⊆ 旧基线」证明没有新增缺口。
- 负向案例（端点级实测）：从 `AgentItem` 删掉 `metadata` 字段后，`test_agent_router_response_contract.py` 有 3 个用例失败，其中字段守卫报 `['metadata'] == []`；恢复后全部通过。字段守卫另有常驻用例，用窄模型证明 `uncovered_paths` 会报出被漏掉的字段。
- 契约快照与生成物：`pnpm run api:snapshot` 写出 217 路径 / 257 端点；`pnpm run api:gen` 后 `pnpm run api:check` 报「契约生成物一致：17 个文件」。
- 前端：`pnpm run check-types` 剩 5 个既有错误（全部在 `test/unit/features/workspace/workspace-ui.test.tsx`，与本次无关）；`pnpm run test:unit` 为 `16 failed | 2496 passed`，把本次改动的两个前端文件 stash 回 HEAD 后同一命令得到完全相同的 16 failed / 2496 passed，证明本次改动没有新增前端失败。`lint:check` 在本机 Node 20 下无法启动（oxlint 的 JS 配置要求更高版本），未取得结果。
- `python3 scripts/verify_engineering_contracts.py`：通过（109 decisions / 25 routers / 430 web sources）。
- 门禁自身的负向案例：`test_response_schema_gate.py` 里有 `_is_usable` 的常驻用例，证明 `$ref` 指向零字段模型、空 schema、以及 `additionalProperties: true` 的空壳都被判为不可用，而具名模型、类型化 map、数组元素、联合分支与具名标量判为可用。
- 独立 Review（不继承开发上下文）复核了 22 个 router 的模型字段与真实序列化来源的对应关系、用 AST 对比确认所有 handler 函数体与签名与整改前逐字节相同、并抽查了契约用例的 fixture 与断言强度；其提出的三条非阻塞问题（门禁 `$ref` 解析、`uncovered_paths` 的 Mapping 分支与联合语义、本文档的迁移前数字）已在本记录定稿前修掉。
