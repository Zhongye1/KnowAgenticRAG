# Alembic 迁移版本（占位）

当前项目**未上线**，数据库建表由应用启动时的 `create_all` 负责（`task backend:init-db` 可手动执行），
本目录仅作占位，**不维护真实迁移脚本**。

上线前需要：

1. 生成首个基线：`alembic revision --autogenerate -m "init"`（对既有库执行 `alembic stamp head` 打基线）
2. 部署流程切换为 `alembic upgrade head`，并评估是否停用启动时 `create_all`

> 命令需在 `backend/` 目录下使用项目 venv 执行（如 `../backend/.venv/bin/alembic`），并依赖 `backend/src/.env`。

详见 `docs/工程治理/数据库层设计.md` 第 4 节。
