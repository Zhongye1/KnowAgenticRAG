# 账户设置弹窗：当前用户的资料、头像与 Memory 配置写入上移到 entities/session

状态：implemented
类型：feature
Owner：web/src/features/settings/ui/settings-modal.tsx

补充（2026-10-14 第二批）：弹窗已改造成多分区外壳——外壳本身上移到 `web/src/features/settings`（拥有分区导航与装配），账户分区留在 `web/src/features/account-settings`，并新增 API Keys 与环境变量两个分区（`web/src/features/api-keys`、`web/src/features/agent-env`，各自带实体切片 `entities/user-apikey`、`entities/agent-env`）；跨切片引用走 FSD 的 `@x` 公共 API（`@/features/<slice>/@x/settings`）。本记录的其余事实仍然成立。

事实分工：`web/src/entities/session` 拥有当前用户的资料写入（`PUT /api/auth/profile`）、头像上传（`POST /api/auth/upload-avatar`）与用户配置（`GET/PUT /api/user/config`）的端点、归一与身份缓存失效（`AUTHENTICATED_USER_KEY` / `refreshAccountData`）；`web/src/features/account-settings` 拥有页面级交互（字段校验、行内编辑状态机、上传编排、Memory 草稿、刷新编排）与渲染；`web/src/widgets/app-sidebar/ui/user-menu.tsx` 拥有「设置」入口与弹窗的挂载。参照实现 `/home/liskarm/桌面/RAGS/Yuxi/web/src/components/AccountSettingsComponent.vue` 只提供视觉与行为事实，不拥有本仓拓扑。

## 问题

1. **用户菜单里没有「设置」，账户资料在界面上改不了。** 参照的用户菜单是 身份 → 文档中心 / 主题 / 调试面板 / **设置** / 退出登录；本仓缺「设置」这一项，头像、用户名、手机号、Memory 开关都没有界面入口。
2. **当前用户的写入事实没有任何前端实现。** `PUT /api/auth/profile`（body `{username?, phone_number?}`，返回完整 `UserResponse`）、`POST /api/auth/upload-avatar`（multipart 字段 `file`，5MB 上限，服务端自己落库并返回 `{success, avatar_url}`）、`GET/PUT /api/user/config`（`{uid, enable_memory, updated_at}`）在生成物里只有函数没有消费者。Memory 在后端有真实效果（`backend/package/ars/services/memory_service.py` 消费 `enable_memory`）。
3. **身份缓存有 staleTime 5 分钟**（`['authenticated-user']`），任何资料写入都必须显式失效，否则弹窗与侧栏显示旧资料。
4. **参照行为事实**：80px 圆头像悬停遮罩（无头像「上传」/有头像「更换」）；行内编辑一次只有一个字段，Enter 保存、Esc/失焦取消、保存中失焦不取消、未变更静默取消；用户名 2–20 字符、手机号 `^1[3-9]\d{9}$`（空串=清空）；头像 `image/*` + <5MB；开关乐观更新并提示「用户配置已保存」；刷新同时重取用户与配置并提示「账户设置已刷新」；权限行按角色着色。

## 决策

1. **`entities/session` 补当前用户的写入层。** `api/session-api.ts` 增 `updateProfile` / `uploadAvatar` / `getUserConfig` / `updateUserConfig`；`model/session.tsx` 增 `useUpdateProfile` / `useUploadAvatar`（成功后失效 `AUTHENTICATED_USER_KEY`）与 `useUserConfig`（弹窗打开时启用，30 秒 staleTime）/ `useUpdateUserConfig`（成功回写 query data）。`refreshAccountData` 是「同时失效身份与配置」的唯一实现，刷新按钮用它。
2. **写入后失效而不是 `setQueryData`。** PUT profile 的响应虽是完整用户，但 `department_name` 等字段的归一只有 `useUser` 一处事实；直接写缓存会出现第二份「用户长什么样」，staleTime 内的形状漂移没人发现。
3. **校验与后端同源、前端只提前拦截。** `lib/account-settings.ts` 的三条规则（用户名 2–20 + `^[一-龥a-zA-Z0-9_]+$`、手机号 `^1[3-9]\d{9}$`、头像 `image/*` + <5MB）与后端 `user_identity_service.py` / `upload_image_to_minio` 逐字一致；文案与参照逐字一致。`/api/auth/validate-username` 是管理端接口，参照的账户设置页同样不用——不引入。
4. **`features/account-settings` 承载页面逻辑与渲染，`user-menu` 只接入口。** 控制器 `use-account-settings.ts` 拥有单编辑态状态机（草稿同步、保存中防取消）、上传与 Memory 编排，通知走注入回调；`ui/account-settings-modal.tsx` 的卡片、行网格、身份面板与 Memory 行按参照样式值（18px/12px 圆角 gray-25、80px 头像、`56px + 1fr` 网格、gray-0 身份面板）落在 CSS Module。
5. **显式偏离参照**：

| 参照 | 本仓 | 理由 |
|---|---|---|
| 7 项左侧导航的设置外壳（账户/API Keys/基本/OCR/用户/部门/环境变量） | 单段「账户设置」弹窗 | 其余 6 项是各自独立的未来切片；现在做外壳会留下 6 个死入口 |
| 左下角 Star 推广卡 | 不做 | Yuxi 品牌物料（GitHub 仓库、shields 徽章） |
| 头像兜底链里的 DiceBear 外部头像 | 首字母+渐变（`shared/lib/avatar.ts` 既有决定） | 出网依赖，智能体切片已排除 |
| 自定义左上角关闭钮、90%/980px 宽、176px 左栏 | antd Modal 默认关闭钮、720px 宽、单栏内容 | 单段内容没有左栏可放 |

补充（2026-10-14）：设置外壳接手弹窗后，关闭钮已按参照改回自绘的左上角按钮，弹窗宽度也改为 980px（见 `2026-10-14-settings-admin-partitions.md` 决策 9）；上表的这两项偏离不再成立，单栏内容仍保留。
| Memory 开关失败不回滚 | 沿用（失败不回滚，重开弹窗按服务端状态重读） | 与参照同口径，如实记录 |

不造：其余六个设置分区、密码修改（参照此页也没有）、多用户切换。

## 替代方案

**直接在 `features/account-settings` 里打端点。** 改动面最小，但「当前用户长什么样、怎么改」会出现第二份事实；资料写入与登录/登出共用 `['authenticated-user']` 这份缓存，失效规则离开 entities 就没人拥有。

**做一个完整的七分区设置外壳再逐格填。** 一屏对齐度最高，但六个空分区是死入口；`/workspace` 切片已确立「参照有的能力本仓没有对应实现时不造入口」的口径。

**Memory 开关走独立页面而非弹窗。** 参照把它放在账户设置的同一张卡片里，拆出去会让「一个用户的两份设置」出现两个入口。

## 后果

- **侧栏与弹窗共用一份身份缓存**：改资料后侧栏用户名即时跟上（失效重取）；头像上传后菜单头像即时更新（服务端返回 URL，缓存失效重取）。
- **`user-config` 成为全局唯一的查询键**：`useUpdateUserConfig` 成功后 `setQueryData` 回写它；这一份配置当前只有一个消费者（本弹窗），后续若有第二消费者需要复查 staleTime 与失效口径。
- **`web/steiger.config.ts` 增加 `features/account-settings` 的 `fsd/insignificant-slice` 例外**（入口只有用户菜单一处），与既有 `features/debug` 同口径。
- **窄屏下弹窗自身不溢出**（390px 视口内弹窗右缘 382px），底层聊天页在 390px 有既有的 10px 横向溢出，与本切片无关（关弹窗后仍在）。

## 验证

**单测与门禁（本机 Node 26）**

| 命令 | 结果 |
|---|---|
| `NODE_ENV=test vitest run` | 208 个文件、2298 个用例通过；仅 `model-provider-panel.test.tsx` 装载失败（`@emoji-mart/data` 的 JSON import attribute），先于本切片存在 |
| `tsc --noEmit` / `oxlint src` | 通过；0 error，25 warning（与本切片前基线同数，新文件 0 warning） |
| `steiger` / `depcruise` / `check:tokens` / `prettier --check` / `vite build` | 全部通过 |
| `python3 scripts/verify_engineering_contracts.py` | 仅两条既有错误（`2026-10-12-chat-antd-controls*.md` 的 Owner 指向已删除的 `antd-button.tsx`），非本切片引入 |

新增用例：`test/unit/features/account-settings/account-settings.test.ts`（7 例：三条校验与角色色）、`use-account-settings.test.tsx`（13 例：编辑状态机全分支、校验文案逐字、未变更不发请求、失败保留编辑态、头像两条拦截、Memory PUT 与失败、刷新双失效、弹窗渲染与 Esc 取消）、`test/unit/entities/session/session-mutations.test.tsx`（3 例：资料与头像写入失效身份缓存、`refreshAccountData` 双失效）、`test/unit/widgets/app-sidebar.test.tsx` 扩展（菜单「设置」入口与弹窗接线）。

**真实页面走查（zwj 登录、真实后端 `localhost:5173`）**

- 菜单顺序与参照一致：身份 → 文档中心 / 切换到深色模式 / 调试面板 / **设置** / 退出登录。
- 弹窗内容与 `/api/auth/me` 一致：张文杰 / 15251638888 / zwj / 超级管理员（红）/ 研发部 / Memory 关。
- 行内编辑：改成 1 个字符按 Enter → 文案「用户名长度必须在 2-20 个字符之间」，输入框保持；改成合法值保存 → 后端 `GET /api/auth/me` 返回新名，侧栏菜单即时同步，提示「个人资料更新成功」；随后改回原名（数据库已复原）。
- Memory：切换 → `GET /api/user/config` 复核 `enable_memory` 真实翻转，提示「用户配置已保存」；走查后已复原为 false。
- 头像：`input.files` 直投 1×1 PNG → 后端 `avatar` 出现 MinIO 地址，遮罩即时从「上传」变「更换」，提示「头像上传成功！」。
- 明暗与窄屏：`web/alembic/pages/account-settings/evidence/acct-light-1440x900.png`、`acct-dark-1440x900.png`、`acct-narrow-dark-390x844.png`。

**未验证范围（不计为通过）**

- 系统文件选择框路径（IAB 不可驱动，上传走 `input.files` 直投同一处理器）。
- 真实重名冲突（不制造第二个用户；400 detail 的文案透传由 `describeFailure` 保证，单测覆盖前缀拼接）。
- 头像的超大图（>5MB）走真实端点的 400 形态（客户端拦截在前，服务端同规则兜底）。
- SVG 等客户端放行但服务端拒绝的类型（客户端只查 `image/*`，与参照一致）。
