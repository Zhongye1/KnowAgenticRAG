# 对象存储改用 Silo 承接 MinIO 兼容面

状态：implemented
类型：architecture
Owner：docker-compose.yml

## 问题

上游 `minio/minio` 服务端已归档停维：仓库 `archived: true`，最后推送 2026-04-24，README 声明不再维护，社区版改为仅源码分发、不再提供预编译二进制与镜像，官方替代方向是闭源的 AIStor。Compose 锁定的 `minio/minio:RELEASE.2023-03-20T20-16-18Z` 因此永久停在 2023 年，无法取得任何安全修复；`scripts/init.*` 与 `docker/save_docker_images.*` 还依赖该冻结 tag 的 Docker Hub 分发，离线安装链路会随 tag 消失而断裂。

许可证不是本次变更的驱动因素。`minio/minio` 仍为 AGPL-3.0，后端只经 S3 API 与其通信的进程间聚合判断继续成立，[第三方镜像许可证边界](../proposed/2026-08-17-thirdparty-image-license-boundary.md)记录的 AGPL 义务分析不变。

## 决策

对象存储服务改用 [pgsty/silo](https://github.com/pgsty/silo)，即 Pigsty 社区维护的 MinIO 分支，许可证 AGPL-3.0，镜像锁定 `pgsty/silo:RELEASE.2026-09-16T00-00-00Z`。Silo 保留 S3 协议、`.minio.sys` 数据格式、`/minio/*` 路由与 `MINIO_*` 环境变量，是本仓库耦合面上改动最小的替代品。

`docker-compose.yml` 与 `docker-compose.prod.yml` 保留 `minio` 服务名、`MINIO_URI`、`MINIO_ACCESS_KEY`、`MINIO_SECRET_KEY`、`minio://` URL scheme、`/minio/...` HTTP 路径与 `MinIOClient` 等标识符。原因是两条既有契约：`/minio/public/...` 是前端与已存解析 Markdown 图片链接的公开 URL，`minio://` 是 PostgreSQL 中 `knowledge_files` 与附件记录已持久化的引用格式。保留服务名还让 `Taskfile.yml` 与两个 CI workflow 中按服务名调用的 `docker compose up ... minio ...` 无需改动。公开的 Silo 用例 `CandoImage/ddev-silo` 在 `docker-compose.silo.yaml` 中额外保留一个 `minio` 兼容服务，供 `service: minio` 的调用方继续工作，与该取舍一致。服务端环境变量名改为 Silo 文档规定的 `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`，取值仍来自 `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`，应用侧、Milvus 与 `.env` 配置无需改动。

对象存储与 Milvus 共用同一实例。Milvus 只经 S3 API 访问，`MINIO_ADDRESS` 与凭据引用保持不变。

## 替代方案

- 维持冻结镜像：拒绝。归档上游不再产生安全修复，离线分发又依赖可能消失的旧 tag。
- 自行从源码构建社区版 MinIO：拒绝。上游已归档，自建只解决镜像分发，不恢复维护。
- 换用宽松许可证的 S3 兼容服务端（RustFS、SeaweedFS，均 Apache-2.0）：拒绝进入本次范围。它们需要另行处理健康检查、端口假设、bucket policy 与数据搬迁，而许可证在本项目不是驱动因素。S3 API 是稳定边界，`parse_minio_url` 解析时忽略 host，将来切换不推翻本决策的其它部分。
- 官方 AIStor Free：拒绝。免费但闭源，与保留可审计开源实现冲突。
- 知识库文件改走 POSIX 并移除对象存储：拒绝进入本次范围。需要迁移 `knowledge_files.minio_url`/`path` 数据契约，且 Milvus standalone 仍要求 S3 兼容存储（`common.storageType: remote`）。

## 后果

对象存储恢复安全补丁与镜像分发，代价是依赖 Pigsty 单一组织的维护承诺与 1–2 个月的发布节奏，许可证仍为 AGPL-3.0。

Silo 是下游分支，没有可继承的上游安全修复，其发布可能滞后于 main 分支的安全变更。镜像因此必须锁精确 release tag，升级前先读 release notes；官方禁用原地自更新，升级方式就是替换 tag。

Silo 镜像把 `HOME=/tmp` 写入镜像环境，其 `dockerscripts/docker-entrypoint.sh` 还会在 `HOME` 为空或等于 `/root` 时再次强制改为 `/tmp`；Silo 文档称配置目录由 `HOME` 决定。旧镜像使用的 `/root/.minio` 因此不再被读取，两个 Compose 文件移除了该挂载：保留一个无人读取的卷会让运维误以为证书与配置在那里生效。配置目录随之落在容器可写层，不跨重建存活；启用 TLS 前必须按 Silo 文档把证书目录固定到持久路径并实测确认。

生产 Compose 的服务端 root 凭据来自 Compose 变量插值，api/worker 的凭据来自 `env_file`。两者必须解析到同一份文件，否则对象存储认证失败；`docs/advanced/deployment.md` 的生产启动命令当前未带 `--env-file .env.prod`，这是本次变更前已存在的问题，不在本记录范围内修复。

本项目使用的 `minio-py` 是上游 Python SDK（Apache-2.0，仍在维护），不属于 Silo 声明的受支持组合（`pgsty/silo` + `pgsty/silo-console` + `pgsty/mc`），官方对未修改的上游客户端只承诺 best effort。

旧能力不存在：两个 Compose 文件与四个镜像清单脚本中不再存在 `minio/minio` 镜像引用；两个 Compose 文件不再向服务端传入 `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`，也不再挂载 `/root/.minio`。

## 验证

| 验证项 | 命令 | 结果 |
|---|---|---|
| 镜像与 release tag 真实存在且可拉取 | `docker pull pgsty/silo:RELEASE.2026-09-16T00-00-00Z`；`api.github.com/repos/pgsty/silo/releases` | Passed |
| 服务端镜像、`command` 与 argv 形式正确 | 镜像 `Config.Entrypoint=["/usr/bin/docker-entrypoint.sh"]`、`Cmd=["silo"]` 及其 `server) set -- silo "$@"` 分支；`docker compose up -d minio` 后 9 秒 healthy | Passed |
| 两个 Compose 文件可解析 | `docker compose -f docker-compose.yml config -q`；prod 用一次性 `.env.prod` 执行同一命令 | Passed |
| 应用侧凭据与服务端凭据取值一致 | `MINIO_ACCESS_KEY=probe_user MINIO_SECRET_KEY=probe_secret docker compose -f docker-compose.prod.yml config`，核对 `minio`、`api`、`worker` 三个服务的渲染结果 | Passed |
| 全栈 dev 起得来且对象存储参与主链路 | `docker compose up -d` 后 10 个服务 healthy；`GET /api/system/ready` 返回 200；`storage-migrator` 退出码 0 | Passed |
| `public` 桶策略与私有桶边界 | 应用写入后匿名 GET `public` 对象返回 200 且内容一致；`knowledgebases` 匿名 GET 返回 403 | Passed |
| 应用写入与回读对象存储 | `POST /api/user/upload-image` 返回 `/minio/public/images/<uid>/<uuid>.png`，经 vite `/minio/public/` 代理匿名取回字节一致；知识库上传对象在 Silo 中 `mc cat` 字节一致 | Passed |
| Milvus 经 S3 API 使用 Silo | `docker logs milvus` 中 `remote chunk manager init success` 与 `endpoint=minio:9000 bucket_name=a-bucket` | Passed |
| 旧 MinIO 数据卷格式兼容 | Silo 直接读取旧镜像写入的 `.minio.sys`、`a-bucket`、`kb-images`、`knowledgebases` 及其对象 | Passed |
| 镜像引用无残留 | `grep -n 'minio/minio\|RELEASE\.2023-03-20' docker-compose.yml docker-compose.prod.yml scripts/init.sh scripts/init.ps1 docker/save_docker_images.sh docker/save_docker_images.ps1`（无输出；决策记录需要指名被替换的旧镜像，不在搜索范围） | Passed |
| 决策记录与文档契约不回归 | `python3 scripts/verify_engineering_contracts.py`；`python3 -m unittest scripts.test_verify_engineering_contracts`；`git diff --check` | Passed |
| 负向案例：恢复旧镜像引用必须被检出 | 把任一镜像清单改回 `minio/minio:RELEASE.2023-03-20T20-16-18Z` 后重跑上面那条搜索 | Inspected |

未运行：`backend/test/integration` 与后端 unit。`backend/.venv` 的 python 符号链接指向另一台机器的路径，已失效，宿主 Python 为 3.14.7，与项目要求的 3.13 及依赖不匹配。文档构建也未执行：`docs/node_modules/vue` 缺失且 pnpm store 所在文件系统只读；本次只做词句替换，未增删链接或标题。
