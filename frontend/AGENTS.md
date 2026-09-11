# AGENTS.md — frontend

> 面向 AI 代理与开发者的前端架构总纲。改动代码前先读「§2 铁律」与「§5 分层与依赖方向」。
> 注意：`docs/frontend/前端架构设计.md` 为过时文档（引用的 app-shell/Jotai/otp-auth 与现状不符），以本文件为准。

## 1. 项目定位

RAG-F 智能知识管理平台前端（包名 `ragf-react-vite`）：React 19 SPA，提供知识库问答（SSE 流式 + 引用标注）、知识库/文档管理、认证与个人空间。与后端 FastAPI 通过 REST + SSE 通信，接口类型由 OpenAPI 自动生成。

## 2. 铁律（违反会被 CI/工具链拦下）

1. **分层依赖由 dependency-cruiser 强制**（`.dependency-cruiser.cjs`），提交前跑 `pnpm arch:check`：禁止循环依赖；feature 之间禁止互引；feature 禁止依赖 `app/` 层；共享层（components/lib/hooks/utils/config/types）禁止依赖 app/features。
2. **`src/generated/` 是代码生成产物，禁止手改**。接口变更先启动后端（8000 端口），跑 `pnpm generate:api` 重新生成；`pnpm generate:api:check` 校验漂移。
3. **样式只用设计令牌**：颜色/间距取自 `src/styles/tokens.css`（Tailwind v4 CSS-first 令牌），禁止硬编码颜色值；`pnpm check:tokens` 强制校验。
4. **lint 用 oxlint**（不是 ESLint）：`pnpm lint`；提交走 husky + lint-staged；格式化 prettier（单引号）。
5. 服务端状态一律走 **TanStack Query**（全局配置 `src/lib/react-query.ts`：retry false、staleTime 60s），不要手写 loading/error 状态机；跨组件 UI 态用 Zustand。
6. 类型检查 `pnpm check-types`（tsc --noEmit）；构建前会先跑 tsc。

## 3. 技术栈与选型

| 类别       | 选型                                                                | 说明                                                                                                                  |
| ---------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 框架       | React 19.2 + TypeScript                                             | 包管理 pnpm                                                                                                           |
| 构建       | Vite 8（rolldown 内核），端口 5000                                  | **React Compiler 已开启**（`vite.config.ts: react({ compiler: true })`，编译期自动 memoization，勿手写 useMemo 滥用） |
| UI         | shadcn/ui（radix-lyra 风格）+ Radix 原语                            | `components.json` 注册了 `@assistant-ui` registry；图标 Phosphor + Lucide                                             |
| CSS        | Tailwind CSS v4（CSS-first）                                        | 设计令牌 `src/styles/tokens.css` + tw-animate-css                                                                     |
| 服务端状态 | TanStack Query 5                                                    | queryKey/queryFn 与 generated hook 配套                                                                               |
| 全局状态   | Zustand 4                                                           | 通知、聊天 run-store、当前知识库（localStorage 持久化）                                                               |
| 路由       | react-router v7                                                     | `createBrowserRouter` + 每路由 `lazy()` + `clientLoader`（queryClient 注入）                                          |
| 表单       | react-hook-form + zod                                               | resolver 统一 `@hookform/resolvers`                                                                                   |
| 聊天       | @assistant-ui/react 0.15 + assistant-stream                         | 无头运行时，UI 全由 primitives 组合                                                                                   |
| 请求       | axios（REST）+ 原生 fetch（SSE）                                    | EventSource 不支持 POST/自定义头，故 SSE 用 fetch                                                                     |
| 测试       | Vitest 4 + Testing Library + MSW 2；Playwright（e2e）               | e2e 配独立 MSW mock-server（pm2）                                                                                     |
| 工具链     | oxlint + prettier + husky + dependency-cruiser + plop + Storybook 8 | 无 ESLint/Jest                                                                                                        |

## 4. 目录结构

```text
frontend/
├── vite.config.ts           # React Compiler、端口 5000、vitest 配置
├── .dependency-cruiser.cjs  # 分层依赖规则（架构即代码）
├── components.json          # shadcn 配置（含 assistant-ui registry）
├── scripts/
│   ├── generate-api.mjs     # OpenAPI → src/generated 代码生成管道
│   └── check-design-tokens.mjs
├── generators/ + plopfile.cjs   # plop 组件脚手架（pnpm generate）
├── e2e/ + playwright.config.ts + __mocks__/ + mock-server.ts
└── src/
    ├── app/                 # 组装层：index.tsx（入口）、provider.tsx（QueryClient/Helmet/
    │                        #   ErrorBoundary/Notifications）、router.tsx（路由表 + loader 注入）、
    │                        #   routes/（每页一个文件，全部 lazy）
    ├── features/            # 业务功能切片（互不依赖）：auth、chat、knowledge、users、
    │                        #   teams、comments、discussions、home；每切片自含
    │                        #   api/（React Query 薄封装）、components/、hooks/、stores/、lib/
    ├── components/          # 跨 feature 共享 UI：ui/（shadcn 基元 30+）、layouts/、
    │                        #   AppSidebar/、Navbars/、assistant-ui/elements/（.aui.tsx 聊天元素 kit）、
    │                        #   errors/、seo/
    ├── lib/                 # 核心基础设施：api-client.ts（axios + Bearer + 401 单飞刷新）、
    │                        #   auth.tsx（react-query-auth + ProtectedRoute）、authorization.tsx（RBAC 策略）、
    │                        #   react-query.ts（全局 queryConfig）、utils.ts（cn）
    ├── generated/           # OpenAPI 产物（勿手改）：types.ts + 每端点一个模块
    │                        #   = axios 函数 + queryOptions + useXxx hook
    ├── hooks/               # 通用 hooks（use-disclosure、use-mobile、use-debounced-value…）
    ├── config/              # env.ts（zod 校验 VITE_APP_*，含 API_URL）、paths.ts（路由路径唯一登记处）
    ├── styles/              # tokens.css 设计令牌（check:tokens 守护）
    ├── testing/             # MSW handlers、test-utils
    ├── types/
    ├── utils/
    └── assets/
```

## 5. 分层与依赖方向

```text
app/（组装：Provider 树 + Router + 页面路由）
  ↓
features/（业务切片：auth / chat / knowledge / users / teams / …）
  ↓
共享层（components / lib / hooks / generated / config / utils）
```

- 依赖只能向下，由 dependency-cruiser 强制；共享能力下沉到共享层，feature 之间需要复用时先下沉再引用。
- 全部 8 个 feature（含 `chat`）都在 `.dependency-cruiser.cjs` 的 `FEATURES` 守护列表内，**新增 feature 时同步把名字加进该数组**。
- `generated/` 是叶子节点：feature 的 `api/` 只做薄封装（默认参数、缓存失效、派生 hook），不重写请求逻辑。

## 6. 关键链路

**流式问答（SSE）**：`ChatRuntimeProvider`（`features/chat/lib/chat-runtime.tsx`，挂在 `/app` 根，侧边栏「最近对话」与聊天页共享同一 runtime）→ 每线程 `useLocalRuntime(chatAdapter)` → `chat-adapter.ts` 用 fetch POST `/api/v1/knowledge_bases/{kbName}/chat/stream`，`d25-sse.ts` 手工解析事件行协议（`step` / `meta` / `citation` / `delta` / `usage` / `done` / `error`，`: ping` 保活）→ delta 累积后以全量文本 yield（assistant-ui 要求累计态），`meta/citation/usage` 写入 zustand run-store（按 messageId，上限 100 条）→ `answer-markdown.tsx` 把正文 `[n]` 标注替换为引用角标，`message-sources.tsx` 渲染参考来源。**无 WebSocket**；文档摄取状态用轮询（`use-document-polling`，指数退避 10s→30s）。会话标题由 `chat-thread-list-adapter.ts` 覆写 `generateTitle`（取首条用户消息）。

**认证**：`lib/auth.tsx` 的 `configureAuth`（userFn/loginFn/logoutFn/registerFn）+ `ProtectedRoute` 包裹 `/app`；token 存 localStorage，`api-client.ts` 请求拦截器注入 Bearer，401 触发**单飞刷新**（独立 raw axios 实例 POST `/api/v1/auth/refresh`，避免递归）后重试一次；RBAC 策略对象在 `lib/authorization.tsx`（POLICIES）。

**接口代码生成**：后端起在 8000 → `pnpm generate:api` → `scripts/generate-api.mjs` 拉 `/openapi` → 生成 `src/generated/types.ts` + `src/generated/<feature>/<operation>.ts`（每端点 = axios 函数 + queryOptions + hook，含后端 ApiResponse/PageData 泛型解析）。

## 7. 设计模式与代表落点

| 模式                     | 落点                                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 适配器                   | `features/chat/lib/chat-adapter.ts`（D25 SSE → assistant-ui `ChatModelAdapter`）；`chat-thread-list-adapter.ts`；`attachment-adapter.ts`                                          |
| Headless 原语组合        | 聊天 UI 全用 `ThreadPrimitive`/`MessagePrimitive`/`ComposerPrimitive` 等（`chat-thread.tsx`）；shadcn 模式（Radix + CVA + cn）贯穿 `components/ui/`                               |
| Context 注册式注入       | 模型选择器经 assistant-ui **ModelContext** 注册（`model-selector.tsx` 的 `RegisterModelContext`），chat-adapter 在 run 时读取 `config.modelName/reasoningEffort`——UI 与网络层解耦 |
| 运行时提升（Provider）   | `ChatRuntimeProvider` 挂 `/app` 根；跨页「新建对话」意图经 router state（`location.state.newThread`）传递                                                                         |
| 单一数据流 store         | Zustand：`notifications-store`（React 外用 `useNotifications.getState()` 弹错）、`chat-run-store`、`chat-settings-store`                                                          |
| IDL 优先                 | `generated/` 产物 + feature api 薄封装（见 §6 代码生成链路）                                                                                                                      |
| 架构即代码               | dependency-cruiser 分层规则 + design-tokens 校验 + husky/lint-staged                                                                                                              |
| 状态机 hook / 可注入替身 | `features/auth/hooks/use-qr-login.ts`（loading→ready→scanned→confirmed/expired）；`use-document-polling` 的 `poll` 参数可注入                                                     |
| React Compiler 约定      | runtime hook 需传函数值处用 `"use no memo"` 跳过编译（`chat-runtime.tsx`）                                                                                                        |

## 8. 开发约定（新增代码怎么放）

- **新增页面**：路径先登记进 `src/config/paths.ts` → `src/app/routes/` 建路由文件（`lazy()`）→ 组件放 feature 内；受保护页面包在 `ProtectedRoute` 下（`/app` 子树）。
- **对接新后端端点**：跑 `pnpm generate:api` 生成 → feature 的 `api/` 加薄封装（默认参数、queryKey 失效）→ 组件用 `useQuery`/`useMutation`；不要在组件里直接写 axios 调用。
- **请求与错误**：统一走 `lib/api-client.ts`；错误通知由拦截器弹 zustand 通知，匿名探测接口用 `skipAuthErrorHandling`。
- **组件**：优先用 `components/ui/` 已有 shadcn 基元；新组件可用 `pnpm generate`（plop）脚手架；样式只写 Tailwind 令牌类。
- **MSW**：新端点同步在 `src/testing/mocks/handlers/` 补 handler，e2e 才能跑。
- **SEO**：页面元信息用 `AppHead`（react-helmet-async）；错误边界用 react-error-boundary。

## 9. 常用命令

```bash
pnpm install                 # 或仓库根 task install
pnpm dev                     # Vite 开发服务器（端口 5000）；仓库根 task dev 一键起全栈
pnpm build                   # tsc && vite build
pnpm test                    # Vitest；pnpm test-e2e = mock-server + Playwright
pnpm lint / lint:fix         # oxlint
pnpm check-types             # tsc --noEmit
pnpm arch:check              # dependency-cruiser 分层规则
pnpm check:tokens            # 设计令牌校验
pnpm generate:api            # 重新生成接口代码（后端需运行在 8000）
pnpm generate                # plop 组件脚手架
pnpm storybook               # Storybook 8（端口 6006）
```

环境变量：`VITE_APP_*`，经 `src/config/env.ts` zod 校验（缺失/非法启动即报错）。

## 10. 已知债务与文档索引

- `docs/frontend/前端架构设计.md` 过时（app-shell/Jotai/otp-auth 与现状不符），不要按它改代码。
- `/app/agents`、`/app/overview` 为占位页（PagePlaceholder）。
- 前端整体设计背景可参考 `docs/specs/2026-09-02-frontend-backend-architecture-spec.md`。
