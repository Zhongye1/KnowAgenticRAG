# 对话页的开发期假数据由 vite 中间件按开关提供

状态：proposed
类型：testing
Owner：web/vite.config.ts

## 问题

对话页（`/agent`）的状态分区、产物列表和子智能体列表都只在真实 agent run 产出 `agent_state` 之后才有内容。要核对这一页的视觉与信息密度，必须先跑出一条长对话，成本高且结果不可复现。此前核对只能依赖真实会话，或者临时在浏览器里改请求，两种情况都无法回顾。

## 提案

在仓库里放一份固定的对话页假数据，并只由开发服务器提供：

- `web/mock/chat-mock.ts` 保存假会话列表、消息历史与 `agent_state`（用量、待办、附件/文件、产物、子智能体）。`resolveChatMock(method, url)` 是唯一的匹配入口，返回 `null` 表示不接管。
- `vite.config.ts` 里的 `ars-chat-mock` 插件（`apply: 'serve'`）把该函数挂成**代理之前**的中间件，只接管对话页首屏会读的路径：`/api/chat/threads`、`/api/chat/thread/{id}/history|state|attachments|viewed`、`/api/agent/thread/{id}/active_run|requests`。
- 开关是环境变量 `VITE_CHAT_MOCK`，本机由 `.env.development.local`（被 git 忽略）打开。未开启时插件不注册中间件，请求全部落在真实后端。

假数据只在开发期存在：生产构建不引用 `web/mock/`，`src/` 里也没有任何读取假数据的分支，因此不存在「假数据混进真实列表」的路径。

## 替代方案

- 在 `src/` 的 api 段里按环境变量切换真实/假数据：会把假数据带进生产包的依赖图，并让每个调用点都要判一次环境。
- 浏览器里改请求（DevTools/本地覆盖）：不入库、不可复现，换台机器就没了。
- 直接往 PostgreSQL 里种一条会话：`agent_state` 由 run 与 checkpoint 派生，种数据要么造假要么跑一次真实 run，成本远高于收益。
- 用真实的 `?mock=1` 查询参数判断：对话页进入具体会话时是客户端路由，查询串会被丢掉，开关会在会话中途失效。

## 验收标准

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 开关打开时对话页读到固定的会话列表、消息与 `agent_state` | 中间件排在代理之后，请求仍打到真实后端 | `web/mock/chat-mock.ts` | `curl -s http://127.0.0.1:5174/api/chat/threads` 返回断言中的假会话；`/agent/mock-agentic-rag-review` 页面渲染 | 把 `.env.development.local` 移开后同一 URL 返回后端原文 | Not run |
| 未开启开关时请求全部走真实后端 | 未开启也注册中间件，真实数据被假数据覆盖 | `web/vite.config.ts` | 同上负向命令 | 把开关注释掉后 `/api/system/health` 与 `/api/chat/threads` 均由真实后端应答 | Not run |
| 只接管对话页首屏的读接口，其余端点保持真实 | 中间件匹配过宽，鉴权/模型/智能体接口被吞 | `resolveChatMock` 的路径白名单 | `/api/system/health` 返回 `{"status":"ok",...}`；页面上模型选择器仍显示真实模型 | 未列入白名单的路径返回 `null`，由调用方 `next()` 交回代理 | Not run |
| 前端门禁不回归 | 新文件引入 lint/type 错误 | `web/vite.config.ts` | `pnpm run lint:check`；`pnpm run check-types` | 与改动前的基线逐条一致 | Not run |

## 风险

开发期多一个开关和一份需要跟页面读取口径同步的假数据：`agent_state` 的字段名或状态面板的读取层变化时，`web/mock/chat-mock.ts` 要一起改，否则状态面板会退回空态。插件只挂在 dev server，`web/mock/` 不在 `tsconfig` 的 `include` 内，也不参与 `oxlint`、`arch:check`、`lint:fsd` 的扫描范围。

本提案当前没有实现：`web/mock/chat-mock.ts` 从未提交（`git log --all --diff-filter=A -- 'web/mock/*'` 为空），`web/mock/` 是空目录，`web/vite.config.ts` 里也没有 `ars-chat-mock` 插件。验收矩阵的当前结果因此记为 Not run。实现落库后本记录移入 `implemented/` 并按已实现的事实改写。
