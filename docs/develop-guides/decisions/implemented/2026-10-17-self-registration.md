# 登录页自助注册：公开注册端点与 `/register` 页面

状态：implemented
类型：feature
Owner：backend/server/routers/auth_router.py

事实分工：本决定拥有自助注册这一条公开入口——端点与限流、建号规则与专属部门、`/register` 页面与登录页入口。身份事实的落库仍归 `ars/repositories/user_repository.py` 与 `users` 表的约束；首启建号仍归 `ars/services/identity_admin_service.py`；登录与注册共用的视觉外壳（品牌栏、卡片、页脚）与协议勾选归 `web/src/widgets/auth-shell/`；登录页品牌投影仍归 `web/src/entities/session/lib/system-info.ts`。

## 问题

登录页只有登录、首启超管初始化与 OIDC 三条入口，没有任何自助注册：后端建号只有 `POST /api/auth/users`（`get_admin_user` 网关）与 `POST /api/auth/initialize`（库为空时建唯一超管）。用户要求给登录页加一个能真正建号的注册入口，并选定**默认开放**（不要配置开关、不要邀请码）。

实现前有两条必须先处理的事实，都在真实代码/数据里：

1. `is_first_run()` 决定登录页是否显示首启初始化表单。若允许未初始化时注册，第一个注册者会让库不再为空，初始化表单从此消失，部署方永久失去创建超管的机会——注册必须在 `is_first_run` 为真时 fail-closed。
2. `get_required_user` 要求用户必须有部门（**114 处端点**依赖它，没有部门一律 400「当前用户未绑定部门」），所以注册必须绑部门。而按名字找「默认部门」在真实部署上不成立：本项目 dev 库的部门是 研发部 / 产品部 / 运营部，没有「默认部门」；也不能落超管所在部门，那等于把该部门的可见性隐式授予任何自助注册的人。仓库里已有的先例是 OIDC 自动建号——`oidc_service` 用一个按需创建的专属部门（`default_department`，默认「OIDC用户」）安置自动出现的用户。

## 决策

1. **公开端点** `POST /api/auth/register`（无鉴权依赖，201，`response_model=Token`），请求 `RegisterRequest{uid, password, phone_number?}`（`extra="forbid"`，密码 `min_length=8`）。注册即登录：返回与 `/auth/token`、`/auth/initialize` 同形的凭据。
2. **建号服务** `ars/services/identity_registration_service.py`：`register_user(db, *, uid, password, phone_number, request)`。守卫按序：`is_first_run()` 为真 → `RegistrationClosedError`（403，文案指向「请先创建超级管理员」）；UID 格式（`user_identity_service.validate_uid`：`fullmatch` + 3–20 位字母数字下划线，`fullmatch` 而非 `^…$`——`$` 也匹配结尾换行，`"admin\n"` 会以 `admin` 的样子出现在用户列表里）→ 400；UID 已存在、UID 与既有手机号冲突、手机号已存在、手机号与既有 UID 冲突 → 400（复用 `IdentityConflictError`；两个交叉检查是必须的：`get_by_login_identifier` 先按 uid 解析，uid 与手机号形态重合时占住对方的号会让对方再也无法用手机号登录）。落库 `username = uid`、`role = "user"`、`department_id = 专属部门`、`avatar = None`、`last_login = now`，并写一条 `log_operation(..., "用户注册", ..., request)` 审计（带来源 IP，公开端点应当留下这个）。
3. **专属部门按需创建**：名为「自助注册」，不存在则创建（含并发 `IntegrityError` 后重查），与 OIDC 自动建号同口径；管理员随后可按需把用户调到真实部门。
4. **限流**：`RATE_LIMIT_ENDPOINTS` 从集合改为「端点 → 提示文案」映射并加入注册端点；中间件随之更名 `AuthRateLimitMiddleware`（它现在守两个端点，名字要诚实）；滑动窗口的键从「IP」改成「(IP, 端点)」，否则注册的失败会把登录顶到 429、而任一次成功又会把另一边攒下的失败一起清掉。窗口仍是 10 次 / 60 秒。
5. **前端**：`paths.auth.register`（带 `redirectTo`）；把登录页的视觉外壳（告警条、品牌导航、卡片含图片侧、表单侧容器、页脚协议链接）与协议勾选抽到 `web/src/widgets/auth-shell/`，登录页与注册页共用；新增 `web/src/pages/register/`（`register-page.tsx` 状态机 + `register-form.tsx`：UID、手机号可选、密码、确认密码、协议同意）；`entities/session` 加 `useRegister()`，成功后与登录同一条收尾路径；登录页在非首启态给一行「没有账号？注册」。外壳提供 `footer` 槽排在错误条之后，这样注册/登录入口不会把错误文案从表单下方挤走（外壳刚抽出来时错误条被排到了入口下面）。
6. **契约**：新端点进 OpenAPI（`api:snapshot` + `api:gen`），前端走生成的客户端，`api:check` 拦漏生成。

## 替代方案

**落「默认部门」**（管理员建号 `create_user` 的兜底口径）：真实部署没有这个部门，注册会直接不可用（本次实现第一版就是这条，被 dev 库实测打回）。

**落超管所在部门**：部署无关，但把超管部门的可见性隐式授予任何自助注册的人，公开端点不该有这种副作用。

**配置开关（默认关）或邀请码制**：安全面更小，但用户明确选择默认开放；仓库也没有邀请机制（需新建表/字段与生成管理 UI）。

**登录页内联切换（Segmented 切登录/注册）**：文件更少，但登录页会同时长出两套表单状态，注册也没法直接分享链接。

**把 `InitializeAdminForm` 泛化成通用建号表单**：省一份标记，但要动首启流程，且两者文案与语义不同。

**在 `/initialize` 复用新的 `validate_uid`**：两处各有一份 UID 格式规则，理想是同一处定义；但会动到刚稳定下来的首启端点，本次不动（见后果）。

## 后果

- 注册出来的账号：角色 `user`、部门「自助注册」、无手机号也可用、注册即登录；管理员在用户管理里能看到并调整部门/角色。
- 组织架构里会多出一个「自助注册」部门（首次注册时创建）。**注意：`Department.users` 是 `cascade="all, delete-orphan"`，但走 UI 删除部门时用的是 `delete_and_migrate_users`——它把用户迁到写死的 `default_department_id=1`（本仓是「研发部」）而不是删掉，等于把自助注册的人悄悄并进那个部门**。所以清理自助注册账号要删用户，不要删部门；迁移目标写死这件事本身也值得单独处理。
- 默认开放意味着任何能访问服务的人都能开户（用户确认的取舍）：限流集合与首启守卫都不能去掉。
- 没有邮箱/短信验证（`User` 没有邮箱字段，仓库也没有发信设施），账号立即可用；协议同意仍只是前端门禁，服务端不落同意记录。
- 管理员建号那条路径上的同一个坑（未指定部门且找不到「默认部门」时静默写 `department_id = NULL`）已在 [管理员建号的部门归属](./2026-10-17-admin-user-creation-department.md) 里修掉：两条分支统一落到创建者所在部门，落不到就显式 400。
- UID 格式规则已经收成一份：注册、`/initialize` 与部门管理员建号都调用 `validate_uid`（合并发生在 [手机号不能与别人的登录标识重合](./2026-10-17-login-identifier-phone-conflicts.md) 那一轮），本记录原先记的「两份规则待合并」不再成立。「uid 等于别人手机号」这条隐患本决定只堵了注册这一侧，管理侧的四条路径后来单独收口，见 [手机号不能与别人的登录标识重合](./2026-10-17-login-identifier-phone-conflicts.md)。
- 限流窗口是**进程级**状态（每个 worker 一份，键是 `(IP, 端点)`，窗口 60 秒）：注册失败的窗口会留 60 秒，测试因此不能假定窗口起点是空的——两条集成用例都用独占的 `X-Forwarded-For` 规避，这一条值得后续写用例时照抄。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 未初始化时拒绝注册，首启初始化仍可用 | 第一个注册者抢在超管之前建号 | `ars/services/identity_registration_service.py` | `python -m pytest test/unit/routers/test_auth_register.py`：403 用例 + 库仍空 + `/auth/initialize` 仍成功 | 把 `if await repository.is_first_run():` 改成 `if False:` → 该用例红（实测 1 failed） | Passed |
| 注册成功即拿到可用凭据：`role=user`、落专属部门 | 账号没有部门 → 每个端点 400 | 同上 + `get_required_user` | 后端用例断言 `/api/auth/me` 200 且 `department_id` 等于「自助注册」；真实部署：用户 `e2e_selfreg`（id 33）`role=user`、`department_id=4`（自助注册），浏览器里注册后直接进站 | 把 `department_id` 写回 `None` → 实测 2 例红 | Passed |
| UID 格式与唯一性、手机号唯一性/格式在服务端校验 | 公开端点变成无校验的写入口 | `ars/services/user_identity_service.py` | 同文件 400 系列用例（格式 5 例含结尾换行、UID 占用、手机号占用、手机号格式） | 去掉 `validate_uid` 调用 → 格式用例红（实测 4 failed，当时 4 例） | Passed |
| UID 与手机号互相占用被拒 | 占住对方手机号 → 对方再也无法用手机号登录 | `ars/services/identity_registration_service.py` | 同文件两条用例（uid 撞手机号、手机号撞 uid）；真实部署实测 `uid=13902988446`（超管手机号）→ 400「该用户ID与已有手机号冲突」 | 去掉任一交叉检查 → 对应用例红 | Passed |
| 多余字段被拒 | `role`/`department_id` 被当成越权入口 | `backend/server/routers/auth_router.py` | 同文件 422 用例（带 `role` 与 `department_id` 的载荷） | 去掉 `model_config = ConfigDict(extra="forbid")` → 该用例红（实测 1 failed） | Passed |
| 注册端点受限流 | 公开端点被批量开户 | `backend/server/main.py` | 同文件 429 用例：10 次失败后第 11 次 429 + `Retry-After` | 从 `RATE_LIMIT_ENDPOINTS` 移除注册端点 → 该用例红（实测 1 failed） | Passed |
| 专属部门按需创建且只建一次 | 每次注册都建一个部门 | `ars/services/identity_registration_service.py` | 同文件「两个注册者共用一个部门」用例 | — | Passed |
| 登录页非首启给入口、首启不给 | 首启时把用户引到必然失败的注册页 | `web/src/pages/login/ui/login-page.tsx` | `pnpm exec vitest run test/unit/pages/login-page.test.tsx`：入口用例断言 `href=/register?redirectTo=%2Fagent`，首启用例断言无该链接 | 去掉 `isFirstRun` 条件 → 首启用例红 | Passed |
| 注册页：校验、协议门禁、成功跳转、失败文案、首启态不给表单 | 表单假成功或漏掉门禁 | `web/src/pages/register/` | `pnpm exec vitest run test/unit/pages/register-page.test.tsx`：6 例 | — | Passed |
| 外壳抽取不改变登录页行为 | 抽取改坏品牌栏/页脚/首启表单/OIDC | `web/src/widgets/auth-shell/` | 逐条比对迁出的 CSS 规则与 `HEAD` 的原文（去空白后全部一致、无重复、每个类只在一个模块里定义）；`pnpm run test:unit` 236 文件 / 2547 例全过，登录页原有 8 例未改动 | 未实测（负向案例是设想）；真实守卫是登录页原有 8 例，它们断言品牌栏、页脚、首启表单、OIDC 与协议门禁 | Passed |
| 契约与静态门禁不退化 | 漏生成契约、越层引用 | `web/package.json` | `api:check`（契约生成物一致）、`lint:check` 0 error / 31 warning、`check-types`、`check:tokens`、`lint:fsd`、`arch:check`（606 模块）、`build`、`verify_engineering_contracts.py`（117 decisions）全过；后端 `test/unit` 1842 passed / 40 skipped / 0 failed；前端 `test:unit` 236 文件 / 2547 例全过 | — | Passed |
| 真实部署端到端：注册 → 进站 → 重新登录 → 管理员可见 | 只在测试里成立 | 本记录 | 浏览器（第二台 dev server `5176`，与 5174 不同源因而无本地凭据）实测：登录页链接 → `/register` 填表提交 → 「注册成功」并落到 `/agent`；清凭据后用同账号密码登录 → 「登录成功」；`postgres` 里 `users` 行与「自助注册」部门如上述；5174（超管会话）用户管理搜索到该账号，角色「普通用户」、部门「自助注册」（截图） | — | Passed |
| 真实 HTTP + 真实 PostgreSQL 的集成用例 | 只在内存 SQLite 上成立 | `backend/test/integration/api/test_auth_router.py` | 新增两条并**已在本机跑通**：`docker compose exec -T -e TEST_USERNAME=… -e TEST_PASSWORD=… api sh -c 'cd /app && python -m pytest test/integration/api/test_auth_router.py -q -k register'` → `2 passed`（连跑两次一致）。第一条覆盖注册→`/me` 200（含 `department_name=自助注册`）→第二个注册者复用同一部门→重复 uid 400→同账号密码登录 200，并在 `finally` 里回收账号；第二条覆盖注册失败攒满 → 429 → 同一 IP 的登录仍是 401（不是 429），免凭据、不写库。两条都用独占的 `X-Forwarded-For` 拿自己的限流窗口，避免与同 IP 上的其它用例/手工请求互相干扰。**注意：该文件没有接进任何 workflow（`grep -rln test_auth_router .github/` 为空），本机也没有 `TEST_USERNAME`/`TEST_PASSWORD`（`test/.env.test` 不存在），本次是用一个临时管理员账号（跑完已软删）驱动的** | — | Passed |
| 同一条链路的手工真实验证（真实 HTTP + 真实 Postgres） | 只在测试里成立 | 本记录 | `curl` 直连 `localhost:5050`：两个新账号注册成功且 `department_id` 同为 4（`department_name=自助注册`）、`/me` 200；重复 uid → 400；`uid=13902988446`（超管手机号）→ 400；`role` 多余字段 → 422；`"admin\n"` → 400。浏览器（5176 异源）走完登录页入口→注册→进站→重新登录，管理员在用户管理里看到「普通用户 / 自助注册」（截图） | — | Passed |
| 旧能力不存在： 注册必须绑部门的旧写法（`department_id = NULL`）、以及只服务登录页的外壳副本 | 半套状态共存 | 本记录 | 上表两条的直接证据；`git diff` 里登录页不再有外壳标记，`pages/login/ui/agreement-consent.tsx` 已删除 | — | Passed |
| 重新引入条件： 要改成「邀请码 / 审批后可用 / 关闭注册」时，按本记录的替代方案新增提案，不把开关直接塞进这条公开端点 | 无条件回退 | 本记录 | — | — | Passed |
