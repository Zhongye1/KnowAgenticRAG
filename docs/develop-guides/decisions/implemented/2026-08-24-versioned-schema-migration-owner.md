# 数据库 Schema 迁移 Owner 与轻量版本契约

状态：implemented
类型：architecture
Owner：backend/package/ars/storage_migration.py

`storage-migrator` 执行数据库 Schema 变更，`PostgresManager` 持久化版本并提供只读兼容校验；API 与 worker 只消费已经完成迁移的 Schema。

## 问题

API 与 worker 在启动时执行建表和 `ensure_*_schema`，多个运行进程可能并发执行相同 DDL。破坏性 SQL 会在每次启动时重复检查，数据库也没有可回读的 ARS Schema 版本事实。现有 `storage-migrator` 已经是 Compose 启动门禁，但需要独占 Schema 迁移。

## 决策

现有 `storage-migrator` 是 shipping 拓扑唯一的 ARS Schema 修改者，不新增迁移服务或框架。迁移器持有 PostgreSQL session advisory lock，创建 `ars_schema_migrations` 版本表，并分别记录 `business` 与 `knowledge` 域。未版本化的受支持 legacy baseline 执行当前幂等建表与收敛 SQL；LangGraph checkpoint setup 完成后才记录 business 版本。当前版本重复运行跳过该域的 Schema DDL，未知非零版本明确失败。

LITE 只迁移并要求 business 域，不创建或要求 knowledge schema；完整模式迁移并要求两个域。API 与 worker 不执行建表、Schema 收敛或 checkpoint setup，只校验所需域等于当前程序版本；版本表或域缺失、过旧或过新时拒绝启动。Compose 继续使用 `service_completed_successfully` 阻止迁移失败后的运行进程启动。

版本表只表达已完成的 ARS Schema revision，不承诺自动回滚。破坏性变更必须继续声明数据影响、保持升级幂等并通过真实 PostgreSQL 验证；后续 Schema 变更提升对应域版本并实现受支持的相邻升级路径。

## 替代方案

- 引入 Alembic 和独立 `db-migrator`：当前没有复杂迁移分支需求，会新增依赖、配置和第二个部署服务；拒绝。
- 只把 DDL 移到迁移器但不记录版本：不能避免每次启动重复执行破坏性收敛，也不能让运行进程校验兼容性；拒绝。
- 保留 API 或 worker 的兜底建表：会重新形成多个 Schema Owner，并让错误部署静默修改数据库；拒绝。
- 要求所有迁移支持 downgrade：数据删除和约束收紧无法形成可信无损回滚；采用发布前备份、幂等升级和明确数据影响。

## 后果

- API 与 worker 启动不再竞争 DDL 锁；迁移错误集中在 `storage-migrator`，失败会阻止运行服务启动。
- 当前版本正常重启不再重复执行 ARS Schema 收敛 SQL。
- 裸进程启动前必须先运行迁移器；缺失或不兼容版本形成明确启动错误。
- 首次接入时，没有版本记录的已知 legacy/current 数据库执行现有幂等收敛后建立 baseline；现有 Workdir 中间 Schema 检测继续 fail-closed。
- 版本记录与历史文件迁移不是单一数据库事务。中断时版本不推进，Schema SQL和文件迁移依靠既有幂等边界重跑。

## 验证

- `docker compose exec -T api uv run --no-sync --no-dev pytest test/unit -m 'not slow' -q`：1515 passed，40 skipped。
- `docker compose exec -T api uv run --no-sync --no-dev pytest test/integration/services/test_schema_migration_version.py -q`：2 passed，真实 PostgreSQL 覆盖 session advisory lock 单赢家、版本缺失/错误拒绝和正确版本回读。
- `docker compose exec -T api uv run --no-sync --no-dev pytest test/integration/services/test_api_key_schema_migration.py -q`：1 passed，既有破坏性业务 Schema 升级保持幂等和数据约束。
- 完整模式 shipping Compose 首次运行迁移器后回读 `business=1`、`knowledge=1` 与 checkpoint 表；重建 API/worker 后两者 health 为 healthy，`/api/system/ready` 返回 ready。第二次迁移器运行没有 business、knowledge 或 checkpoint Schema DDL 日志。
- 临时空 PostgreSQL 数据库以 `LITE_MODE=true` 运行同一 shipping `storage-migrator`：只回读 `business=1`，`knowledge_bases` 不存在；临时数据库随后删除。
- `python3 scripts/verify_engineering_contracts.py` 与 `python3 -m unittest scripts.test_verify_engineering_contracts`：通过，61 tests passed；真实 Schema oracle 已接入 `system-tests.yml`。
