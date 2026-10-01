# 本目录已冻结（本期不维护）

`frontend/` 是迁移前的 React 19 + TypeScript 前端，**不属于当前交付物**。

## 状态

- **不可运行**：它调用的是旧后端的 `/api/v1/*` 契约与统一响应信封，而当前后端为 `/api/*` 且无信封。两者不兼容，任何页面都不会取到数据。
- **不参与门禁**：不在 Taskfile、`.pre-commit-config.yaml`、CI 或 `Makefile` 的任何范围内；其依赖与构建产物不入库（见根 `.gitignore`）。
- **不接收修复**：除前端阶段本身的立项外，不要在此目录提交改动。

## 为什么保留

作为前端阶段重写时的对照参考（旧的信息架构、页面清单、交互细节）。

## 后续

前端阶段已在 [`web/`](../web/) 另行立项：新前端是 React + Vite，信息架构对齐上游实现，计划见[前端 React 迁移设计](../docs/develop-guides/decisions/proposed/2026-10-01-web-react-migration-design.md)。本目录保留到迁移收尾，作为旧信息架构与交互细节的对照参考，届时整体删除。
