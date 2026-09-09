# React Vite Application

## Get Started

Prerequisites:

- Node 22+
- pnpm

To set up the app execute the following commands.

```bash
git clone https://github.com/alan2207/bulletproof-react.git
cd bulletproof-react
cd apps/react-vite
cp .env.example .env
pnpm install
```

##### `pnpm dev`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

##### `pnpm build`

Builds the app for production to the `dist` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

See the section about [deployment](https://vitejs.dev/guide/static-deploy) for more information.

## Code Quality

- **Lint**: [oxlint](https://oxc.rs) — config in `.oxlintrc.json` (replaces ESLint).
- **Format**: Prettier — config in `.prettierrc`.

```bash
pnpm lint          # oxlint 检查
pnpm lint:fix      # oxlint 自动修复
pnpm format        # prettier 写入格式化
pnpm format:check  # prettier 检查（CI）
pnpm check-types   # tsc 类型检查
```

## 设计 Token（Arco Design）

所有设计变量统一维护在 `src/styles/tokens.css`（Light `:root` + Dark `.dark`），
通过 Tailwind 工具类引用，禁止在业务代码中硬编码颜色或使用 Tailwind 默认调色板。

```bash
pnpm check:tokens   # 校验：禁止 #hex / rgb() / 默认调色板类（bg-white、text-gray-500 等）
```

常用工具类：

- 语义色：`primary/success/warning/danger/link-1..7`（如 `bg-primary-6`、`text-danger-6`）
- 图表色：`data-1..20`；文字/背景/边框/填充：`text-color-text-1..4`、`bg-color-bg-1..5`、`border-color-border-1..4`、`bg-color-fill-1..4`
- 基础黑白：`text-color-white`、`bg-color-black`（支持透明度：`bg-color-white/10`）
- 字号：`text-body-3`、`text-title-2`、`text-display-1` 等；字重：`font-weight-500` 等
- 尺寸：`w-size-4`、`h-size-8`、`p-size-2`（`size-1..50`，值为 4×N px）
- 圆角：`rounded-small/medium/large/circle`；阴影：`shadow-special`、`shadow-1-center`、`shadow-2-center`、`shadow-3-center`
