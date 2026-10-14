# 设置外壳多分区与 API Keys、环境变量分区

状态：implemented
类型：feature
Owner：web/src/features/settings/ui/settings-modal.tsx

事实分工：`web/src/features/settings` 拥有设置弹窗外壳（分区导航、门控与装配）；`web/src/features/account-settings` 继续拥有账户分区（上一记录的事实）；`web/src/features/api-keys` 拥有 API Key 分区（列表/创建/一次性密钥/启停/删除），端点与归一在 `web/src/entities/user-apikey`；`web/src/features/agent-env` 拥有环境变量分区（KV 行编辑、脏状态、掩码显隐），端点在 `web/src/entities/agent-env`。跨切片引用走 FSD 的 `@x` 公共 API（`@/features/<slice>/@x/settings`）。参照实现 `/home/liskarm/桌面/RAGS/Yuxi/web/src/components/{SettingsModal,ApiKeyManagementComponent,AgentEnvSettingsCard,McpEnvEditor}.vue` 只提供视觉与行为事实。

## 问题

1. **上一记录把设置做成单分区弹窗时留下的欠账**：参照的设置外壳有七个分区（账户 / API Keys / 基本 / OCR / 用户 / 部门 / 环境变量），后端六组端点在本仓全部存在且同源，但前端只有账户分区一个消费者。
2. **API Key 与沙盒环境变量没有任何界面**：`/api/user/apikey*`（5 条端点，含创建幂等键 `request_id` 与一次性 `secret`）与 `/api/user/agent-env`（整存整取的 KV）在生成物里零消费者；外部系统调用 Agent 对话接口要用的 `arskey_…` 密钥只能靠后端直接建。
3. **参照行为事实**（`ApiKeyManagementComponent.vue` 524 行）：表格五列（名称 / 前缀掩码 `****` / 启停开关 / 最后使用 / 过期时间）、创建弹窗（名称必填 + 可选过期时间）、创建成功的一次性密钥弹窗（警告「请立即复制密钥，关闭后将无法再次查看完整密钥」+ 复制）、创建幂等靠 sessionStorage 里的 UUID（`request_id`）。`AgentEnvSettingsCard.vue` 248 行 + `McpEnvEditor.vue` 367 行：KV 行（键 / 值 / 显隐 / 删除）、已保存的键锁定**键名**（改键等于删旧建新）与值默认掩码、脏状态驱动保存钮文案（「保存」↔「已保存」）、顶部提示保存只对新建沙盒生效；校验常量键名 `^[A-Za-z_][A-Za-z0-9_]*$`、≤200 条、键 ≤128、值 ≤32768 与后端 `validate_agent_env` 同源。

## 决策

1. **新增 `features/settings` 外壳切片**：左导航（图标 + 文案）+ 右内容区，分区装配与门控是它自己的事实。当前接入三个登录态分区（账户设置 / API Keys / 环境变量）；参照的其余四项（基本 / OCR / 用户 / 部门）是后续切片，接入时按 admin / superadmin 追加导航项。每次打开回到第一分区。
2. **跨切片引用走 `@x` 公共 API**：外壳 import `@/features/account-settings/@x/settings` 等。FSD 同层切片互斥是规则本意，但外壳的职责就是装配分区——`@feature-sliced/filesystem` 的 `isCrossImportPublicApi` 为此提供了 `@x/<for-slice>/index.ts` 约定，steiger 的 `forbidden-imports` 据此放行，比关规则更诚实。
3. **`entities/user-apikey` 与 `entities/agent-env`**：列表/写入的 query key 与失效规则各归一处；生成物 import 只出现在 api 段（`ApiKeyUpdate` 以本仓形状在 api 段再声明，model 段不触生成物——`generated-import-boundary` 的口径）。API Key 列表响应没有契约模型，按不可信数据归一（缺 `id` 的条目丢掉）。
4. **创建幂等**：弹窗打开时取（或沿用）sessionStorage 里的 UUID 作 `request_id`，创建成功或取消后移除——页面刷新不会重复建 Key，重复提交被后端幂等键挡住。
5. **环境变量行模型**：已保存的键锁定键名（`disabled`）且值默认掩码（点眼睛切换）；**删除按钮每行都有**——删行只是把它从保存 payload 里去掉，真正生效在 PUT 时；走查发现我第一版把锁定行的删除换成了锁图标，与参照的 `removeRow` 不符，已改回。
6. **显式偏离参照**：

| 参照 | 本仓 | 理由 |
|---|---|---|
| 幂等键存 `yuxi_pending_api_key_request_id` | `ars_pending_api_key_request_id` | 键名带本仓前缀，机制相同 |
| 设置外壳 90%/980px、内容区 `calc(100% - 176px)` | 860px、弹窗内左导航 176px + 自适应内容区 | 参照的内容区留白是给它的页面级弹窗；本仓弹窗内部自持导航，同一形态 |
| 环境变量保存失败不回滚开关/行 | 沿用（失败只提示，行保持脏状态） | 与参照同口径 |

不造：参照「基本设置」的服务链接卡（Neo4j/MinIO/Milvus 地址是部署常量）与 OCR/用户/部门/基本四个分区（后续切片）。

## 替代方案

**把外壳留在 `features/account-settings` 里。** 最省事，但外壳 import 三个分区的公共 API 会形成同层互引（oxlint 的 `no-cycle` 直接报错），而设置外壳是一个会持续长出分区的容器，留在第一个分区里让「谁拥有谁」越来越含糊。

**外壳上移到 `widgets/`。** widgets 的判据是「出现真实跨页面复用」——设置弹窗只有一个入口（用户菜单），不满足；且 widgets 引 features 合法，但让外壳拿不到「打开时回到默认分区」这类分区装配语义的归属。

**API Key 与环境变量各做一个独立弹窗入口。** 参照明确把它们收在设置外壳里，拆出去会让用户在三个入口里找同一类「我的配置」。

## 后果

- **`steiger.config.ts` 的例外清单继续变长**（settings / api-keys / agent-env / user-apikey / agent-env 五条），都是同一理由（引用统计在 off 切片的文件上失明或入口唯一）。若这条清单继续增长，值得回头为「引用统计的盲区」找一个更好的表达。
- **`['user-apikeys']` 与 `['agent-env']` 成为全局唯一查询键**；三个写入统一失效前者，后者由 `useUpdateAgentEnv` 成功回写。
- **一次性密钥弹窗的密钥只存在内存**（`useState`），关闭即丢——不落 sessionStorage/localStorage，与参照一致。

## 验证

**单测与门禁（本机 Node 26）**

| 命令 | 结果 |
|---|---|
| `NODE_ENV=test vitest run` | 208 文件、2298 例通过（新增 0 例：本批以真实链路走查为主，既有 20 例账户分区用例改为渲染新外壳后全绿；`model-provider-panel` 的既有装载失败与本批无关） |
| `tsc --noEmit` / `oxlint src` / `steiger` / `depcruise` / `check:tokens` / `prettier --check` / `vite build` | 全部通过（oxlint 0 error / 28 warning，新增文件 0 warning） |
| `python3 scripts/verify_engineering_contracts.py` | 仅两条既有错误（antd-button Owner 失效引用） |

**真实页面走查（zwj、真实后端 `localhost:5173`）**

- 外壳：导航「账户设置 / API Keys / 环境变量」，默认落在账户设置；每次打开回到默认分区。
- API Keys：空态「暂无 API Key，点击上方按钮创建一个」→ 创建「走查用密钥」→ 一次性密钥弹窗出现（`/api/user/apikey/` 复核 `arskey_48fcb…` 已建）→ 启停开关翻成「已禁用」（后端 `is_enabled:false` 复核）→ popconfirm 删除（后端列表归零，「删除成功」）。
- 环境变量：顶部提示存在 → 新增 `WALKTHROUGH_TOKEN=abc123` → 保存钮从「已保存」变「保存」→ 保存后后端 `{WALKTHROUGH_TOKEN:abc123}` 复核、「环境变量已保存」→ 删行再保存，后端 `{}` 复核（走查数据已全部复原）。
- 截图：`web/alembic/pages/account-settings/evidence/settings-apikeys-light-1440x900.png`、`settings-dark-1440x900.png`（明暗），过程图在 `web/tmp/`。

**未验证范围（不计为通过）**

- 创建 API Key 的过期时间路径（`DatePicker` + `expires_at` 提交；走查未设过期）。
- 浏览器原生的剪贴板复制（`copyTextToClipboard` 在 IAB 的权限下走通与否未验，逻辑有单测兜底口径）。
- 环境变量的校验拒绝路径（非法键名/重复键/超 200 条——单测覆盖规则，页面级未逐条走查）。
- 深色下的环境变量面板（证据截图是 API Keys 分区的暗色）。
