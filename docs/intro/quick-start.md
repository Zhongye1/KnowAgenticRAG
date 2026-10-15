# 快速开始指南

本项目是一个智能知识库和知识图谱 Agent 开发平台。
本指南将帮助你在几分钟内启动并运行系统，使你能够利用 LangGraph、RAG 技术和知识图谱构建 AI 驱动的知识应用。

![系统架构图](https://xerrors.oss-cn-shanghai.aliyuncs.com/github/arch.png)


::: tip 提示
除了此文档网站外，你还可以访问 [Zread](https://zread.ai/xerrors/ARS) 或 [DeepWiki](https://deepwiki.com/xerrors/ARS) 查看自动生成的详细项目文档。
:::

## 环境要求

项目采用微服务架构设计，默认服务无需 GPU 支持。如果需要使用 OCR 功能，可以通过环境变量配置外部服务。

## 快速安装

### 步骤一：获取项目代码

```bash
# 克隆最新版本
git clone --branch v0.7.2.beta1 --depth 1 https://github.com/xerrors/ARS.git
cd ARS
```

`--depth 1` 标志会创建一个浅克隆，仅包含最新的提交，从而显著减少下载时间和磁盘使用量。下表提供了版本选择的指导。

| 版本 | 适用场景 |
|------|----------|
| v0.7.1 | 当前稳定版本，推荐生产使用 |
| main | 开发版本，包含最新特性（可能不稳定） |

### 步骤二：配置环境变量

**方式一：使用初始化脚本（推荐）**

我们提供了自动化脚本，帮你完成环境配置和 Docker 镜像拉取：

```bash
# Linux/macOS
./scripts/init.sh

# Windows PowerShell
.\scripts\init.ps1
```

脚本会引导你完成以下配置：
- 创建 `.env` 配置文件
- 设置 `SILICONFLOW_API_KEY`（必需，用于调用大模型）
- 独立生成并持久保存 `JWT_SECRET_KEY`、`API_KEY_DERIVATION_SECRET` 和 `SANDBOX_PROVISIONER_TOKEN`
- 拒绝短于 32 字符或彼此复用的安全密钥，并将 Linux/macOS `.env` 权限收紧为 `600`
- 设置 `TAVILY_API_KEY`（可选，用于搜索服务）
- 自动拉取必需的 Docker 镜像

::: tip API Key 获取
- **硅基流动**：访问 [cloud.siliconflow.cn](https://cloud.siliconflow.cn/i/Eo5yTHGJ)，注册认证即送 16 元额度
- **Tavily**：访问 [app.tavily.com](https://app.tavily.com/) 获取搜索 API Key（可选）
:::

**方式二：手动配置**

如果偏好手动配置：

```bash
# 复制环境变量模板
cp .env.template .env

# 编辑 .env 文件，填入模型 API Key，并为下列三项分别生成不同的随机值
# JWT_SECRET_KEY=$(openssl rand -hex 32)
# API_KEY_DERIVATION_SECRET=$(openssl rand -hex 32)
# SANDBOX_PROVISIONER_TOKEN=$(openssl rand -hex 32)
```

也可以在复制模板后运行初始化脚本；脚本会检测已有 `.env`，只补齐缺失的 required 配置。三个安全密钥不能复用，后续重建与升级必须保留原值。

### 步骤三：启动服务

```bash
# 构建并启动所有服务
docker compose up --build -d
```

从旧文件布局升级到 v0.7.2 时不能直接 `up`；请严格执行
[生产部署与升级](../advanced/deployment.md#2-启动服务) 中唯一维护的停机迁移流程。

服务首次启动需要等待镜像拉取和编译，请耐心等待 2-3 分钟。

::: tip 轻量模式（Lite Mode）
如果你不需要知识库和知识图谱功能，可以使用轻量模式启动，跳过 Milvus、Neo4j、etcd 等服务，节省系统资源：

```bash
task up-lite  # macOS or Linux
```

轻量模式仅启动核心服务（api、worker、PostgreSQL、Redis、Silo），不加载知识库与图谱能力。切换回完整模式只需运行 `task up`。
:::

### 步骤四：访问系统

服务启动后，访问以下地址：

| 服务 | 地址 |
|------|------|
| Web 界面 | http://localhost:5173 |
| API 文档 | http://localhost:5050/docs |

首次访问时，系统会要求你设置超级管理员账号和密码，请妥善保存。

## 故障排除

### 查看服务状态

```bash
# 查看所有容器状态
docker ps

# 实时查看后端日志
docker logs api-dev -f

# 实时查看前端日志
docker logs web-dev -f
```

### 部署故障排查

<details>
<summary><strong>Docker 镜像拉取失败</strong></summary>

如果网络原因导致镜像拉取失败，可以尝试：

```bash
# 手动拉取基础镜像
bash scripts/pull_image.sh python:3.13-slim
```

**离线环境部署方案**：

```bash
# 在有网络的环境导出镜像，注意检查镜像列表，不一定是最新的。
bash docker/save_docker_images.sh

# 传输到目标机器
scp docker_images_xxx.tar user@host:/path/

# 导入镜像
docker load -i docker_images_xxx.tar
```
</details>

<details>
<summary><strong>构建失败</strong></summary>

多数构建失败是由于网络问题。尝试配置代理：

```bash
# Linux/macOS
export HTTP_PROXY=http://IP:PORT
export HTTPS_PROXY=http://IP:PORT

# Windows PowerShell
$env:HTTP_PROXY="http://IP:PORT"
$env:HTTPS_PROXY="http://IP:PORT"
```

如果配置代理后反而失败，尝试移除代理后重试。
</details>

<details>
<summary><strong>Milvus 服务启动失败</strong></summary>

```bash
# 重启 Milvus 服务
docker compose up milvus -d
docker restart api-dev
```
</details>

::: tip 调试面板
前端提供了调试面板（在头像菜单中可找到），可以查看详细的请求和响应信息。生产环境建议关闭此特性。
:::

## 下一步

- 了解如何配置模型：阅读 [模型配置](./model-config.md)
- 探索知识库功能：阅读 [知识库与知识图谱](./knowledge-base.md)
- 学习智能体开发：阅读 [智能体开发](../agents/agents-config.md)
- 深入了解配置系统：阅读 [配置系统详解](../advanced/configuration.md)
- 理解运行时状态与边界：按顺序阅读 [机制详解](../mechanisms/index.md)
