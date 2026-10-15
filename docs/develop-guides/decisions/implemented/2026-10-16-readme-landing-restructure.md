# README 改成产品落地页

状态：implemented
类型：process
Owner：README.md

事实分工：`README.md` 拥有仓库首页的定位、快速启动命令、文档导航、能力概览、贡献入口与许可证说明；对外可验证的事实分别由 `docker-compose.yml`（服务与端口）、`docs/`（操作细节）、`backend/pyproject.toml` 与 `web/package.json`（版本号）、`.env.template`（环境变量）拥有；本记录不改写这些事实源。

## 问题

1. **README 的读者定位过窄。** 原文件开头就写明「本文件只讲怎么开发和怎么部署」，随后是技术栈表、开发命令与生产部署细节。对第一次看到仓库的人（stars、Issue、外部试用者）来说，仓库首页没有一句产品定位，也没有能力概览与截图，安装步骤埋在第 60 行之后。
2. **命令与地址过期。** `git clone https://github.com/Zhongye1/KnowledgeRAG-OGAS.git` 与 `cd KnowledgeRAG-OGAS` 用的是改名前的仓库；文档站地址用改名前的 Pages 路径。
3. **开发细节与文档站重复。** 生产部署变量清单、nginx 转发规则、运维要点等在原 README 里是一份独立副本，而 `docs/advanced/deployment.md` 才是这些事实的 Owner，两份会漂移。

## 决策

1. **README 采用产品落地页结构**（对齐同类项目的排版）：定位段 → 一行主链接 → 徽标 → 「能做什么」→ 快速启动 → 文档导航 → 能力展示（表格 + 分模块小节 + 截图）→ 本地开发与验证 → 参与贡献 → 许可证。
2. **事实取材自文档站与仓库，不复制文档正文**：快速启动只保留「获取代码 → 初始化 → 启动 → 校验 ready」四步与端口表，其余（生产部署变量、升级与迁移、nginx 转发、排障）保留在 `docs/advanced/deployment.md` 并在 README 里链接过去；命令与变量名逐条对照 `docs/intro/quick-start.md`、`.env.template`、`docker-compose.yml`、`Taskfile.yml` 后写。
3. **能力展示按七个模块**（工作台、知识库与 RAG、知识图谱、多智能体与扩展生态、沙盒工作区与产物、运行质量与评估、团队治理与运行管理），模块的 bullets 取当前实现里可核对的行为；截图复用 `web/public/assets/home/` 下文档站首页同一批产品截图，按仓库相对路径引用，GitHub 直接渲染。
4. **徽标只保留可核对项**：License MIT（静态徽标，依据两个 `pyproject.toml` 的声明）、GitHub stars（实时）、Python 3.13 / React 19（分别链接 `backend/pyproject.toml`、`web/package.json`）、Docker Compose（链接 `docker-compose.yml`）。没有 releases、没有镜像仓库、没有 DeepWiki/Bilibili/视频，因此不出现对应徽标或链接。
5. **版本号写当前仓库实际值**：`v0.7.2.beta1`（`backend/pyproject.toml` 与 `web/package.json`），并说明本仓库目前只有默认分支 `master`；`docs/intro/quick-start.md` 里那个 `--branch v0.7.2.beta1` 的克隆命令在本仓库不存在该分支，同一变更里改成克隆默认分支（否则 README 的「快速开始」入口指向一条跑不通的命令）。

## 替代方案

1. **保留原「开发与部署」结构，只更新过期地址**：问题 1 没有解决，仓库首页对非贡献者仍是空的。
2. **README 全量收录文档正文（部署变量、运维、架构）**：与文档站形成两份会漂移的副本，且 README 变得不可读。
3. **自动生成 README**：能力表与徽标可以生成，但定位段、模块排序与截图取舍是编辑判断，生成器只会把当前措辞固化，不值得引入新工具。
4. **为「展开详细截图」加 `<details>` 折叠区**：本仓库每个模块只有一张截图，没有第二张可展开内容，加折叠区只会多一层点击。

## 后果

- 仓库首页的定位与文档站首页（`docs/theme/home`）说同一件事，两处文案独立维护；改产品定位要同时改 README 与文档站首页。
- README 里的截图路径指向 `web/public/assets/home/`：这批文件被文档站首页共用，移动或改名会同时打断文档站构建与 README 渲染。
- README 不写生产部署细节，读者要按链接进入文档站；文档站当前仍以 ARS 作为站点标题、正文里还残留上游仓库引用，README 用的是改名后的仓库地址与站点路径，二者的差异属于后续的改名清扫（见 [2026-10-16 站点路径记录](./2026-10-16-docs-base-path-rename.md)）。
- 徽标里的 stars 数由 shields.io 实时取，离线或限流时徽标自身会显示占位，不影响 README 文本。

## 验证

- README 里每个仓库相对链接指向的文件都存在（`ARCHITECTURE.md`、`web/ARCHITECTURE.md`、`docker-compose.yml`、`.env.template`、`CONTRIBUTING.md`、`docs/develop-guides/decisions/README.md`）；六张截图的引用路径都在 `web/public/assets/home/` 下存在。
- 命令逐条对照事实源：`./scripts/init.sh` / `scripts/init.ps1` / `.env.template` 存在；`docker compose up --build -d`、`docker compose ps`、`curl --fail http://localhost:5050/api/system/ready` 与 `docs/intro/quick-start.md` 一致；端口 5173 / 5050 与文档一致；`task up-lite`、`task verify`、`task web:verify`、`task web:dev`、`task web:api`、`task ps|logs|shell|down|reset` 都在 `Taskfile.yml` 里存在，`reset` 确为破坏性目标。
- 站点链接：README 使用 `https://zhongye1.github.io/KnowAgenticRAG/` 及其 8 个子页面，`curl` 复核该前缀与仓库改名后的 Pages 路径一致（Pages 上的具体页面要等一次成功部署后逐条复核，见未验证范围）。
- 版本号 `v0.7.2.beta1` 与 `backend/pyproject.toml`、`web/package.json` 的实际取值一致；`curl` 复核该仓库没有 tags/releases，克隆命令因此不写 `--branch`。
- 未验证：GitHub 上 README 的最终渲染（徽标与截图的显示效果只有推送后才能在仓库首页确认）；文档站子页面在 Pages 上的可达性（依赖一次成功部署）。
