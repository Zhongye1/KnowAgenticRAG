# 第三方镜像许可证边界与版本锁定

状态：proposed
类型：process
Owner：docker-compose.yml

## 问题

Compose 拓扑默认引入 Neo4j 社区版（GPL-3.0-only）与对象存储（AGPL-3.0）镜像，而仓库又通过 `docker/save_docker_images.*` 与 `scripts/init.*` 拉取并导出这些镜像，ARS 本体是 MIT。缺少书面边界时，部署者与再分发者无法判断 GPL/AGPL 义务是否触发，商业部署也没有可依赖的合规入口（#873）。同时 `neo4j:5.26` 是浮动 minor 标签，撰写本记录时已指向 5.26.29；`redis:7-alpine` 同样浮动，当前已指向包含安全修复的 7.4.10，且 Redis 自 7.4 起许可证由 BSD-3-Clause 变更为 RSALv2/SSPLv1（非 OSI）。浮动引用意味着部署取得的版本和许可证取决于拉取时间。

## 提案

保留 Neo4j 社区版与对象存储作为独立进程依赖，ARS 后端仅通过 bolt 与 S3 API 通信（进程间聚合），MIT 代码不构成衍生作品。对象存储的具体镜像由[对象存储改用 Silo 承接 MinIO 兼容面](../implemented/2026-10-12-object-storage-silo-replacement.md)拥有，本记录只承接其许可证边界。把主要组件许可证、镜像内其他软件的独立许可、再分发义务和商业替代选项写入 [deployment.md](../../../advanced/deployment.md) 的「第三方组件与许可证」章节，README 许可证节指向该章节。所有 Neo4j 镜像引用（两个 Compose 文件与四个拉取/导出脚本）统一锁定 `neo4j:5.26.29`，避免把已经跟随浮动标签升级的持久数据卷降回 5.26.28；Redis 镜像引用（两个 Compose 文件与两个 init 脚本）统一锁定 `redis:7.4.10-alpine`，保留该版本包含的安全修复。后续补丁升级必须显式修改对应引用。

## 替代方案

- 替换为宽松许可证存储：对象存储同时服务 ARS 与 Milvus standalone，替换属于架构级变更，由[对象存储改用 Silo 承接 MinIO 兼容面](../implemented/2026-10-12-object-storage-silo-replacement.md)承接；图数据库替换不在本记录范围。
- 默认使用 Neo4j Enterprise / AIStor 商业订阅：需要商业协议与凭据，不应成为开源默认值，仅作为文档中的商业选项。
- 移除 `save_docker_images` 分发脚本：切断离线部署能力，代价大于收益；改为在文档中明确分发义务。
- 锁定镜像 digest 而非版本 tag：可复现性最强，但可读性差且无法表达补丁升级意图，作为后续可选强化。
- 引入 CI 依赖与许可证审计：由独立事项（#870）承接。

## 验收标准

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| Neo4j 锁到当前浮动标签对应的 5.26.29，不让既有数据卷进入不受支持的降级路径 | 仍锁 5.26.28，使已拉取 5.26.29 的部署在重建时降级 | `docker-compose.yml` | Docker Official Images 的 Neo4j 清单；`docker buildx imagetools inspect neo4j:5.26.29` | 恢复 5.26.28 后，版本比较必须拒绝该回退 | Inspected |
| Redis 锁到包含 7.4.10 安全修复的版本 | 陈旧本地 tag 令验收错误选择 7.4.9，重新暴露已修复的 `RESTORE` 内存安全问题 | `docker-compose.yml` | Redis 7.4.10 release；Docker Official Images 的 Redis 清单；`docker buildx imagetools inspect redis:7.4.10-alpine` | 恢复 7.4.9 后，版本检查必须拒绝缺少安全修复的镜像 | Inspected |
| 全部 Neo4j 与 Redis shipping 引用保持一致 | Compose、初始化或离线导出脚本仍拉取旧版本 | `docker-compose.yml` 与对应脚本 | 精确搜索四类引用；`docker compose config -q`（dev/prod） | 在任一脚本恢复旧版本后，残留搜索必须检出 | Passed |
| 许可证文档覆盖完整镜像与 GPL/AGPL 第 6 节再分发路径 | 把完整镜像统称为宽松许可证，或让离线交付者误以为普通上游链接总能满足源码义务 | `docs/advanced/deployment.md` | 对照 GNU GPLv3/AGPLv3 第 6 节、精确组件许可证与实际 Compose/导出清单 | 恢复“其余镜像均为宽松许可证”或“上游源码链接即可”后，语义 Review 必须拒绝 | Inspected |
| 文档构建与工程契约检查不回归 | 决策生命周期、相对链接或文档构建失效 | `docs/` 与工程契约脚本 | docs `pnpm build`；`python3 scripts/verify_engineering_contracts.py`；`python3 -m unittest scripts.test_verify_engineering_contracts` | 删除 proposed 的六字段矩阵后，工程契约检查必须失败 | Passed |

## 风险

精确补丁升级从隐式浮动变为显式提交评审，安全补丁需要主动修改 Neo4j 6 处与 Redis 4 处引用。GPL/AGPL 组件保持未修改使用；若后续修改这些组件、以其构建衍生镜像或改为进程内集成，本提案的边界不再适用，需重新评估。许可证章节只提供工程侧整理，不替代法务判断。
