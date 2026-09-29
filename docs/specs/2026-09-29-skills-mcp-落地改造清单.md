---
title: 技能与 MCP 落地改造清单
description: RAG-F 技能（Skills）与 MCP 补齐清单：全形态技能（含沙盒投影、脚本执行、渐进式披露、工具门控）、MCP 双向（服务端保留 + 客户端接入）；含 Yuxi 借鉴项的移植性标注与目标文件结构树
---

# 技能与 MCP 落地改造清单（Spec）

## 0. 文档信息

| 项       | 内容                                                                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 状态     | 待评审                                                                                                                                                                                                                                                                       |
| 日期     | 2026-09-29                                                                                                                                                                                                                                                                   |
| 性质     | 能力从零建设 + 双向 MCP 扩展；决策编号 D73–D78                                                                                                                                                                                                                               |
| 范围     | **新增 `skills` 独立域**；`app/mcp` 扩展为双向；门控中间件落 `app/agent/middlewares/skills.py`                                                                                                                                                                               |
| 参照实现 | Yuxi（MIT）`backend/package/yuxi/agents/{skills,mcp,middlewares/skills.py,toolkits}/**`                                                                                                                                                                                      |
| 上游文档 | [2026-09-05-agent-layer-and-mcp-design.md](./2026-09-05-agent-layer-and-mcp-design.md)（D18/D24/D25/D30/D33）、[2026-09-12-agentic-rag-落地改造清单.md](./2026-09-12-agentic-rag-落地改造清单.md)（D39 不引 DeepAgents——**保持**）                                           |
| 联动文档 | [2026-09-29-agent-落地改造清单.md](./2026-09-29-agent-落地改造清单.md)（**Phase 0 工作区/沙盒 + Phase 3.6 工具注册表是本清单硬前置**）、[2026-09-29-kb-落地改造清单.md](./2026-09-29-kb-落地改造清单.md)、[2026-09-29-rag-落地改造清单.md](./2026-09-29-rag-落地改造清单.md) |
| 代码基线 | `refactor/ORCA`；Skills 后端零实现；MCP 服务端 5 只读工具已上线                                                                                                                                                                                                              |

### 0.1 全局前置约束

同 [知识库清单 §0.1](./2026-09-29-kb-落地改造清单.md)：**未上线、无迁移层兼容**（`create_all`、不回填、不双写、不灰度、前端 `generated/` 全量重生成）。

---

## 1. 背景与目标

### 1.1 背景

**Skills：完全空白。** 后端全仓 `grep -rin "skill" backend/src --include=*.py` **零命中**；前端 `frontend/src/app/routes/app/knowledge/skills/page.tsx:6-16` 只渲染「技能建设中」，`features/knowledge/components/skills/` 只有空 `.gitkeep`。入口（路由/路径/标签页）已铺好但无实现，且既有 spec 明确把「Skills 安装」列为非目标（`2026-09-12-agentic-rag-落地改造清单.md:31`）。

**MCP：方向单一。** 当前是**服务端暴露**——`POST /mcp` JSON-RPC 2.0 子集，5 个只读工具，JWT + Redis 会话 + PAT 常量时间鉴权，调用审计表 + OTel + 限流。**没有客户端接入能力**，Agent 无法消费外部 MCP server 的能力（图表、搜索、数据库等）。

### 1.2 目标

1. 建立**全形态技能体系**：数据模型 + 宿主文件系统 + 沙盒投影 + 渐进式披露 + 依赖工具门控 + 安装（本地上传 / 远程）+ 权限 + 前端管理面；
2. 把现有 4 个只读工具收进**技能依赖**，使 `knowledge-base` 成为一个真正的 Skill（对齐 Yuxi 的形态），而不是硬编码工具集；
3. MCP 补**客户端接入**：外部 MCP server 的注册/测试/工具发现/开关，工具进 Agent 工具面且受技能门控；
4. 保留并扩展**服务端暴露**：随知识库能力补齐（导图、版本、导出）同步扩展对外工具面。

### 1.3 非目标

- **不引入 DeepAgents**：延续 D39。Yuxi 的 `SkillsMiddleware` 复用 deepagents 的 `SKILLS_SYSTEM_PROMPT` 与 `read_file` 语义，本项目**自研等价逻辑**（提示词自己写、激活通道挂在自己的沙盒文件工具上）；
- **不做 Skill 市场 / 版本共存 / 回滚**：Yuxi 的 `version` / `content_hash` 只服务内置同步，本项目同样只做「内置同步 + 用户自装」，不做多版本并存；
- **不做 MCP 服务端的批量请求与 GET 长连接会话协商**：延续既有 MVP 边界（`mcp/api/router.py` 文档字符串）；
- **不搬 Yuxi 的 `sandbox-provisioner` 与远程安装的沙盒供应商路径**（依赖本项目没有的基础设施）；
- **不做技能的写工具自授权**：技能带来的写工具（文件写、命令执行）必须过审批闸（[智能体清单] Phase 2.2），技能不能自行豁免。

---

## 2. 现状基线（2026-09-29 实读）

### 2.1 Skills

| 能力         | 落点                                                                                                 | 状态           |
| ------------ | ---------------------------------------------------------------------------------------------------- | -------------- |
| 后端任何实现 | `grep -rin "skill" backend/src --include=*.py` → 0 命中                                              | **无**         |
| 前端页面     | `frontend/src/app/routes/app/knowledge/skills/page.tsx:6-16`                                         | **占位**       |
| 前端组件目录 | `frontend/src/features/knowledge/components/skills/`（仅 `.gitkeep`）                                | **空**         |
| 路由与入口   | `frontend/src/config/paths.ts:48-50`、`frontend/src/app/router.tsx:111-115`、`knowledge-tabs.tsx:12` | 已铺好         |
| 决策状态     | `2026-09-12-agentic-rag-落地改造清单.md:31,174,519`                                                  | 明确列为非目标 |

### 2.2 MCP（服务端，已落地）

| 能力                                                         | 落点                                                                            | 状态     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------- |
| JSON-RPC 2.0 子集（initialize/ping/tools/list/tools/call）   | `mcp/api/router.py:204,284-303`                                                 | 完整     |
| 无状态单帧 streamable HTTP（按 `Accept` 返回 JSON 或 SSE）   | `mcp/api/router.py:85-102,207`                                                  | 完整     |
| stdio 桥接（本地进程 → 远程 HTTP）                           | `backend/scripts/mcp_bridge.py`                                                 | 完整     |
| 三类凭证归一（JWT 直通 / Redis 会话存活 / PAT 常量时间比对） | `mcp/auth.py:49-93`（fail-closed）                                              | 完整     |
| 工具裁剪（`tools/list` 按 RBAC 权限动态裁剪）                | `mcp/auth.py:112-120`                                                           | 完整     |
| 5 个只读工具 + 参数级授权稳定错误码                          | `mcp/service.py:86-127,392-406`                                                 | 完整     |
| 调用审计表 + OTel + 租户级限流                               | `mcp/call_log.py:34-60`、`mcp/model/mcp_call_log.py:20-42`、`router.py:129-153` | 完整     |
| **MCP 客户端接入**                                           | 全仓无 `MultiServerMCPClient` 等价物                                            | **无**   |
| **MCP server 管理面（注册/测试/工具开关）**                  | 前端 `knowledge/mcp/page.tsx` 是占位                                            | **无**   |
| **MCP 工具进 Agent 工具面**                                  | Agent 工具面是硬编码 4 工具（`agent/graph/tools.py:87-237`）                    | **无**   |
| 服务端会话模式（GET 长连接）                                 | 明确 405 未实现                                                                 | 有意不做 |

---

## 3. 差距表

| 维度           | 现状            | 目标                                | 缺口性质                  |
| -------------- | --------------- | ----------------------------------- | ------------------------- |
| Skills 存在性  | 零              | 全形态（存储/投影/披露/门控/安装）  | 从零建设                  |
| 工具可见性     | 固定 4 个恒可见 | 基础工具 + 被技能门控的工具         | 机制缺失                  |
| 工具与技能关系 | 硬编码          | 三类显式依赖（tool/mcp/skill）      | 模型缺失                  |
| 沙盒内脚本执行 | 无              | 技能目录可 `cd` + 执行脚本          | 依赖 [智能体清单] Phase 0 |
| 安装           | 无              | ZIP 上传 + 远程安装（零信任）       | 能力缺失                  |
| 技能权限       | 无              | 复用 ACL v2                         | 需定决策                  |
| MCP 方向       | 仅服务端        | 双向                                | 能力缺失                  |
| MCP 工具归属   | 不适用          | 受技能 `mcp_dependencies` 门控      | 机制缺失                  |
| MCP 管理面     | 无              | server CRUD / 连通性测试 / 工具开关 | 能力缺失                  |

---

## 4. 关键决策

| #       | 决策                                                                                                                                                                                          | 备选项与否决理由                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D73** | 技能权限**复用本项目 ACL v2**（`rag_kb_acl` 同构的 `rag_skill_acl` + 同一 `resolver`），**不引 Yuxi 的 `share_config` 三级模型**                                                              | 备选：照搬 Yuxi 的 `share_config`（`access_level: global/department/user` + 角色上限，`permissions/resource_permission.py:43,61-84`）。否决理由：本项目 ACL v2 已是更强模型（allow/deny 双语义、`expires_at`、主体四类含 group、append-only 审计、default deny），再引一套三级权限会导致同一平台两套授权语义、两套前端 UI、两套审计；且技能与知识库的共享范围天然同构，共用一个 resolver 才是收敛方向                                                                                                                                   |
| **D74** | 工具门控采用**注册与可见性两步解耦**：技能依赖工具在构建期**全量注册**进 ToolNode，可见性由中间件在**每次模型调用前**按 `gated − activated` 过滤 `request.tools`                              | 备选：只在激活时把工具加入。否决理由：模型激活技能后发起的调用要靠 ToolNode 执行，若未注册会报 `not a valid tool`（Yuxi 已在 `toolkits/service.py:138-151` 用注释显式记录这个坑）。备选：不做门控，工具恒可见。否决理由：那就丢掉了 Skills 的核心价值——按需加载、减少提示词与工具选择的干扰、降低误调用                                                                                                                                                                                                                                 |
| **D75** | 技能文件系统投影 = **沙盒内 bind-mount**：共享/内置技能以**只读**挂载到沙盒 `/skills/{slug}`，个人技能以**读写**挂载到 `/user-skills/{slug}`；**不做** Yuxi 式的宿主侧差量复制 + 虚拟路径映射 | 备选：照搬 Yuxi 的复制投影（`skills/service.py:341-432`：临时目录 → `skill_dirs_equal` 差量 → rename → 逐 uid 文件锁 + PG advisory lock）。否决理由：那套机制的存在前提是**沙盒在远端、无法 bind-mount 宿主目录**（Yuxi 的 provisioner 架构）；本项目一期沙盒是本地受限子进程（[智能体清单] D68），bind-mount 直接在挂载点呈现授权视图，省掉整个复制/差量/锁/一致性校验层。**代价**：内置 SKILL.md 里的路径引用要改写（Yuxi 写 `cd /home/gem/skills/mysql-reporter`，本项目写 `cd /skills/mysql-reporter`），移植内置技能时必须逐份校对 |
| **D76** | 技能的依赖工具**必须启动期可枚举**（工具注册表 + 装饰器收集），运行期动态生成的工具不纳入门控                                                                                                 | 备选：允许运行期注册。否决理由：门控要在「构建 ToolNode」时就注册全部潜在工具，运行期才知道的工具无法被预注册，会退化成 D74 的 `not a valid tool` 问题。这是移植门控机制的**硬约束**，也是 [智能体清单] Phase 3.6 必须是前置的原因                                                                                                                                                                                                                                                                                                      |
| **D77** | MCP 客户端 **transport 白名单**：用户创建的 MCP server 仅允许 `sse` / `streamable_http`；`stdio` **仅限代码内置**的 server                                                                    | 备选：允许用户建 stdio。否决理由：stdio 意味着在服务端进程里执行用户提交的命令行，等价于 RCE。Yuxi 同样禁止（`agents/mcp/service.py:429-430,483-484`「用户创建的 MCP 仅支持 sse 或 streamable_http，不允许启动 stdio 本地进程」），且它更进一步在启动时**禁用历史 stdio 配置**（`mcp/service.py:78-80,113-123`）                                                                                                                                                                                                                        |
| **D78** | MCP 工具**不无条件进模型可见集**：由技能的 `mcp_dependencies` 决定，未激活技能对应的 MCP 工具对模型不可见；MCP 工具与本地工具**同源同门控**                                                   | 备选：所有已启用 MCP 工具恒可见。否决理由：与 D74 的门控语义不一致（本地工具按需、MCP 工具全给），会让模型面对一个随部署环境漂移的大工具集；且 MCP 工具数量不可控，全给会挤占上下文并放大误调用面。备选：MCP 工具完全独立于技能体系。否决理由：那技能就无法编排「用图表 MCP 画图」这类跨来源能力，而 `mysql-reporter` 这类技能正是靠它成立的                                                                                                                                                                                            |

---

## 5. 分期清单

### Phase 1 — 技能本体（D73/D75）

| 编号 | 落点                                     | 改动                                                                                                                                                                                                                        | 验收                         |
| ---- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1.1  | `app/skills/model/skill.py`（🆕）        | `skills`：`slug` PK、`name`、`description`、`source_type`（`builtin`/`upload`/`remote`）、三类依赖 JSON（`tool_dependencies`/`mcp_dependencies`/`skill_dependencies`）、`dir_path`、`content_hash`、`enabled`、`created_by` | 聚合导出                     |
| 1.2  | `app/skills/model/skill_acl.py`（🆕）    | `rag_skill_acl`：与 `kb/model/acl.py:30-60` 同构（四 perm × allow/deny × `expires_at` × 四类主体）（D73）                                                                                                                   | 复用同一 resolver            |
| 1.3  | `app/skills/crud/crud_skill.py`（🆕）    | 列表（含权限过滤）/ 详情 / 启停 / 依赖更新 / 删除                                                                                                                                                                           | —                            |
| 1.4  | `app/skills/service/repository.py`（🆕） | 仓储门面                                                                                                                                                                                                                    | —                            |
| 1.5  | `app/skills/service/service.py`（🆕）    | SKILL.md frontmatter 解析（`name`/`slug`/`description` 必填校验）、`content_hash` 计算、ZIP 解压安全（拒绝对路径与 `..` 穿越）、导入/导出                                                                                   | 恶意 ZIP 被拒的单测          |
| 1.6  | `app/skills/service/runtime.py`（🆕）    | `RuntimeSkill` 构建（slug → `{path, tools, mcps, skills}`）、依赖闭包 DFS + **环检测**、预加载内容读取（拒符号链接）                                                                                                        | 环形依赖被拒；闭包正确性单测 |
| 1.7  | `app/skills/service/projection.py`（🆕） | 生成沙盒挂载清单（授权技能 → 挂载点映射），交由 `workspace.sandbox` 执行（D75）                                                                                                                                             | 未授权技能不出现             |
| 1.8  | `app/skills/buildin/**`（🆕）            | 内置技能目录 + 启动时同步（`init_builtin_skills`）；**SKILL.md 路径引用按 D75 改写**                                                                                                                                        | 启动后库内有 5 条内置        |
| 1.9  | `app/skills/api/v1/skills.py`（🆕）      | 列表 / 详情 / 启停 / 文件树 / 文件读写 / 依赖配置 / 共享配置 / 导出                                                                                                                                                         | OpenAPI 可见                 |
| 1.10 | `app/router.py` + `pyproject.toml`       | 挂载 skills 域；independence 加 `skills`，`agent → skills` 豁免（注明 D74/D78）                                                                                                                                             | `lint-imports` 0 broken      |

### Phase 2 — 门控与激活（D74/D76）· 依赖 [智能体清单] Phase 0 + 3.6

| 编号 | 落点                                              | 改动                                                                                                                                                                     | 验收                              |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| 2.1  | `app/agent/toolkits/buildin/skill_tools.py`（🆕） | 已激活技能的脚本入口工具（在沙盒内 `cd /skills/{slug}` 执行）                                                                                                            | 脚本可执行且受沙盒约束            |
| 2.2  | `app/agent/middlewares/skills.py`（🆕）           | 提示段注入（懒加载技能只给 `slug + description`；预加载技能给完整正文）、`activated_skills` state、依赖展开、`gated − activated` 过滤 `request.tools`、动态 MCP 工具挂载 | 未激活技能的工具对模型不可见      |
| 2.3  | `app/agent/graph/builder.py`                      | 装配 skills 中间件；构建期**全量注册**依赖工具（D74）                                                                                                                    | 激活后调用不报 `not a valid tool` |
| 2.4  | 沙盒文件工具                                      | `read_file` 命中 `/skills/{slug}/SKILL.md` → 写回 `activated_skills`（动态激活）                                                                                         | 模型读 SKILL.md 即激活            |
| 2.5  | `app/agent/middlewares/approval.py`               | 技能带来的写工具纳入审批 `interrupt_on`                                                                                                                                  | 技能不能自行豁免审批              |
| 2.6  | `knowledge-base` Skill（🆕）                      | 把现有 4 只读工具（`agent/graph/tools.py:87-237`）收进 `knowledge-base` 技能的 `tool_dependencies`；新建库元数据工具（导图/示例问题，依赖 [知识库清单] Phase 4）         | 未激活时 4 工具不可见             |

### Phase 3 — 安装（D73/D77）

| 编号 | 落点                                                | 改动                                                                                                 | 验收                                     |
| ---- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 3.1  | `app/skills/service/install.py`（🆕）               | **本地上传**：ZIP 校验（路径穿越、大小、文件数、扩展名白名单）→ 落宿主技能目录 → 登记 ACL            | 恶意 ZIP 全部被拒                        |
| 3.2  | `app/skills/service/remote_install.py`（🆕）        | **远程安装**：强制 HTTPS + host 白名单 + 一次性**无凭据**沙盒执行（`inherit_env=False`）+ 仅回传产物 | 非白名单 host 被拒；沙盒内不可见平台凭据 |
| 3.3  | `app/agent/toolkits/buildin/install_skill.py`（🆕） | `install_skill` 工具（模型可发起安装）；**子智能体内禁用**                                           | 子智能体调用被拒                         |
| 3.4  | `app/skills/api/v1/install.py`（🆕）                | 安装草稿 → 确认落库的两阶段接口                                                                      | 草稿 TTL 过期                            |

### Phase 4 — MCP 双向（D77/D78）

| 编号 | 落点                                            | 改动                                                                                                                                                                                       | 验收                         |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| 4.1  | `app/mcp/model/mcp_server.py`（🆕）             | `mcp_servers`：`slug`、`transport`（`sse`/`streamable_http`/`stdio`）、`url`/`command`/`args`/`env`/`headers`、`timeout`、`sse_read_timeout`、`enabled`、`disabled_tools`、`is_builtin`    | 聚合导出                     |
| 4.2  | `app/mcp/client/transport.py`（🆕）             | transport 白名单校验（D77）：用户建 server 拒绝 `stdio`；内置 server 允许                                                                                                                  | 用户建 stdio 被拒            |
| 4.3  | `app/mcp/client/service.py`（🆕）               | 客户端接入（`langchain-mcp-adapters` 或等价）；工具发现 → LangChain 工具；命名空间 `mcp__{server}__{tool}`；`config_hash` 失效缓存；**失败降级为 warning + 空工具集**（不阻断 Agent 运行） | server 不可达时 Agent 仍可跑 |
| 4.4  | `app/mcp/service.py`（既有）                    | 内置 server 定义 + 启动时同步（代码定义为准覆盖连接字段；退役 slug 清理）                                                                                                                  | 启动幂等                     |
| 4.5  | `app/mcp/api/v1/servers.py`（🆕）               | server CRUD / 连通性测试 / 状态切换 / 工具列表与刷新 / 单工具开关                                                                                                                          | OpenAPI 可见                 |
| 4.6  | `app/agent/middlewares/skills.py`               | MCP 工具按 `mcp_dependencies` 门控（D78）：未激活技能对应的 MCP 工具不挂载                                                                                                                 | 未激活时不出现               |
| 4.7  | `app/mcp/service.py`                            | **服务端工具面扩展**：随知识库能力补齐增加 `get_mindmap` / `list_document_versions` / `export_database` 等只读工具；权限点继续复用 `rag:kb:*`（`kb/utils/permissions.py:24-38`）           | `tools/list` 按权限裁剪正确  |
| 4.8  | 前端 `features/knowledge/components/mcp/`（🆕） | server 列表 / 表单 / 工具开关（替换现有占位页）                                                                                                                                            | —                            |

### Phase 5 — 前端技能管理面

| 编号 | 落点                                                       | 改动                                                  | 验收                          |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------- | ----------------------------- |
| 5.1  | `frontend/src/features/knowledge/components/skills/`（🆕） | 技能卡片列表 + 详情（文件树/依赖/共享配置/启停/导出） | 替换 `skills/page.tsx` 的占位 |
| 5.2  | —                                                          | 安装流程（本地上传 / 远程搜索与草稿确认）             | —                             |
| 5.3  | —                                                          | 权限配置 UI（与 [知识库清单] ACL UI 共用组件）        | —                             |

---

## 6. Yuxi 借鉴列（含移植性标注）

> 移植性四档：**直接搬** / **改写** / **重写** / **不可搬**。

### 6.1 Skills

| Yuxi 能力                                    | 源路径                                                                                            | 移植性             | 落点与改造要点                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Skill` 表结构（含三类依赖列）               | `storage/postgres/models_business.py:313-336`                                                     | **直接搬**         | 字段设计（`source_type` / `tool_dependencies` / `mcp_dependencies` / `skill_dependencies` / `content_hash` / `enabled`）原样可用；本项目额外挂 ACL（D73 替代 `share_config`）                                                                                     |
| 技能仓储                                     | `agents/skills/repository.py:14-148`                                                              | **直接搬**         | `list_enabled` / `get_by_slug` / `update_dependencies` / `update_enabled` 等查询原样可用，换 ORM 基类                                                                                                                                                             |
| SKILL.md frontmatter 解析与校验              | `agents/skills/service.py:763-807`（`slug` 与 `name` 一致性、`description` 必填、`content_hash`） | **直接搬**         | 纯解析逻辑，无依赖                                                                                                                                                                                                                                                |
| ZIP 解压安全校验                             | `agents/skills/service.py:823-829`                                                                | **直接搬**         | 路径穿越拦截是安全关键代码，照搬                                                                                                                                                                                                                                  |
| 依赖闭包 + 环检测                            | `agents/skills/runtime.py:41-94`                                                                  | **直接搬**         | `build_runtime_skills` / `expand_skill_closure` 的 DFS + 栈环检测原样可用                                                                                                                                                                                         |
| 预加载正文读取（拒符号链接）                 | `agents/skills/runtime.py:134-151`                                                                | **改写**           | `open_regular_file_fd` 的 no-follow 语义可用；本项目的 no-follow 原语在 `workspace/service/filesystem.py`（[智能体清单] 0.3），复用它而非另起一套                                                                                                                 |
| **工具门控（注册与可见性解耦）**             | `agents/middlewares/skills.py:100-139` + `toolkits/service.py:138-151`                            | **改写**           | **这是唯一不可省略的机制**（D74）。门控判定逻辑（`gated − activated` → 过滤 `request.tools`）可整体搬；但 Yuxi 的中间件继承 LangChain `AgentMiddleware` 并复用 deepagents 的 `SKILLS_SYSTEM_PROMPT`，本项目须自研提示词与 `read_file` 激活通道（不引 DeepAgents） |
| 提示段注入（懒加载仅摘要 / 预加载给正文）    | `agents/middlewares/skills.py:71-89,286-297`                                                      | **改写**           | 分段策略（懒加载只给 `slug + description`，预加载给完整 SKILL.md）可直接照用；提示词文本自己写                                                                                                                                                                    |
| 动态激活（`read_file` 命中 SKILL.md）        | `agents/middlewares/skills.py:203-220,254-269`                                                    | **改写**           | 触发时机与 state 写回语义可照搬；依赖本项目的沙盒文件工具（[智能体清单] Phase 0）                                                                                                                                                                                 |
| 共享技能只读投影（差量复制 + 双锁）          | `agents/skills/service.py:341-432`                                                                | **不可搬**         | 存在前提是远端沙盒无法 bind-mount；本项目改用沙盒内 bind-mount（D75），整个复制/差量/一致性层不需要                                                                                                                                                               |
| 个人技能存 UserWorkspace                     | `agents/skills/service.py:76,862-866`                                                             | **改写**           | 「个人技能不入库、只活在用户工作区」的取舍可沿用；落点换成本项目 `workspace` 域的 UserWorkspace                                                                                                                                                                   |
| 内置技能同步（PG advisory lock）             | `agents/skills/service.py:1717-1784`、`server/utils/lifespan.py:90-102`                           | **改写**           | 「启动时以代码定义为准同步 DB 行 + 替换磁盘目录」的语义可用；本项目用 lifespan 钩子（`common/lifespan.py` 已有机制）+ 单实例部署，advisory lock 可保留但非必需                                                                                                    |
| 5 个内置 SKILL.md 正文                       | `agents/skills/buildin/*/SKILL.md`                                                                | **改写**           | `knowledge-base` / `deep-research` / `html-preview` / `image-gen` / `mysql-reporter` 的方法论正文可直接用；**必须改写沙盒路径引用**（`/home/gem/skills/...` → `/skills/...`，D75）与工具名（对齐本项目命名）                                                      |
| `mysql-reporter` 脚本                        | `agents/skills/buildin/mysql-reporter/scripts/*.py`                                               | **直接搬**         | 三个只读脚本（list/describe/query）原样可用                                                                                                                                                                                                                       |
| 远程安装（HTTPS + host 白名单 + 无凭据沙盒） | `agents/skills/remote_install.py:55-57,102-143,213-217`                                           | **不可搬（一期）** | 依赖一次性沙盒供应商路径；一期只做「执行命令于受限沙盒」的等价物（D68 的受限子进程），若无法保证无凭据则**降级为不支持远程安装**并显式报错，不做不安全实现                                                                                                        |
| `install_skill` 工具（含子智能体禁用）       | `agents/toolkits/buildin/install_skill.py:82-92,119-214`                                          | **改写**           | 「子智能体内禁用安装」这条红线照搬；来源类型（沙盒路径 / Git）按一期能力裁剪                                                                                                                                                                                      |
| `share_config` 三级权限                      | `permissions/resource_permission.py:43,61-84`                                                     | **不可搬**         | 用 ACL v2 替代（D73）                                                                                                                                                                                                                                             |
| 存储迁移                                     | `storage_migrations/v071_skills.py`                                                               | **不可搬**         | 本项目未上线，无迁移层（§0.1）                                                                                                                                                                                                                                    |

### 6.2 MCP

| Yuxi 能力                                | 源路径                                                                 | 移植性                   | 落点与改造要点                                                                                                                                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP 客户端接入（`MultiServerMCPClient`） | `agents/mcp/service.py:181-192`                                        | **改写**                 | 「一个客户端对象持有多个 server 配置、按需取工具」的形态可用；本项目若用 `langchain-mcp-adapters` 则写法不同，但 `_to_runtime_mcp_config`（:83-102）的配置字段裁剪（transport/url/command/args/env/headers/timeout/sse_read_timeout）可直接照用 |
| transport 白名单（用户禁 stdio）         | `agents/mcp/service.py:37,429-430,483-484`                             | **直接搬**               | 安全关键策略，连错误文案都可沿用（D77）                                                                                                                                                                                                         |
| 内置 server 启动同步                     | `agents/mcp/service.py:104-160`                                        | **改写**                 | 「代码定义为准覆盖连接字段 + 退役 slug 删除 + 禁用历史 stdio」三条语义都可搬；本项目 `lifespan` 机制已在（`common/lifespan.py`），接入方式不同                                                                                                  |
| 工具命名空间 `mcp__{server}__{tool}`     | `agents/mcp/service.py:304-315`                                        | **改写**                 | 命名空间思路照搬；Yuxi 转 camelCase，本项目保持 snake_case 以对齐 Python 工具命名习惯                                                                                                                                                           |
| `config_hash` 缓存失效                   | `agents/mcp/service.py:283-324`                                        | **直接搬**               | 配置变更 → 缓存失效的键设计原样可用                                                                                                                                                                                                             |
| 失败降级（warning + 空工具集）           | `agents/mcp/service.py:277-279,339-344`、`toolkits/service.py:121-128` | **直接搬**               | 「MCP 不可用不阻断 Agent」的语义照搬                                                                                                                                                                                                            |
| 工具级开关（`disabled_tools`）           | `agents/mcp/service.py:565-611`                                        | **直接搬**               | 单工具禁用逻辑可用                                                                                                                                                                                                                              |
| MCP 管理面（CRUD/测试/状态/工具刷新）    | `server/routers/mcp_router.py:100-425`                                 | **改写**                 | 端点集合（list/create/get/update/delete/test/status/tools/refresh/toggle）可整体对照实现；响应包装换 fba `ResponseSchemaModel`                                                                                                                  |
| MCP 调用审计                             | 复用通用 `tool_calls` 表                                               | **不可搬（本项目更强）** | 本项目已有专表 + OTel + 限流（`mcp/call_log.py`、`mcp/model/mcp_call_log.py`），不降级                                                                                                                                                          |
| **MCP 服务端暴露**                       | —                                                                      | **不可搬（本项目独有）** | Yuxi **没有** MCP 服务端；`POST /mcp` JSON-RPC、PAT 鉴权、`tools/list` 按权限裁剪、stdio 桥全部为本项目既有资产，继续演进（4.7）                                                                                                                |

---

## 7. 跨文档依赖

| 本清单项                         | 依赖                                                                                                               | 被依赖                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| Phase 1 技能本体                 | —                                                                                                                  | Phase 2 门控                |
| **Phase 2 门控与激活**           | **[智能体清单] Phase 0**（沙盒 bind-mount、文件工具）+ **Phase 3.6**（工具注册表，D76）+ Phase 2.2（写工具审批闸） | `knowledge-base` 等内置技能 |
| Phase 2.6 `knowledge-base` Skill | [知识库清单] Phase 4（示例问题/导图工具）+ [RAG 清单] Phase 3（章节摘要）                                          | —                           |
| Phase 3 安装                     | Phase 1；远程安装额外依赖沙盒无凭据能力                                                                            | —                           |
| Phase 4 MCP 双向                 | [智能体清单] Phase 3.6（工具注册表）+ Phase 2.2（审批）                                                            | —                           |
| Phase 4.7 服务端工具扩展         | [知识库清单] Phase 2/4（版本、导图）                                                                               | —                           |
| Phase 5 前端                     | Phase 1–4                                                                                                          | —                           |

**关键路径**：`[智能体清单] Phase 0 + Phase 3.6` → 本清单 Phase 1 → Phase 2。**技能不能先于工作区/沙盒与工具注册表开工。**

---

## 8. 目标文件结构树

```text
backend/src/app/skills/                    🆕 独立域
├── api/v1/
│   ├── install.py                         安装草稿 → 确认（本地上传 / 远程）
│   ├── skills.py                          列表/详情/启停/文件树/依赖/共享/导出
│   └── router.py
├── crud/crud_skill.py                     仓储（直接搬 Yuxi repository.py）
├── model/
│   ├── skill.py                           skills（三类依赖列）
│   ├── skill_acl.py                       rag_skill_acl（同构 kb ACK，D73）
│   └── __init__.py                        聚合导出（铁律 4）
├── schema/{skill,install}.py
├── service/
│   ├── repository.py                      仓储门面
│   ├── service.py                         frontmatter 解析 / ZIP 校验 / 导入导出 / 内置同步
│   ├── runtime.py                         RuntimeSkill / 依赖闭包 / 预加载读取
│   ├── projection.py                      沙盒挂载清单（D75）
│   ├── install.py                         本地上传安装
│   └── remote_install.py                  远程安装（零信任）
└── buildin/                               内置技能（SKILL.md 路径引用按 D75 改写）
    ├── knowledge-base/SKILL.md            ⚠️ 依赖 4 只读工具 + 导图/示例问题
    ├── deep-research/SKILL.md             依赖子智能体（[智能体清单] Phase 3.8）
    ├── html-preview/SKILL.md
    ├── image-gen/SKILL.md
    └── mysql-reporter/{SKILL.md,scripts/{list_tables,describe_table,query}.py}

backend/src/app/mcp/                       ✏️ 扩展为双向
├── api/
│   ├── router.py                          （既有：服务端 JSON-RPC 面）
│   └── v1/servers.py                      🆕 客户端管理面（CRUD/测试/工具开关）
├── client/                                🆕 客户端接入
│   ├── service.py                         工具发现 / 命名空间 / 缓存失效 / 降级
│   └── transport.py                       transport 白名单（D77）
├── model/
│   ├── mcp_call_log.py                    （既有：调用审计）
│   └── mcp_server.py                      🆕 客户端 server 配置
├── auth.py / call_log.py / schemas.py     （既有）
└── service.py                             ✏️ 内置 server 同步 + 服务端工具面扩展（4.7）

backend/src/app/agent/
├── middlewares/skills.py                  🆕 门控中间件（D74/D78，语义由本清单定义）
└── toolkits/
    ├── registry.py                        🆕（[智能体清单] Phase 3.6，D76 前置）
    ├── service.py                         🆕 工具枚举与元数据
    └── buildin/
        ├── tools.py                       ✏️ 现有 4 只读工具收编
        ├── skill_tools.py                 🆕 技能脚本执行入口
        └── install_skill.py               🆕 安装工具（子智能体禁用）

backend/src/app/router.py                  ✏️ 挂载 skills 域
backend/pyproject.toml                     ✏️ import-linter：+skills 与 agent→skills 豁免（D74/D78）

frontend/src/features/knowledge/components/
├── skills/                                🆕 卡片列表 / 详情 / 文件树 / 依赖 / 共享 / 安装
├── mcp/                                   🆕 server 列表 / 表单 / 工具开关
└── shared/                                ✏️ ACL 配置组件（与知识库共用）
frontend/src/app/routes/app/knowledge/
├── skills/page.tsx                        ✏️ 替换占位
└── mcp/page.tsx                           ✏️ 替换占位
```
