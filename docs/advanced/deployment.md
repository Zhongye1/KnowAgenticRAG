# 生产部署指南

本文档介绍如何在生产环境中部署 ARS。

## 前置要求

- Docker Engine (v24.0+)
- Docker Compose (v2.20+)
- NVIDIA Container Toolkit（如需使用 GPU 服务）

::: warning 注意事项
1. 生产环境和开发环境建议使用不同的机器，避免端口和资源冲突
2. 虽然名为「生产环境」，但这只是基本配置，真正上线需要根据实际情况调整
3. 前端有调试面板（长按侧边栏触发），生产环境建议关闭
:::

## 部署步骤

### 1. 准备配置文件

为避免与开发环境冲突，生产环境建议使用 `.env.prod` 文件：

```bash
cp .env.template .env.prod
```

编辑 `.env.prod`，设置强密码和必要的 API 密钥：

```sh
POSTGRES_PASSWORD=
NEO4J_PASSWORD=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
JWT_SECRET_KEY=
API_KEY_DERIVATION_SECRET=
ARS_INSTANCE_ID=
SANDBOX_PROVISIONER_TOKEN=
SILICONFLOW_API_KEY=
```

生产 Compose 会在前八项配置缺失或为空时拒绝启动，并提示具体变量名。`JWT_SECRET_KEY`、`API_KEY_DERIVATION_SECRET` 和 `SANDBOX_PROVISIONER_TOKEN` 均应至少使用 32 字节随机值并持久保存，可分别使用 `openssl rand -hex 32` 生成；三者不能复用，API/worker startup 也会执行该独立性检查。初始化脚本会拒绝短值和复用值，Linux/macOS 下把 `.env` 权限收紧为 `600`。`API_KEY_DERIVATION_SECRET` 决定幂等 API Key 的安全重放，升级时必须在重建 API/worker 前生成，之后轮换会使既有创建请求无法重放原 secret。`ARS_INSTANCE_ID` 应是每套部署稳定且唯一的实例标识。模型 API 密钥按实际使用的供应商配置。

### 2. 启动服务

从 v0.7.1 升级前，先停止业务写入，并在同一停机时点完整备份 PostgreSQL、MinIO 和 `docker/volumes/ars`，验证三者可以成套恢复。迁移会重写历史 Conversation 的 Project 绑定、附件路径与 thread 文件布局，终结非终态 Run，并收紧持久目录所有权；旧 SQLite checkpoint 不迁移。v0.7.2 Beta 不建议用于重要或缺少可恢复备份的环境，完整风险见[版本变更记录](../develop-guides/changelog.md#v072beta1-2026-08-23)。

使用生产环境配置文件启动。升级实例必须先检出目标版本，再运行迁移脚本；迁移成功前不要启动新 API 或 worker：

```bash
# 从 v0.7.1 文件布局升级时先执行；运行中、已 stop 或已 down 均可
bash scripts/migrate-storage.sh -f docker-compose.prod.yml --env-file .env.prod

# 仅启动核心服务（CPU 模式）
docker compose -f docker-compose.prod.yml up -d --build

# 启动所有服务（包含 GPU OCR）
docker compose -f docker-compose.prod.yml --profile all up -d --build
```

迁移脚本会把其后的参数原样用于每一次 Docker Compose 调用，因此迁移和重启必须使用同一份 Compose 文件、env file 与 profile。脚本只在 API/worker 已停止、provisioner 已禁止新建 Sandbox，且 Docker 容器或 Kubernetes Pod 的权威清单确认为空后签发一次性 proof；枚举失败或 Pod 仍在 Terminating 都会 fail-closed。

迁移按 Workdir、系统配置、共享 Skill 和运行身份分阶段提交，不是跨 PostgreSQL、MinIO 与文件卷的单事务操作。命令失败后保持 API/worker 停止并保留日志；目标冲突或权限问题修复后，使用完全相同的参数重跑迁移，迁移器会校验已经提交的确定性目标并继续。需要放弃升级时，先保持服务停止并检出 v0.7.1，再从升级前同一停机时点的备份成套恢复 PostgreSQL、MinIO 和 `docker/volumes/ars`；只恢复数据库或单个文件卷会造成跨 Owner 状态不一致。

历史知识库 Markdown 中指向 `public` bucket 的图片不会由该脚本迁移，升级后旧 URL 仍可能匿名可读。对敏感知识库应在升级后重新解析生成私有 `kb-images` 对象，确认新 Markdown 与权限代理可用后，再按实际对象清单清理旧公开图片。

### Kubernetes 存储边界

当前双 PVC contract 面向后续新部署：operator 预先创建 `USER_DATA_PVC` 与 `SKILLS_PVC`，其中
User Data 的存储类必须支持部署所需的共享读写语义。仓库没有拥有具体集群的 StorageClass、PVC 大小、Secret 或完整
API/worker Deployment manifest，因此不会自动创建、复制或删除 PVC；真实目标集群 smoke 完成前，
不能把 Pod spec unit 当作已上线证明。

历史 `THREAD_PVC` 的目录形状与新 `shared/<uid>/workspace/projects/<workdir-id>` 不同，不能只通过改变量名
完成升级。当前不提供旧 Kubernetes 部署的自动原地迁移；需要保留旧卷并由
operator 离线导出、校验后导入新布局。Compose 的 `scripts/migrate-storage.sh` 只拥有 Compose 文件域，
不能冒充 Kubernetes PVC migrator。

### 3. 验证部署

- Web 访问：http://localhost（直接通过 80 端口）
- API 进程存活：`curl http://localhost/api/system/health`
- API 接流量就绪（启动完成、PostgreSQL/Redis 可用且兼容 worker 正在续租）：`curl http://localhost/api/system/ready`

`/api/system/ready` 只证明核心运行依赖满足接流量条件，不替代登录、对话、知识库或 Agent Run 的真实业务链路验收。

公开头像和 Agent 图片通过前端同源路径 `/minio/public/...` 读取，由 Nginx 只读代理到 MinIO 的 `public` bucket。无需也不应向公网开放 MinIO 的 `9000` 对象 API 或 `9001` 管理控制台；知识库等私有 bucket 不经过这个代理。需要使用独立静态资源域名时，可在 `.env.prod` 中设置 `MINIO_PUBLIC_URL=https://assets.example.com`，并在该域名侧保持同等的只读 bucket 限制。

历史 PDF 解析 Markdown 中已经写入的 `http://localhost:9000/public/...` 或其他 `<host>:9000/public/...` 图片地址，会在前端渲染时自动转换为同源路径，不需要重新解析 PDF。

## 跨域（CORS）配置

`docker-compose.prod.yml` 默认把 `ARS_ENV` 设为 `production`，后端在该环境下会按 `ARS_CORS_ORIGINS` 显式声明允许的来源。**未配置时返回空列表，浏览器跨域请求会被拒绝**。生产部署前请根据前端与 API 的相对位置选择策略：

| 部署形态 | 推荐配置 |
|----------|----------|
| 前端与 API 同源（Nginx 同端口反代） | 不需要设置，留空即可 |
| 前端与 API 跨域部署 | `ARS_CORS_ORIGINS=https://your-frontend.example.com` |
| 多个前端域名 | 逗号分隔，如 `https://a.example.com,https://b.example.com` |
| 完全放开（不推荐） | `ARS_CORS_ORIGINS=*`，会自动关闭 credentials，登录态/JWT 无法跨域携带 |

开发环境（`ARS_ENV=development` 且未设置该变量）默认允许 `http://localhost:5173` 与 `http://127.0.0.1:5173`，方便本地前后端独立启动调试。从 0.7.0 升级到 0.7.1 时，如果此前是跨域部署但未显式声明来源，必须补上 `ARS_CORS_ORIGINS`，否则前端跨域请求会被拒绝。

## 维护与更新

### 从使用默认凭据的版本升级

如果部署曾使用仓库历史默认的 PostgreSQL、Neo4j 或 MinIO 凭据，升级 Compose 文件本身不会保证已有数据卷中的服务凭据已经改变。升级前应分别通过对应服务的管理命令真实修改凭据，再把新值写入 `.env.prod`；完成后重建相关服务，并使用旧凭据验证登录已被拒绝。

PostgreSQL 可以在数据库容器内使用交互式命令修改，避免新密码出现在 shell 历史和进程参数中：

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -d ars -c '\password postgres'
```

Neo4j 应使用 `cypher-shell` 的当前用户密码修改流程；MinIO 应使用 `mc admin` 或部署所采用的密钥管理流程。不要把真实密码写入文档、测试脚本或命令历史。完成凭据轮换并分别配置 `API_KEY_DERIVATION_SECRET`、`SANDBOX_PROVISIONER_TOKEN` 后，再执行下面的重建命令。

### 更新代码

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker compose -f docker-compose.prod.yml up -d --build
```

### 重建 Redis 后重启 worker

arq worker 在 Redis 断连后不会自动重连。重建或升级 Redis 容器后，需重启 worker 才能恢复 `/api/system/ready`：

```bash
docker compose -f docker-compose.prod.yml up -d redis
docker compose -f docker-compose.prod.yml restart worker
```

生产 Compose 不再向宿主机发布 PostgreSQL 和文档解析服务端口。确需从宿主机维护时，优先使用 `docker compose exec`；不要为了临时调试把这些端口重新暴露到公网。

### 查看日志

```bash
# API 日志
docker logs -f api-prod

# Nginx 访问日志
docker logs -f web-prod
```

## 第三方组件与许可证

ARS 本体采用 MIT 许可证，但 Compose 引入的第三方组件保留各自原始许可证。当前拓扑下，ARS 后端与这些组件均为独立进程，分别通过 bolt（Neo4j）、S3 API（MinIO）与原生协议（PostgreSQL、Redis、Milvus）通信，属于进程间聚合（mere aggregation），ARS 的 MIT 代码不构成 GPL/AGPL 意义下的衍生作品。

| 组件 | 镜像 | 许可证 | 在 ARS 中的角色 |
|------|------------------|--------|------------------|
| Neo4j Community | `neo4j:5.26.29` | GPL-3.0-only | 知识图谱存储（`graph` 服务） |
| MinIO | `minio/minio:RELEASE.2023-03-20T20-16-18Z` | AGPL-3.0 | ARS 对象存储（头像、Agent 图片、知识库文件）与 Milvus 存储依赖 |
| Milvus | `milvusdb/milvus:v2.5.6` | Apache-2.0 | 向量检索 |
| etcd | `quay.io/coreos/etcd:v3.5.5` | Apache-2.0 | Milvus 元数据 |
| PostgreSQL | `postgres:16` | PostgreSQL License | 业务主库 |
| Redis | `redis:7.4.10-alpine` | RSALv2/SSPLv1（非 OSI；7.2 及更早为 BSD-3-Clause） | 投递、短期事件与缓存 |

其中 Neo4j、MinIO、Milvus、etcd 与 Redis 已锁定精确版本；PostgreSQL 仍为浮动 tag，可按部署需要自行固定。上表只说明主要应用组件本体的许可证，不代表完整容器镜像内的基础系统与依赖包均为宽松许可证；离线再分发前需按实际镜像核对软件物料清单、许可证声明与对应源码义务。

Redis 7.4 起采用 RSALv2/SSPLv1 双许可（均非 OSI）：自托管使用、修改与再分发（无论是否修改）均被允许。两条路径的差异在于托管服务——RSALv2 不得把 Redis 本身作为托管服务对外提供；SSPLv1 允许托管，条件是开源整个服务管理栈。自托管 Compose 部署通常按 RSALv2 路径理解即可。

### 再分发与托管义务

以下情形会触发相应组件许可证的额外义务：

1. **再分发镜像**：`docker/save_docker_images.sh` / `save_docker_images.ps1` 把镜像导出为 tar 交付给第三方时，构成对 GPL/AGPL 软件的再分发。除保留 tag/digest、许可证文本和原始声明外，还需按 GPLv3/AGPLv3 第 6 节选择与交付方式匹配的源码路径：通过物理介质交付时随附机器可读的完整对应源码，或附带对任何持有目标代码者有效的书面源码要约；要约至少有效三年，并在仍为该产品型号提供备件或客户支持期间持续有效，承诺按不高于合理物理交付成本提供源码介质或免费网络下载。通过指定网络位置提供镜像时，以同等方式且不额外收费地提供精确对应源码。源码可由不同的第三方服务器托管，但再分发者仍须在镜像下载位置旁提供清晰指引，并确保源码在所需期限内持续可用。
2. **修改 AGPL 组件**：修改 MinIO 并对外提供网络服务时，需按 AGPL-3.0 向用户提供修改后的对应源码；未修改的上游版本仅在网络中运行时不触发第 13 节的修改源码提供义务，但再分发其镜像仍须遵守上一项的第 6 节要求。仓库内 `docker/mineru.Dockerfile` 构建的 MinerU 自 3.1.0 起采用以 Apache-2.0 为基础的 MinerU 开源许可（含规模化商用门槛与归属标注条款），以其 Dockerfile 内锁定版本的注释为准。
3. **进程内集成**：把 GPL/AGPL 组件以进程内链接方式并入自有代码会触发传染条款。ARS 架构不做进程内集成，二次开发也不要引入。

### 商业部署

- **Neo4j**：需要企业版功能或商业支持时，可改用 `neo4j:5.26-enterprise` 镜像并设置 `NEO4J_ACCEPT_LICENSE_AGREEMENT=yes`，许可条款以 Neo4j 官方订阅协议为准。
- **MinIO**：同时承载 ARS 自身对象存储（头像、Agent 图片、知识库文件）与 Milvus 依赖；商业场景可评估 MinIO 商业订阅，或由运维侧替换为其他 S3 兼容对象存储并同步迁移这两部分的数据与配置。

本节为工程侧整理的边界说明，不构成法律意见；对外商业交付前请由法务确认最终方案。
