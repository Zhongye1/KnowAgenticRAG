# Skills 管理系统

Skill 将使用说明、提示词、工具依赖和领域资料组织为可复用目录。Agent 读取 `SKILL.md` 后按声明激活对应能力。

## 为什么需要 Skills

重复使用的 API 调用流程、外部服务操作和领域提示可以封装为独立 Skill。每个 Skill 保存说明文件、资源和依赖元数据，Agent 配置决定当前运行可见的 Skill 集合。

## 架构设计

共享/内置 Skill 使用独立 Skill 持久域，采用「文件系统存内容，数据库存索引」；个人 Skill 则属于
UserWorkspace，按 uid 隔离，不进入共享 Skill 数据表，并使用 Redis 保存 5 分钟的元数据快照：

```
┌─────────────────────────────────────────────────────────────┐
│                      Skills 存储架构                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   skill-sources/shared/       数据库索引                    │
│   ├── skill-a/               ┌──────────────┐              │
│   │   ├── SKILL.md           │ skills 表    │              │
│   │   ├── tools/             │ - slug       │              │
│   │   └── prompts/           │ - name       │              │
│   └── skill-b/               │ - description│              │
│       ├── SKILL.md           │ - dir_path   │              │
│       └── ...                │ - source_type│              │
│                              │ - share_config              │
│                              │ - enabled     │              │
│                              │ - deps...     │              │
│                              └──────────────┘              │
│                                                             │
│   user-data/shared/<uid>/workspace/agents/skills/           │
│   └── my-skill/              Redis 临时索引                │
│       └── SKILL.md           - 按 uid 隔离                 │
│                              - 5 分钟失效                  │
│                              - 安装/删除/刷新后立即更新     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 存储结构

- **文件系统**：共享来源位于 `skill-sources/shared`；个人来源位于对应 UserWorkspace 的 `agents/skills`
- **数据库索引**：`skills` 表存储元数据（slug、name、description、来源、共享范围、启用状态、依赖关系等）
- **关联机制**：通过 `dir_path` 字段关联文件系统目录与数据库记录
- **个人来源**：`user-data/shared/<uid>/workspace/agents/skills/<slug>` 保存当前用户个人 Skill，不创建数据库记录
- **个人缓存**：解析后的名称、slug 和描述按用户缓存到 Redis，默认 5 分钟失效

::: tip 两种存储边界
共享 Skill 必须通过系统导入并写入数据库；个人 Skill 由个人安装、删除与刷新接口管理。共享/内置 Skill
通过只读投影访问，个人 Skill 通过 UserWorkspace 的既有挂载直接访问。
:::

## 创建方式

系统提供以下方式创建或安装 Skills：

1. **推荐 Skill 安装**：在 Skills 管理页的推荐分组点击 `+`，系统会拉取对应远程来源并生成安装草稿
2. **ZIP / SKILL.md 上传**：上传后先解析为安装草稿，再选择安装到个人 Skill 源或共享 Skill 库
3. **远程仓库安装**：填写 skills 仓库地址、ModelScope Skill 地址或合集地址，下载并解析后选择安装位置
4. **在线编辑**：对已有且可管理的 Skill 在线创建目录、编辑文件和维护依赖
5. **Agent 内安装**：主智能体可通过 `install_skill` 工具安装个人 Skill，并读取工具返回的 `SKILL.md` 路径；子智能体禁用该工具

个人 Skill 不解析 `tool_dependencies`、`mcp_dependencies` 或 `skill_dependencies`。需要平台依赖、共享范围或在线管理时，应选择共享安装。

## Skills 来源

Skill 包含提示词、工具依赖和元数据。以下项目可用于参考目录组织与提示词设计：

- **Anthropic 官方 Tools**：https://github.com/anthropics/skills 可以参考其 skills 的组织方式和提示词设计
- **ModelScope Skill 市场**：https://modelscope.cn/skills 支持单个 Skill 地址，也支持合集地址批量拉取
- **MiniMax-AI CLI**：https://github.com/MiniMax-AI/cli 文本、图片、视频、语音和音乐生成 + Web 搜索（可通过 `MiniMax-AI/cli` 远程安装）
- **社区 Skills**：各平台分享的 Agent 提示词模板
- **自定义开发**：根据业务需求自行开发

系统也会在启动时同步仓库内置 Skills。内置 `html-preview` 指导 Agent 在 Markdown 难以清晰表达指标、对比、流程、时间线或层级关系时，按需输出 `html:preview` 静态 HTML/CSS 围栏；普通 HTML 源码仍使用 `html` 代码块。该 Skill 不依赖额外工具，前端通过清洗后的 sandboxed iframe 渲染预览。

未显式配置 Skills 的 Agent 会按现有资源默认规则自动获得该 Skill。使用显式 Skills 允许列表的 Agent 需要选择 `html-preview` 才能使用；内置 `deep-research` 已声明该依赖，升级后仍可继续输出辅助可视化。

## 快速开始

### 创建你的第一个 Skill

一个标准的 Skill 目录结构如下：

```
my-awesome-skill/
├── SKILL.md              # 必选，Skill 的核心定义文件
├── tools/                # 可选，相关的工具脚本
│   └── helper.py
└── prompts/              # 可选，提示词模板
    └── system.md
```

其中 `SKILL.md` 是每个 Skill 必须包含的核心文件，它采用 Markdown + Frontmatter 格式：

```markdown
---
name: My Awesome Skill
slug: my-awesome-skill
description: 这是一个用于处理特定任务的技能
---

# Skill 使用说明

这里是技能的详细使用文档，Agent 会读取这部分内容来了解如何使用这个技能。

## 功能列表

1. 功能一：xxx
2. 功能二：yyy

## 使用示例

当用户 xxx 时，可以调用此技能...
```

**Frontmatter 字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | Skill 展示名称，可使用更易读的名称（如 `Word / DOCX`） |
| `slug` | 否 | Skill 唯一标识，必须是小写字母、数字、短横线的组合，且不能连续短横线（如 `my-skill`）。未填写时兼容旧格式，系统会使用 `name` 作为 slug，此时 `name` 也必须满足 slug 规则 |
| `description` | 是 | Skill 的功能描述，会在 Agent 配置时展示 |

### 导入 Skill

可以通过以下方式导入或安装 Skill：

**方式一：从推荐列表安装**

1. 在系统设置的「Skills 管理」页面查看「推荐」分组
2. 未安装的推荐 Skill 会以普通 Skill 卡片样式展示，右侧显示 `+`
3. 点击推荐卡片或 `+` 后，系统会使用该 Skill 的远程来源拉取内容
4. 拉取成功后会弹出安装草稿，选择个人 Skill 或共享 Skill 后完成安装

已安装的推荐 Skill 不会继续显示在「推荐」分组中。

**方式二：通过 ZIP 包或 SKILL.md 上传**

1. 将 Skill 目录打包成 ZIP 文件（注意：ZIP 的根目录就是 Skill 目录）
2. 在系统设置的「Skills 管理」页面，点击「上传 Skill」
3. 上传 ZIP 文件或单个 `SKILL.md`
4. 系统解析上传内容并返回安装草稿
5. 选择安装位置后完成安装；选择共享 Skill 时继续确认共享范围，也可以放弃草稿

系统会自动：
- 校验 ZIP 内容和路径安全性
- 检查 slug 冲突：共享安装沿用全局冲突处理，个人安装同用户冲突时明确失败且不改写 slug
- 解析 SKILL.md 的 frontmatter；只有共享安装会写入数据库
- 按当前用户角色校验可选择的共享范围

**方式三：从远程来源安装**

管理员可以在「设置 → 基本设置 → Skill 配置 → 远程来源白名单」中配置允许远程安装 Skill 的来源域名；对应系统配置项为 `remote_skill_source_policy.allowed_hosts`。
该策略保存在 PostgreSQL `config_options` 中，默认允许 `github.com` 和 `modelscope.cn`，只做精确域名匹配，不自动放行子域名；保存空列表时，远程 Skill 安装会被禁用。运行时以数据库配置为准，不依赖 `base.toml`、环境变量或 Redis 配置快照。

1. 在 Skills 管理页面点击「远程安装」
2. 在“按仓库拉取”中填写来源，例如：
   - `anthropics/skills`
   - `https://github.com/anthropics/skills`
   - `https://modelscope.cn/skills/@anthropics/pdf`
   - `https://modelscope.cn/collections/MiniMax/MiniMax-Office-skills`
3. 点击“拉取技能”获取该来源中可发现的 Skills 列表
4. 单个 Skill 地址通常会自动选中；仓库或合集地址可在列表中勾选一个或多个 Skills
5. 点击“解析并确认”，系统返回安装草稿；选择个人 Skill 或共享 Skill 后正式安装

也可以切换到“全局搜索发现”，输入关键字检索 skills.sh 上的开源 Skills，再选择结果安装。

系统会在后端：
- 只接受管理员白名单中的 HTTPS 来源；GitHub `owner/repo` 简写按 `github.com` 校验
- 在不继承全局或用户环境变量的一次性 Sandbox 中执行 `npx skills`，Kubernetes Sandbox 不挂载 ServiceAccount token
- 通过 Sandbox 文件 API 提取对应 Skill，严格校验返回的相对路径，并限制文件数、目录深度和总大小；个人确认写入 UserWorkspace 的 `agents/skills/<slug>`，共享确认写入 `skill-sources/shared/<slug>` 与数据库

来源白名单用于限制产品允许的远程仓库，并不等同于 Sandbox 网络出口防火墙。

::: tip ModelScope 合集适合批量安装
ModelScope 合集地址可以作为远程来源填写，例如 `https://modelscope.cn/collections/MiniMax/MiniMax-Office-skills`。拉取后在列表中勾选需要的 Skills，再统一解析为安装草稿。
:::

**方式四：在线编辑已有 Skill**

在 Skills 管理页面，你可以：
- 新建目录或文件
- 在线编辑文本文件（支持 .md、.py、.js、.json 等格式）
- 直接在网页上修改 SKILL.md 内容

只有具备 `can_manage` 权限的用户才能编辑文件、依赖、共享范围和启用状态。

::: tip 安装位置决定管理能力
个人 Skill 适合平台无关或用户自定义能力；共享 Skill 适合需要工具、MCP、Skill 依赖以及部门或全局共享的能力。
:::

## 依赖系统

Skill 可以声明工具、MCP 服务和其他 Skill 依赖；运行时根据依赖类型决定加载时机。

### 依赖类型

每个 Skill 可以声明三类依赖：

| 依赖类型 | 说明 | 加载时机 |
|----------|------|----------|
| `tool_dependencies` | 需要的内置工具 | 预加载或激活后按需加载 |
| `mcp_dependencies` | 需要的 MCP 服务 | 预加载或激活后按需加载 |
| `skill_dependencies` | 依赖的其他 Skill | 会话启动即生效 |

### 渐进式加载机制

Skill 加载分为三个阶段：

**阶段一：会话启动**

当 Agent 会话启动时，系统会：
1. 在创建 Graph 前读取已过滤的 `context.skills` 列表
2. 递归展开 `skill_dependencies`，派生统一的 `_effective_skill_slugs`
3. 将有效 Skill 对应的技能说明注入到系统提示词中

这意味着：只要配置了某个 Skill，它的依赖 Skill 就会立即进入提示词。文件系统权限与选中集合分离：
当前用户授权的共享、内置 Skill 进入 `/home/gem/skills` 只读投影，个人 Skill 保留在
`/home/gem/user-data/agents/skills`。

Agent 配置还可以用 `preload_skills` 指定需要首轮直接使用的少量 Skill。该字段默认为空，只能选择
`context.skills` 中当前用户可读的根 Skill；系统会展开其依赖闭包，在 Graph 创建前读取每个 Skill 的根级
`SKILL.md`，并将完整说明注入首个模型请求。文件缺失或不可读时创建会显式失败，不会退回普通渐进加载。

**阶段二：技能激活**

当 Agent 通过 `read_file` 读取共享路径 `/home/gem/skills/<slug>/SKILL.md` 或个人路径
`/home/gem/user-data/agents/skills/<slug>/SKILL.md` 时，视为“激活”该技能。系统会：
1. 验证该技能在可见列表中
2. 将其添加到 `activated_skills` 列表
3. 后续的模型调用会使用激活列表来加载依赖

**阶段三：按需加载**

每次模型调用时，系统会：
1. 合并预加载闭包与 `activated_skills` 中的技能
2. 收集这些技能的 `tool_dependencies` 和 `mcp_dependencies`
3. 向当前模型请求开放对应本地工具和 MCP schema；未预加载或激活的依赖继续隐藏

会话启动阶段只处理预加载 Skill；其工具和 MCP 依赖从首轮开放。未预加载 Skill 的依赖仍在读取根级说明并激活后按需加入模型请求，从而控制初始工具 schema 的规模。

### 依赖声明示例

假设我们有三个 Skills：

- **base-skill**：基础技能，无依赖
- **advanced-skill**：依赖 `base-skill`
- **pro-skill**：依赖 `advanced-skill`

当在 Agent 配置中只选择 `pro-skill` 时：
1. 启动阶段：`_effective_skill_slugs` = [`pro-skill`, `advanced-skill`, `base-skill`]（自动展开可激活的依赖链）
2. 文件系统仍可读当前用户授权的其他 Skill，但它们不会因此进入 Prompt 或变成可激活工具
3. 当 Agent 读取 `pro-skill/SKILL.md` 时：触发激活，工具和 MCP 依赖被加载

若同时将 `pro-skill` 加入 `preload_skills`，启动阶段会读取三个 Skill 各自的根级 `SKILL.md`，首轮模型调用即可看到完整说明及其工具和 MCP 依赖，不需要先调用 `read_file`。

## 权限管理

数据库中的共享与内置 Skills 使用 `source_type`、`share_config` 和 `enabled` 控制来源、共享范围和启用状态。个人 Skill 由 UserWorkspace 的 uid 目录隔离，不携带 `share_config`，避免与数据库“指定用户共享”语义混淆。

| 字段 | 说明 |
|------|------|
| `source_type` | `builtin`、`upload`、`remote` 或 `personal` |
| `share_config` | 仅共享与内置 Skill 使用；v2 配置分别声明 `read_scope` 和 `manage_scope` |
| `enabled` | 是否允许在 Agent 配置与运行时使用 |

访问与管理规则：

| 用户 | 可见 / 可用 | 可管理 |
|------|-------------|--------|
| 超级管理员 / 管理员 | 可查看可管理或已启用且可访问的 Skills | 可管理所有非内置 Skills；可启停内置 Skills |
| 普通用户 | 可查看已启用且对自己可访问的 Skills，只能把新 Skill 安装到个人来源 | 可管理自己创建的非内置 Skills |
| 内置 Skills | 默认全局共享并启用 | 管理员可启停；不允许删除或直接编辑文件 |
| 个人 Skills | 只对当前用户可见，文件与缓存按 uid 隔离 | 当前用户可预览、删除和手动刷新 |

共享范围限制：

- `global`：所有用户可访问
- `department`：指定部门用户可访问
- `user`：指定用户可访问
- 只有管理员可以把 Skill 安装到平台共享 Skill 库；普通用户安装固定进入个人来源，不创建数据库记录，也不配置共享范围

旧版单层共享范围会在 PostgreSQL 启动迁移中复制为读取和管理范围；运行时接口仅接受 v2 配置。

管理员和普通用户在创建或编辑 Agent 时，都只能从自己可访问且启用的 Skills 中选择能力。个人 Skill 与共享 Skill 同 slug 时，个人 Skill 整项覆盖共享版本；共享版本的工具、MCP 和 Skill 依赖不会继续加载。删除个人版本后，用户仍有权访问的同名共享版本会在下一次运行恢复生效。

## 运行时行为

### Agent 如何使用 Skills

1. **提示词注入**：系统在每次模型请求时动态注入可用 Skills 的描述（请求级注入，避免污染 runtime context）
2. **文件访问**：共享与内置 Skill 从只读 `/home/gem/skills/<slug>/...` 读取；个人 Skill 从 `/home/gem/user-data/agents/skills/<slug>/...` 读取
3. **工具调用**：当 Agent 需要使用某个 Skill 时，会先读取对应的 SKILL.md 了解使用方法

### 文件操作限制

共享与内置 Skill 的运行时 `/home/gem/skills` 路径有以下限制：
- **只读**：Agent 只能读取文件内容
- **禁止写入**：不能创建、修改或删除文件
- **路径安全**：所有路径都经过安全校验，防止目录穿越攻击

::: tip 只读不等于不可执行
`/home/gem/skills` 对 Agent 是只读的，但沙盒命令工具仍可执行其中的脚本。Skill 应把依赖、运行方式和产物位置写清楚；脚本若需要写文件，应写入当前 Project Workdir 或 User Data，而不是 Skill 目录。
:::

个人 Skill 的来源和运行时文件都位于 UserWorkspace 的 `agents/skills/<slug>`。Run 初始化不会复制或
投影个人 Skill；UserWorkspace 挂载直接提供 `/home/gem/user-data/agents/skills/<slug>`。

### 选择与授权

- `context.skills=None` 表示选择当前用户可访问的全部 Skill，`[]` 表示不选择 Skill，非空列表表示显式白名单
- 不同 Agent 可以配置不同的 `context.skills`，该列表只决定 Prompt 和工具激活
- 共享文件投影以 uid 授权集合为边界，不随会话或 Agent 选择分叉；个人 Skill 不进入该投影
- Run 初始化以 uid 级数据库锁读取最新授权，并以共享卷文件锁串行替换投影；授权上下文缺失时直接失败
- 个人版本与共享版本同 slug 时，Prompt 元数据使用个人路径，共享投影不复制个人版本

## 维护建议

### Skill 命名规范

- `slug` 使用小写字母、数字和短横线，不能连续短横线
- `slug` 应具有描述性，如 `weather-query`、`sql-reporter`
- `name` 用于展示，可比 `slug` 更自然，例如 `Word / DOCX`
- 避免过长的 `name` 和 `slug`

### 依赖管理建议

- **保持依赖链简洁**：层级不宜过深，一般 1-2 层为宜
- **避免循环依赖**：系统会检测并阻止循环依赖
- **明确依赖必要性**：只在真正需要共享能力时才建立依赖

### SKILL.md 编写技巧

```markdown
---
name: example-skill
description: 简短描述技能功能
---

# 技能名称

这里是详细的使用说明...

## 何时使用

描述在什么场景下应该使用这个技能...

## 使用方法

1. 第一步...
2. 第二步...

## 示例

```
具体的使用示例...
```
```
