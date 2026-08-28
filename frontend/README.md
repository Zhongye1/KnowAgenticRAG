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
