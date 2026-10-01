# ARS Web

ARS 前端。React 19 + Vite + TypeScript + Tailwind 4 + shadcn/Radix，信息架构对齐上游实现。

本目录当前是脚手架：工程底座、设计系统、契约流水线、外壳与最小鉴权已就位，业务页面按分片落地（见 `docs/develop-guides/decisions/proposed/2026-10-01-web-react-migration-design.md`）。

## 开发

容器内是默认路径：

```bash
task web:dev      # 起 web 服务（5173），/api 与 /minio 由 vite 代理
task web:logs
```

如果依赖容器已在运行，也可以在宿主机直接跑 `pnpm install && pnpm run dev`。

## 与后端的契约

浏览器只访问同源路径：`/api/*` 与 `/minio/*` 由 vite 代理（开发）或 nginx 转发（生产），因此前端代码里没有后端地址配置。

契约变更的流程：

```bash
pnpm run api:snapshot   # 拉取运行中后端的 openapi.json（入库）
pnpm run api:gen        # 重新生成 src/apis/generated（入库，diff 即契约变更）
```

`pnpm run api:check` 会在 CI 中重新生成并比对，拦住「改了后端却忘记重新生成」的提交。

分层：`src/apis/base.ts` 拥有 client 实例与拦截器（Bearer 注入、401 处理），`src/apis/*.ts` 是手写业务薄层，`src/apis/generated/` 只被这两层引用。

## 检查

```bash
pnpm run check-types
pnpm run lint:check
pnpm run test:unit
pnpm run check:tokens   # 设计 token：禁止硬编码颜色与默认调色板类
pnpm run arch:check     # dependency-cruiser 分层规则
pnpm run api:check      # 契约生成物漂移
pnpm run build
```
