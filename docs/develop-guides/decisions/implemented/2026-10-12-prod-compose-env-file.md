# 生产 Compose 命令显式指定环境文件

状态：implemented
类型：bug-fix
Owner：docs/advanced/deployment.md

## 问题

`docker-compose.prod.yml` 用 `${VAR:?...}` 声明必填变量，Compose 在变量插值阶段解析它们。插值来源由 `--env-file` 决定，默认是项目目录的 `.env`；服务级 `env_file: .env.prod` 只把变量注入容器，不参与插值。

`docs/advanced/deployment.md` 的生产启动、重建与排障命令没有带 `--env-file .env.prod`。在不含 `.env` 的机器上，这些命令直接因必填变量缺失而拒绝启动，报错却指向 `.env.prod` 中的变量名；在同时存在 `.env` 的机器上，命令会静默采用开发环境的凭据，使对象存储等服务端凭据与应用侧凭据来自两份不同文件。`README.md` 的同类命令一直带该参数，两个页面对同一操作给出不一致的命令。

## 决策

`docs/advanced/deployment.md` 中所有针对 `docker-compose.prod.yml` 的 `docker compose` 命令统一补上 `--env-file .env.prod`，与 `README.md` 以及生产 Compose 的必填变量声明保持一致。迁移脚本 `scripts/migrate-storage.sh` 的命令原本已带该参数。

## 替代方案

- 取消生产 Compose 的必填变量声明，改为容器内校验：拒绝。失败点会从 Compose 解析推迟到容器运行期，错误更难定位，并削弱“配置缺失时拒绝启动”的现有约束。
- 让生产部署直接使用 `.env`：拒绝。生产与开发共用一份环境文件会混淆两套拓扑的凭据与端口，文档明确要求生产使用 `.env.prod`。
- 只依赖 Compose 的 `env_file` 而省略命令行参数：拒绝。`env_file` 不参与插值，无法解决必填变量解析失败。

## 后果

生产运维命令变长，但启动、重建与排障三条路径的变量来源一致，不再取决于机器上是否存在 `.env`。运维若改用其他环境文件名，必须同步替换 `--env-file` 的参数。

## 验证

| 验证项 | 命令 | 结果 |
|---|---|---|
| 只存在 `.env.prod` 时，不带参数的命令确实失败 | 在仅含 `docker-compose.prod.yml` 与 `.env.prod` 的临时目录执行 `docker compose -f docker-compose.prod.yml config -q` | Passed |
| 同一目录补上参数后通过 | 同一临时目录执行 `docker compose -f docker-compose.prod.yml --env-file .env.prod config -q` | Passed |
| 文档内生产命令全部携带该参数 | `grep -n 'docker compose -f docker-compose.prod.yml' docs/advanced/deployment.md`，逐行确认 | Passed |
| 与 README 的同类命令一致 | 对 `README.md` 执行同一检查 | Passed |
| 负向案例：删掉任一行的参数必须被检出 | 从任一命令移除 `--env-file .env.prod` 后，用 `grep ... \| grep -v -- '--env-file'` 复查 | Inspected |
