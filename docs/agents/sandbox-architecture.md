# 沙盒配置与运维

本文说明如何为 ARS 配置 `sandbox-provisioner`、选择 Docker 或 Kubernetes 承载、注入受控运行环境并验证实例。身份派生、虚拟路径、挂载权限、网络隔离、回收与恢复语义见[沙盒机制详解](../mechanisms/sandbox.md)；本页不重复内部实现。

## 选择承载方式

应用层固定使用 `SANDBOX_PROVIDER=provisioner`。provisioner 进程读取 `PROVISIONER_BACKEND` 选择承载方式；Compose 用户应设置宿主环境的 `SANDBOX_PROVISIONER_BACKEND`，Compose 再把它映射为容器内变量。不要在 `.env` 中把两个名称当作同一入口混用。

| backend | 用途 | 是否提供真实隔离 |
| --- | --- | --- |
| `docker` | 默认开发、单机部署；按需创建本机容器 | 是 |
| `kubernetes` | 由目标集群创建 Pod 与 NodePort Service | 是，取决于集群安全配置 |
| `memory` | unit 或占位测试，只保存 ID 到 URL 映射 | 否 |

生产或开发运行不要使用 `memory`。切换 backend 只改变动态沙盒的承载位置，API 和 worker 仍通过同一个 provisioner 认证代理访问沙盒。

## 应用层配置

API 与 worker 使用下面的变量连接 provisioner；实际默认值和 Compose 注入以 `docker-compose.yml` 为准：

| 变量 | 约束 |
| --- | --- |
| `SANDBOX_PROVIDER` | 当前必须为 `provisioner` |
| `SANDBOX_PROVISIONER_URL` | API/worker 可达的 provisioner 地址 |
| `SANDBOX_PROVISIONER_TOKEN` | 管理与代理接口 Bearer token，至少 32 个随机字符 |
| `SANDBOX_VIRTUAL_PATH_PREFIX` | 用户数据虚拟根，通常为 `/home/gem/user-data` |
| `SANDBOX_EXEC_TIMEOUT_SECONDS` | 单次命令执行超时 |
| `SANDBOX_MAX_OUTPUT_BYTES` | 单次命令返回给调用方的最大字节数 |

`SANDBOX_PROVISIONER_TOKEN` 只能提供给 API、worker 和 provisioner。不要把它写进 `sandbox.env`、Agent 用户环境、Skill、日志或文档示例。

API 与 worker 固定以 `1000:1000` 运行。动态 Sandbox 的镜像入口保留 root bootstrap，但 provisioner 会在合并全局和用户环境后强制覆盖 `USER=gem`、`USER_UID=1000`、`USER_GID=1000`，实际文件 API 与 shell 服务以该身份运行。升级 Compose/Docker 持久目录时必须先执行 `scripts/migrate-storage.sh`；storage migrator 在停写窗口一次性迁移所有权并发布 marker，之后 Docker backend 只验证目录，不再创建目录或执行 `chmod`。远程 Kubernetes PVC 的 root init 迁移契约见下文。

## Provisioner 通用配置

当前仓库里，后端只支持 `SANDBOX_PROVIDER=provisioner`。当某个对话线程第一次需要执行文件操作或命令执行时，后端会基于 uid、根 runtime scope 和 instance 生成稳定的 `sandbox_id`，然后请求 `sandbox-provisioner` 创建或复用对应沙盒；provisioner 还会把 Workdir 作为不可漂移的挂载身份复核。Skill 选择不参与 sandbox identity。应用层拿到返回的 `sandbox_url` 之后，才会真正通过 `agent-sandbox` 客户端去调用远程沙盒的文件 API 和 shell API。

Compose 用宿主变量生成 provisioner 容器变量；直接部署 provisioner 时则设置右侧容器变量：

| Compose/.env 输入 | provisioner 容器变量 | 作用 |
| --- | --- | --- |
| `SANDBOX_PROVISIONER_BACKEND` | `PROVISIONER_BACKEND` | `docker`、`kubernetes` 或仅测试使用的 `memory` |
| `SANDBOX_PROVISIONER_URL` | `PROVISIONER_PUBLIC_URL` | 写入每个响应的认证代理 URL；必须从 API/worker 可达 |
| `SANDBOX_IMAGE` | `SANDBOX_IMAGE` | 动态沙盒使用的镜像 |
| `SANDBOX_CONTAINER_PORT` | `SANDBOX_CONTAINER_PORT` | 镜像内 agent-sandbox HTTP 端口 |
| `SANDBOX_HEALTH_TIMEOUT_SECONDS` | `SANDBOX_HEALTH_TIMEOUT_SECONDS` | 实例创建后的健康检查总等待时间 |
| `SANDBOX_IDLE_TIMEOUT_SECONDS` | `SANDBOX_IDLE_TIMEOUT_SECONDS` | 无活动实例的回收阈值 |
| `SANDBOX_IDLE_CHECK_INTERVAL_SECONDS` | `SANDBOX_IDLE_CHECK_INTERVAL_SECONDS` | idle reaper 扫描间隔 |
| `SANDBOX_EXEC_TIMEOUT_SECONDS` | `SANDBOX_EXEC_TIMEOUT_SECONDS` | provisioner 计算安全回收下限时使用的命令超时 |

API/worker 连接地址与 `PROVISIONER_PUBLIC_URL` 通常来自同一个 `SANDBOX_PROVISIONER_URL`，但混合部署时必须确认该地址既能由 API/worker 请求 create/touch，也能访问返回的 `/api/sandboxes/<id>/proxy`。idle timeout 若小于命令超时加 30 秒，运行时会提高到该下限。

## Docker 后端配置

Docker backend 要求 provisioner 能访问宿主机 Docker daemon，并能解析线程数据在宿主机上的真实路径：

| 变量 | 作用 |
| --- | --- |
| `DOCKER_NETWORK_PREFIX` | 每个沙盒独立 bridge 网络的名称前缀 |
| `DOCKER_SANDBOX_PREFIX` | 动态容器名称前缀 |
| `DOCKER_THREADS_HOST_PATH` | `saves/threads` 在宿主机上的绝对路径；未设置时尝试从 provisioner 挂载推导 |

Compose 部署需要把 Docker socket 和 `saves` 对应目录挂入 provisioner。每个沙盒只加入自身网络，provisioner 同时加入该网络并提供认证代理；不要把动态沙盒接入承载 PostgreSQL、Redis、Silo 等服务的应用网络，也不要把沙盒端口发布到宿主机。

## Kubernetes 后端配置

Kubernetes backend 使用 kubeconfig 或 Pod 内服务账号创建沙盒 Pod 和 NodePort Service：

| Compose/.env 输入 | provisioner 容器变量 | 作用 |
| --- | --- | --- |
| `SANDBOX_K8S_NAMESPACE` | `K8S_NAMESPACE` | 沙盒 Pod 与 Service 所在 namespace |
| `KUBECONFIG_PATH` | `KUBECONFIG_PATH` | provisioner 容器内 kubeconfig 路径；集群内运行时可留空 |
| `SANDBOX_NODE_HOST` | `NODE_HOST` | provisioner 能访问 NodePort 的节点地址 |
| `USER_DATA_PVC` | `USER_DATA_PVC` | UserWorkspace 使用的共享 PVC |
| `SKILLS_PVC` | `SKILLS_PVC` | 共享/内置 Skill 投影使用的只读 PVC |

当前返回给 API/worker 的仍是 provisioner 代理 URL；`NODE_HOST` 只需从 provisioner 可达。Pod 禁用 ServiceAccount token 自动挂载，除非未来由明确威胁模型和实现变更调整。PVC 必须支持 provisioner 选择的访问模式和 `subPath` 目录结构。

## Docker Compose 开发配置

默认开发拓扑由 Compose 启动 API、worker 和 provisioner，再由 provisioner 动态创建短生命周期沙盒；仓库没有“直接在 API 容器执行用户命令”的本地模式。通常以 `.env.template` 与 Compose 的默认字段为起点，仅生成独立的强随机 provisioner token：

这里还需要把 Compose 里的环境变量分两层看。`api` 和 `worker` 关注的是应用层变量，例如 `SANDBOX_PROVIDER`、`SANDBOX_PROVISIONER_URL`、`SANDBOX_PROVISIONER_TOKEN`、`SANDBOX_VIRTUAL_PATH_PREFIX`、`SANDBOX_EXEC_TIMEOUT_SECONDS`、`SANDBOX_MAX_OUTPUT_BYTES`。`sandbox-provisioner` 自己则有另一组变量，负责决定具体如何创建沙盒实例。两层不要混看，否则很容易误以为改了 API 环境变量就能切换底层承载方式。

## 五、Docker 本机后端是如何工作的

当 `SANDBOX_PROVISIONER_BACKEND=docker` 时，`sandbox-provisioner` 会进入 `LocalContainerProvisionerBackend`。它会检查 Docker 是否可用，解析 `/app/user-data` 和 `/app/skill-projections` 两个显式挂载在宿主机上的真实路径。随后它按应用层给出的 `sandbox_id` 启动或复用类似 `ars-sandbox-<id>` 的容器，并复核用户、Workdir 与挂载身份。

这个沙盒镜像默认来自 `SANDBOX_IMAGE`，容器内部监听的端口默认是 `8080`。provisioner 会为每个动态沙盒创建独立的 Docker bridge 网络，只把 provisioner 和该沙盒接入其中；沙盒之间不能互访，也不能访问承载 PostgreSQL、Redis、Neo4j、Silo 等服务的 `app-network`。沙盒端口不发布到宿主机，provisioner 通过对应的独立网络访问真实容器，再以需要 Bearer token 的代理地址向 API/worker 提供文件和命令接口。API/worker 不直接持有沙盒容器地址。

这个拓扑把沙箱按“其中代码可能被完全控制”处理。`SANDBOX_PROVISIONER_TOKEN` 只配置给 API、worker 和 provisioner，绝不能写进 `sandbox.env` 或用户级 Agent 环境变量，否则沙箱会重新获得 provisioner 管理权限。

Docker 后端把当前 uid 的 UserWorkspace 整体挂到 `/home/gem/user-data`，把授权的共享/内置 Skills 投影只读挂到 `/home/gem/skills`，并把 cwd 设置为 `/home/gem/user-data/<workdir_path>`。每个 Thread 只改变 cwd，不改变挂载形状。根 Agent 与子 Agent 使用同一个稳定 runtime；不同顶层 Conversation 使用独立容器，即使它们绑定同一 Workdir 也只共享文件。runtime 销毁不删除持久文件。

为了避免长期空闲的沙盒一直占资源，provisioner 还带了一个 idle reaper。它会记录每个沙盒最近一次被 touch 的时间，超过 `SANDBOX_IDLE_TIMEOUT_SECONDS` 之后自动删除。当前默认空闲超时是 120 秒，但如果这个值小于命令执行超时，系统会自动把它提高到“命令超时 + 30 秒”，以免执行中的任务被误回收。

对应到 `docker-compose.yml` 和 `docker-compose.prod.yml`，当前 `sandbox-provisioner` 实际会读取的 Docker 后端相关变量主要是这些：

- 通用变量：`PROVISIONER_BACKEND`、`SANDBOX_IMAGE`、`SANDBOX_CONTAINER_PORT`、`SANDBOX_HEALTH_TIMEOUT_SECONDS`、`SANDBOX_IDLE_TIMEOUT_SECONDS`、`SANDBOX_IDLE_CHECK_INTERVAL_SECONDS`、`SANDBOX_EXEC_TIMEOUT_SECONDS`、`MEMORY_SANDBOX_URL_TEMPLATE`
- Docker 后端变量：`DOCKER_NETWORK_PREFIX`、`DOCKER_USER_DATA_HOST_PATH`、`DOCKER_SKILL_PROJECTIONS_HOST_PATH`、`DOCKER_SANDBOX_PREFIX`
- 容器代理变量：`HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY`

`DOCKER_NETWORK_PREFIX` 用于生成每个沙盒的独立网络名称。两个 host path 变量都是 Docker 后端专用；如果不显式传入，provisioner 会从对应容器挂载分别解析。

## 六、Kubernetes 后端是如何工作的

当 `SANDBOX_PROVISIONER_BACKEND=kubernetes` 时，`sandbox-provisioner` 会改用 Kubernetes Python 客户端。它会先加载 kubeconfig 或集群内配置，然后在指定的 namespace 中创建一个沙盒 Pod，再创建一个同名的 NodePort Service，把这个 Service 的 `nodePort` 暴露给 ARS 后端使用。

Kubernetes 后端下，沙盒还是同一套镜像并暴露相同 HTTP API，但由 Pod 承载。Pod 从 `USER_DATA_PVC` 的 `shared/<uid>/workspace` subPath 挂载整个 UserWorkspace，从 `SKILLS_PVC` 只读挂载 `skill-projections/<uid>`。由于远程 PVC 不经过 Compose storage migrator，root init container 以 no-follow 方式对当前 uid 子树执行带 marker 的一次性 `1000:1000` 迁移，再确认 Workdir 路径；它不扫描其他用户子树，也不预建 `uploads/outputs`。跨节点实时共享时，User Data PVC 必须提供部署所需的共享读写语义。

Kubernetes 后端还需要一个 `NODE_HOST`。这是因为当前实现使用的是 NodePort Service，而不是 Ingress，也不是 ClusterIP。provisioner 创建完 Service 后会通过 `http://<NODE_HOST>:<nodePort>` 访问目标沙箱，但返回给 ARS 后端的仍是 provisioner 认证代理地址。所以 `NODE_HOST` 必须从 provisioner 可达，不需要直接暴露给 API/worker。

当前 Compose 中与 Kubernetes 后端对应的变量主要是：

- `K8S_NAMESPACE`
- `KUBECONFIG_PATH`
- `NODE_HOST`
- `USER_DATA_PVC`
- `SKILLS_PVC`

两个 PVC 都进入实际 Pod spec：User Data 是可写实时文件域，Skills 是独立来源的只读投影域。

## 七、如果要使用“远程 K8s”，应该怎么接

这里最容易误解的一点是，所谓“选择远程 K8s”，并不是在 ARS 页面里点一个开关，然后系统自动发现一个集群。当前实现没有内建集群选择器，也没有多集群管理界面。它的工作方式很直接：我们把 `sandbox-provisioner` 配置成 `kubernetes` 后端，并让它能拿到目标集群的 kubeconfig 或者运行在集群内即可。对 provisioner 来说，只要 Kubernetes 客户端能连上 API Server，这个集群就是它要操作的“远程 K8s”。

如果 ARS 部署在 Docker Compose 里，而 Kubernetes 集群在另一台机器或云厂商托管环境中，那么最常见的做法是把本地 kubeconfig 文件挂载进 `sandbox-provisioner` 容器，然后设置 `KUBECONFIG_PATH`。同时把 `SANDBOX_NODE_HOST` 改成一个从 `api` 容器也能访问的节点公网 IP、负载均衡域名，或者已经做过反向代理的地址。

一个典型的 Compose 覆盖配置会长这样：

```yaml
services:
  sandbox-provisioner:
    environment:
      - PROVISIONER_BACKEND=kubernetes
      - K8S_NAMESPACE=ars-know
      - KUBECONFIG_PATH=/root/.kube/config
      - USER_DATA_PVC=ars-user-data
      - SKILLS_PVC=ars-skills
      - NODE_HOST=203.0.113.10
    volumes:
      - ~/.kube/config:/root/.kube/config:ro
```

这段配置保留 Compose 运行 ARS 主服务，并让沙盒实例由远程 Kubernetes 集群承载。这是当前代码支持的混合部署方式。

如果 `sandbox-provisioner` 本身就运行在 Kubernetes 集群内部，那么通常不需要显式提供 `KUBECONFIG_PATH`。它会优先尝试 `incluster_config`，也就是使用 Pod 的服务账号权限直接访问 Kubernetes API。此时更需要关注的是 namespace、PVC 和 NodePort 的可达性，而不是 kubeconfig 文件本身。

## 八、当前项目的沙盒文件系统是如何设计的

从模型和工具调用的视角看，ARS 暴露 UserWorkspace 根 `/home/gem/user-data` 和共享 Skill 根 `/home/gem/skills`。Conversation 的 `workdir_path` 选择 UserWorkspace 下的当前 cwd，也是 AgentPanel Viewer 的根；个人 Skill 位于 `agents/skills`。知识库不映射为沙盒文件系统路径。

在宿主机侧，各存储域通过独立挂载提供，目录结构可以概括为下面这样：

```text
skill-projections/
│   └── <uid>/
│       └── <skill-slug>/
user-data/
└── shared/
    └── <uid>/
        └── workspace/
            ├── agents/skills/<skill-slug>/
            └── projects/<workdir-id>/
                ├── uploads/  （确认首个附件时按需创建）
                └── outputs/  （首次写入交付物时按需创建）
```

`user-data/shared/<uid>/workspace` 是当前用户文件的唯一实时 POSIX 根；`projects/<workdir-id>` 只是其中的默认对话目录。v0.7.1 的 thread `uploads/outputs` 只由一次性 `storage-migrator` 读取，迁移后不再进入 shipping 读写链路。

## 九、路径暴露规则是什么

ARS 不会把整个容器文件系统都开放给 Agent 或 Viewer。Agent 可以读写当前 uid 的整个 UserWorkspace，并读取共享 Skill projection；AgentPanel 的 `/` 只映射当前 Workdir。所有受信任 API 都以 root-to-leaf no-follow 方式拒绝越界路径、symlink 和特殊文件。

当前 Workdir 是主要工作区。内置 prompt 建议把用户上传放在 `uploads/`、最终交付物放在 `outputs/`；同一 uid 的其他 Project 可以读取，但未经用户明确要求不得跨 Workdir 写入。这是模型行为约束，不是安全边界。

API 的 Viewer、附件和 artifact 不复用 execution runtime，也不创建 file-bridge Sandbox；它们在验证 uid 与 Conversation ownership 后，通过 `ars.workspace.Workspace` 及其持久化 `Workdir` 视图直接访问同一字节，并把 Thread 写操作限制在当前 Workdir。只有 artifact URL 和传给 Agent 的路径会在 Service 边界转换成 Backend runtime 路径。

根 Run 进入终态时会在 PostgreSQL 中原子请求仍活跃的后代停止：尚未被 worker 接管的待执行后代可直接终态化，仍持有 owner/lease 的后代保留 `cancel_requested`，直到 worker 确认停止。根 Run 同时设置 `runtime_cleanup_pending`；下一次顶层 Run、retry attempt 和 SSE `end` 都不能越过这个 fence，worker 删除 runtime 成功后才清除它，周期 reconciler 负责重试失败的清理并重新投递 pending retry。单个子 Run 终态不会删除父子共享 runtime，任何 runtime cleanup 都不删除 Project Workdir。

`/home/gem/skills` 只读挂载当前用户的共享/内置 `skill-projections/<uid>`；个人 Skill 通过 UserWorkspace
挂载直接保留在 `/home/gem/user-data/agents/skills`。持久源、授权同步和选择/激活语义由
[Skills 管理](skills-management.md) 唯一说明，Sandbox 不拥有 `skill-sources`。

知识库访问不属于沙盒文件系统暴露规则。当前 Agent 可见知识库仍由用户权限和 Agent 配置共同决定，但只通过 `query_kb`、`open_kb_document` 等工具访问，不提供沙盒目录投影。

## 十、skills、知识库、附件是怎么和沙盒结合的

共享/内置 Skill 在 Sandbox 中表现为 `/home/gem/skills` 的只读用户投影，个人 Skill 表现为
`/home/gem/user-data/agents/skills`；Prompt 与工具激活规则见
[Skills 管理](skills-management.md)。

附件确认后，原件和可选 Markdown 解析结果直接写入当前 Workdir 的 `uploads/`，Conversation 只保留文件 ID、请求绑定、展示名称、状态和实时路径。Agent 每轮通过当前用户消息获得线程全部历史附件的名称与路径，不修改系统提示词。临时上传对象在确认完成后删除；未确认对象在该用户下一次上传时顺手清理超过 24 小时的分组，不引入定时任务。升级前的旧文件只由停机期 `storage-migrator` 导入。

知识库不再与沙盒文件系统结合。它不会被复制到每个线程目录，也不会生成虚拟目录；模型通过专门的知识库工具检索，并在需要更完整上下文时用 `open_kb_document` 按 `kb_id` 和 `file_id` 打开文档内容。

## 十一、当前推荐如何使用 Docker 沙盒

如果只是正常开发、调试或单机部署，最简单也是当前默认的方式就是保留 `SANDBOX_PROVIDER=provisioner`，同时把 `SANDBOX_PROVISIONER_BACKEND` 设为 `docker`。这会让整个项目继续由 Docker Compose 管理，而沙盒实例由 provisioner 动态创建。通常不需要手工 `docker run` 沙盒镜像，也不需要在 Compose 文件里静态声明每一个沙盒容器。

最小必要配置通常就是下面这几项：

```env
SANDBOX_PROVIDER=provisioner
SANDBOX_PROVISIONER_URL=http://sandbox-provisioner:8002
SANDBOX_PROVISIONER_TOKEN=<至少 32 个随机字符>
SANDBOX_PROVISIONER_BACKEND=docker
```

启动与初步检查：

```bash
docker compose up -d
curl --fail http://localhost:8002/health
```

健康响应应报告 `backend=docker`。动态沙盒只在首次文件或命令操作时创建；仅启动 Compose 后看不到沙盒容器是正常现象。

## Kubernetes 接入步骤

1. 在目标 namespace 创建或确认 `USER_DATA_PVC` 与 `SKILLS_PVC`，预先验证 provisioner 与沙盒 Pod 都能访问预期 `subPath`。
2. 为 provisioner 提供最小权限的 kubeconfig，或让它在集群内使用受限 ServiceAccount；权限仅覆盖目标 namespace 所需的 Pod 与 Service 操作。
3. Compose 混合部署设置 `SANDBOX_PROVISIONER_BACKEND=kubernetes`、`SANDBOX_K8S_NAMESPACE`、PVC、`SANDBOX_NODE_HOST` 与 API/worker 可达的 `SANDBOX_PROVISIONER_URL`，并把 kubeconfig 只读挂入 provisioner。直接部署 provisioner 时使用对应的容器变量；集群内部署通常不设置 `KUBECONFIG_PATH`。
4. 从 provisioner 所在网络验证 Kubernetes API 和 `http://<NODE_HOST>:<nodePort>` 可达。API/worker 无需直接访问 NodePort。
5. 创建测试线程触发真实 shell 与文件读写，再核对 Pod、Service、PVC 文件和 provisioner 代理响应。

当前没有多集群选择 UI、Ingress backend 或自动节点发现。需要这些能力时应作为明确的部署功能实现，不能只通过文档假设存在。

Project Viewer 先把 Conversation 解析成授权的持久化 `Workdir`，再通过 `Workspace` 访问同一份
实时字节；Viewer 的 `/` 始终是当前 Workdir 根，它不会为了浏览文件而连接 execution runtime。Artifact 下载按 UserWorkspace 与 Skills 授权根
选择文件，并在实际读取前再次执行用户与 Skill 授权。

因此当前实现是“同一文件事实、不同访问能力”：Agent execution runtime、Viewer 和 API 可以是
不同进程或容器，但看到的是同一 POSIX Workdir；`SelectedSkillsReadonlyBackend` 只负责当前 Agent
选择项的工具可见性，共享/内置 Skill 投影仍是 uid 授权全集且只读；个人 Skill 不进入该投影。

## 沙盒运行环境

动态沙盒的环境由两类来源合并：provisioner 读取的全局 `docker/sandbox_provisioner/sandbox.env`，以及当前用户为 Agent 配置的环境变量；用户级值覆盖同名全局值。它们都会对沙盒内代码可见，应按可被不可信代码读取和外传来处理。

只注入任务真正需要的低权限变量。禁止注入 provisioner token、数据库凭据、对象存储管理凭据、云平台管理员密钥和其他租户秘密。代理变量可以配置，但应限制目标网络并避免让沙盒进入应用内部网络。

远程 Skill 拉取使用不继承全局和用户环境的一次性 sandbox；不要依赖 `sandbox.env` 为 Skill 安装提供凭据。Kubernetes 沙盒同样禁用 ServiceAccount token 自动挂载。

## 验证与排障

按下面顺序验证，避免把应用、provisioner、实例和文件路径问题混在一起：

1. 调用 provisioner `/health`，确认 backend、idle timeout 和依赖初始化状态。
2. 触发一个真实线程的 shell 命令与 `outputs` 写入，确认创建或复用的是该线程对应实例。
3. Docker 检查独立网络、挂载和 provisioner 代理；Kubernetes 检查 Pod、NodePort Service、PVC `subPath` 与 `NODE_HOST` 可达性。
4. 分别从沙盒 API 和 viewer 读取同一个虚拟文件，确认虚拟路径解析到同一所属线程；HTTP 状态仅作为接口可达性证据。
5. 等待超过 idle timeout，确认实例被回收、持久文件仍存在，并能在下一次操作重建实例。

常见错误应优先检查：应用层 URL/token 与 provisioner backend 是否混配、Docker host path 是否推导错误、Kubernetes PVC 子目录是否缺失、file thread 与 skills thread 是否取错、以及 provisioner touch 失败后复用的实例是否已经失效。进一步定位使用[沙盒机制详解](../mechanisms/sandbox.md)中的 Owner 和失败边界。

## 配置来源

变量名与注入位置以 `docker-compose.yml`、`docker-compose.prod.yml`、`.env.template` 和 `docker/sandbox_provisioner/app.py` 为准。本页只解释运维语义，不复制镜像标签或全部默认值；修改配置时同步检查这些 Owner 与部署模板。

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PROVISIONER_BACKEND` | 底层后端类型，`docker` 或 `kubernetes` | `docker` |
| `SANDBOX_IMAGE` | 沙盒容器镜像 | 详见 compose 文件 |
| `SANDBOX_CONTAINER_PORT` | 沙盒容器内部端口 | `8080` |
| `SANDBOX_IDLE_TIMEOUT_SECONDS` | 空闲回收时间 | `120` |
| `SANDBOX_HEALTH_TIMEOUT_SECONDS` | 健康检查超时 | `300` |

**Docker 后端专用：**

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DOCKER_NETWORK_PREFIX` | 每沙盒独立网络的名称前缀 | `ars-know-sandbox` |
| `DOCKER_SANDBOX_PREFIX` | 沙盒容器名前缀 | `ars-sandbox` |
| `DOCKER_USER_DATA_HOST_PATH` | UserWorkspace 宿主机路径 | 从显式挂载解析 |
| `DOCKER_SKILL_PROJECTIONS_HOST_PATH` | Skill 投影宿主机路径 | 从显式挂载解析 |

**Kubernetes 后端专用：**

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `K8S_NAMESPACE` | Kubernetes namespace | `ars-know` |
| `NODE_HOST` | Kubernetes 节点地址 | `host.docker.internal` |
| `KUBECONFIG_PATH` | kubeconfig 文件路径 | 空（使用 incluster 配置） |
| `USER_DATA_PVC` | UserWorkspace 共享读写卷 | `ars-user-data` |
| `SKILLS_PVC` | Skill 投影卷 | `ars-skills` |

### 环境变量传递链

```
宿主机 .env / 系统环境变量
         ↓
    docker-compose.yml
         ↓
    ┌────────────────────────────────┐
    │  api/worker 服务               │  应用层变量 (SANDBOX_*)
    │    SANDBOX_PROVISIONER_URL     │
    │    SANDBOX_PROVISIONER_TOKEN   │
    └────────────┬───────────────────┘
                 ↓  带 Bearer token 的 HTTP 调用
    ┌────────────────────────────────┐
    │  sandbox-provisioner 服务       │  沙盒层变量 (PROVISIONER_BACKEND, DOCKER_*, K8S_*)
    │    PROVISIONER_BACKEND         │
    └────────────┬───────────────────┘
                 ↓  Docker API / K8s API + 认证 HTTP 代理
    ┌────────────────────────────────┐
    │  动态创建的沙盒容器              │
    └────────────────────────────────┘
```

两层变量不要混看。改了 `api/worker` 的 `SANDBOX_PROVISIONER_URL` 只是改了后端找 provisioner 的地址；改了 `sandbox-provisioner` 的 `PROVISIONER_BACKEND` 才是改了 provisioner 本身用什么方式创建沙盒。

### sandbox.env 的特殊作用

`docker/sandbox_provisioner/sandbox.env` 文件的用途与上述两层变量不同。它通过 volume 挂载到 provisioner 容器内 (`/app/sandbox.env`)，然后由 `LocalContainerProvisionerBackend` 在创建沙盒容器时读取，解析后的键值对会作为**环境变量注入到每个动态创建的沙盒容器**中。

```yaml
# docker-compose.yml 中 sandbox-provisioner 的挂载
sandbox-provisioner:
  volumes:
    - ./docker/sandbox_provisioner/sandbox.env:/app/sandbox.env:ro
```

也就是说，`sandbox.env` 配置的是沙盒容器内部可见的环境变量，而不是 provisioner 本身的配置。当前该文件内容为：

```env
CHECK_ARS_SANDBOX_ENV_EXISTS=True
```

如果需要给所有沙盒容器注入额外的环境变量（如代理配置、认证信息等），可以添加到 `sandbox.env` 文件中。

远程 Skill 拉取使用专门的一次性 Sandbox，不继承这里的全局环境变量或用户级 Agent 环境变量，避免不可信仓库通过复制文件带出凭据。Kubernetes 创建的 Sandbox 同时会禁用 ServiceAccount token 自动挂载。

### 配置方式汇总

| 配置目标 | 配置位置 | 示例变量 |
|----------|----------|----------|
| 应用层连接 provisioner | `.env` 或 compose 环境 | `SANDBOX_PROVISIONER_URL`, `SANDBOX_PROVISIONER_TOKEN` |
| provisioner 自身行为 | `.env` 或 compose 环境 | `PROVISIONER_BACKEND`, `DOCKER_*` |
| 沙盒容器内部环境 | `sandbox.env` 文件 | 代理、认证等运行时变量 |

## 十四、和旧版文档相比，今天最重要的理解方式

当前项目由 ARS 管理 Conversation 的 UserWorkspace 相对 Workdir、运行上下文和沙盒生命周期。provisioner 为一次顶层执行树创建沙盒实例，挂载当前 uid 的整个 UserWorkspace 和只读共享 Skills；知识库通过 `query_kb`/`open_kb_document` 等工具访问。

因此，当你在界面上“启用沙盒”或者在文档里“选择 K8s”时，实际切换的是 provisioner 的底层实例承载方式。选择 `docker` 时，沙盒由当前部署机上的 Docker daemon 动态创建；选择 `kubernetes` 时，沙盒由目标 K8s 集群动态创建。ARS 通过统一的 provisioner 服务地址访问两种后端。

## 十五、排障时建议先看什么

如果怀疑是 provisioner 级问题，先看 `http://localhost:8002/health`，确认 backend 类型和 idle timeout 是否符合预期。默认 Docker 部署下这里应看到 `backend=docker`。接着看 `docker logs sandbox-provisioner --tail 200`，因为这里能直接看到创建容器、复用旧实例、健康检查失败和 idle reaper 删除的日志。

如果怀疑是 Docker 地址不可达，先确认每个动态沙箱只连接自己的 `ars-know-sandbox-<id>` 网络，provisioner 同时连接该网络，而 API/worker 只在 `app-network`。provisioner 日志中的目标地址应是动态容器名，API/worker 拿到的地址应是 `/api/sandboxes/<id>/proxy`；代理请求必须携带 `SANDBOX_PROVISIONER_TOKEN`。如果怀疑是 Kubernetes 地址不可达，重点检查 `NODE_HOST` 和 NodePort 是否从 provisioner 可达。

如果文件在 Viewer 可见但模型读不到，先检查 Conversation 的 `workdir_path`、Run 的根 `runtime_scope_id`、provisioner generation 与 UserWorkspace mount；父子绑定必须解析到同一个根 runtime。若 Viewer 与 Sandbox 看到不同字节，检查 `shared/<uid>/workspace` 的实际 bind/PVC subPath。Skills 问题还需检查 uid、授权投影和只读挂载。
