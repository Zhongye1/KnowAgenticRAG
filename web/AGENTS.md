# Web 约定

本目录是 ARS 前端（React 19 + Vite + TypeScript + Tailwind 4 + antd 5）。分层与依赖规则由[本目录架构说明](./ARCHITECTURE.md)拥有；另见根 [AGENTS.md](../AGENTS.md) 与[设计规范](../docs/develop-guides/design.md)。

## 边界

- API 路径只允许出现在 api 段（`src/shared/api` 或各切片的 `api/`）；其他目录不得出现 `/api` 字面量。
- `src/shared/api/generated/` 是契约生成物，只允许 api 段引用，不得手改。
- 契约变更：`pnpm run api:snapshot` 更新快照，`pnpm run api:gen` 重新生成，`pnpm run api:check` 在 CI 拦住漏生成。
- 鉴权只走 `Authorization: Bearer`；后端没有 refresh 端点，401 清除凭据后回登录页。
- 能力降级读 discovery 接口，不得用 404 推断能力：LITE 模式下知识库路由本来就不注册。
- 颜色只用 `src/styles/tokens.css` 的 CSS 变量与语义工具类；不写硬编码颜色，浅色与暗色都检查。

## 验证

```bash
pnpm run lint:check && pnpm run test:unit
pnpm run check:tokens && pnpm run lint:fsd
pnpm run arch:check && pnpm run api:check && pnpm run build
```

UI 改动需在真实页面验证并提供截图。`lint:check`、`test:unit`、`build` 是 CI 契约命令，改名要同步 `.github/workflows/web.yml`。
