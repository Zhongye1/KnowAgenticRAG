# 手机号不能与别人的登录标识（uid）重合：所有写入口都挡在写库之前

状态：implemented
类型：bug-fix
Owner：backend/server/routers/auth_router.py

事实分工：本决定拥有「uid 与手机号互相占用」这条约束在管理员建号、管理员改用户、改个人资料、部门管理员建号四个写入口以及 `/initialize` 上的校验；注册那条公开入口的同类检查归 [自助注册](./2026-10-17-self-registration.md)（它一开始就双向检查）；`get_by_login_identifier`「先 uid 后手机号」的解析顺序是这条约束的成因，仍归 `ars/repositories/user_repository.py`。

## 问题

`get_by_login_identifier` 先按 uid 解析、再按手机号，而 uid 允许 11 位纯数字——与大陆手机号形态完全重合。于是只要某个账号的 uid 等于另一个账号的手机号，后者的手机号登录就会落到前者账上（密码仍需正确，因此是登录拒绝/混淆而非账号接管）。注册端点在实现时就双向检查；管理侧的写入口此前只在各自那一侧检查，实测**四条可达路径**：

1. `POST /api/departments` 的 `admin_uid` 逐字落库（不过 `generate_uid`），只查 `exists_by_uid` → 可以直接建出 uid 等于别人手机号的管理员。
2. `/initialize` 接受纯数字 uid（当时用内联 `^[a-zA-Z0-9_]+$`），之后管理员建号用 `phone_number = 那个 uid` 时只查 `exists_by_phone` → 新账号的手机号被超管的 uid 遮住。「首启时库为空」只说明创建那一刻没有手机号可撞，挡不住手机号在之后被分配。
3. `PUT /api/auth/profile` 只查「手机号是否被别人用过」；管理员 `PUT /api/auth/users/{id}` 改手机号时连格式与唯一性都不查。
4. OIDC 原始用户名模式（`OIDC_USE_RAW_USERNAME`，默认关）把 IdP 的 username 直接当 uid，同样只查 uid。

## 决策

1. 新增 `UserRepository.get_by_uid_excluding(uid, exclude_user_id=None)`（与既有 `get_by_phone_excluding` 同形），四个写入口在写库前统一做两个方向的检查：
   - 管理员建号：`phone_number` 不得是别人的 uid；
   - 管理员改用户：`phone_number` 先过格式，再查是否被别人用作手机号，再查是否被别人用作 uid；
   - 改个人资料：`phone_number` 不得是别人的 uid；
   - 部门管理员建号：`admin_uid` 不得是别人的手机号，`admin_phone` 也不得是别人的 uid。
2. `/initialize` 改用共享的 `validate_uid`（整串匹配 + 3–20 位），删掉那份内联正则：纯数字 uid 在首启时无害（库为空），但规则收成一份，顺带堵住 `"admin\n"` 这类结尾换行冒充（此前 `/initialize` 是唯一还留着宽松写法的入口）。
3. 文案与注册路径同形：「手机号与已有用户ID冲突」/「用户ID与已有手机号冲突」。
4. OIDC 原始用户名模式（`OIDC_USE_RAW_USERNAME`）同样补上：raw 模式下 uid 逐字取自 IdP 的 username，因此 uid 撞上本地手机号时**拒绝建号并给 409**（与同一分支里 sub 冲突的处理同口径），而不是放进来遮住别人的手机号登录。不改用别的 uid 是因为那会静默改变这个人的本地登录标识。这条冲突发生在浏览器导航里，所以回调把它折成 302 回 `/login?oidc_error=...`（前端登录页已有的错误入口），而不是让用户收到裸 JSON——同一处也顺带修好了原有的 sub 冲突 409。

## 替代方案

**只改 `/initialize`（让首启拒绝纯数字 uid）**：堵不住路径 1、3、4，而且纯数字 uid 本身并不非法——真正的问题在写手机号那一侧。

**靠数据库唯一约束兜底**：uid 与手机号是两个不同的唯一列，数据库层面看不出「跨列重合」，必须显式查。

**让 `get_by_login_identifier` 改成先手机号后 uid**：只是把被遮住的一方换个人，问题仍在。

## 后果

- 四个写入口与首启都不再能造出「uid 与别人手机号重合」的账号；真库实测改个人资料那条：把手机号设成另一个账号的 uid → 400「手机号与已有用户ID冲突」，设成普通手机号 → 200（不误伤）。
- 行为变化：管理员改用户时手机号现在会被校验格式与唯一性——此前完全不校验，重复手机号会直接撞数据库唯一约束（500 级失败而不是 400）。
- 过严的一侧很小但真实：`exists_by_phone` 不筛 `is_deleted`，所以一个软删后仍留着手机号的行会让守卫拒掉合法的 raw 模式登录。生产路径的软删会清空手机号（`delete_for_admin`），目前只有测试路径的 `soft_delete` 不带手机号，因此只在本机开发库上可复现（那条 `probe_phone_b` 就是）；这条与「唯一性一律对全部行成立」的仓库既有口径一致，故未改。
- 未处理：OIDC raw 模式下 uid 的**格式**没有校验（IdP 的 username 可能是邮箱这类含 `@` 的值，套 `validate_uid` 会把这些部署的登录挡掉，因此只挡冲突不挡格式）；`UserCreate.username` 的唯一列预检查已在 [管理员建号的用户名查重](./2026-10-17-admin-create-user-username-uniqueness.md) 里修掉。
- 已知残余（非本次引入）：跨列检查是「先读后写」，没有锁、也没有数据库层的跨列唯一约束（uid 与手机号是两个独立唯一列），两个并发请求仍可能各自通过检查后同时提交出一次碰撞。要关掉它需要新约束或序列化，属于独立变更。
- 需要部署方处理的历史数据：dev 库里 `verify_tc`（id 23）是一个 `department_id` 为空的**生效超管**，正是部门那条修复针对的账号形态；本决定不动它（属于部署数据）。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 管理员建号：手机号撞别人 uid → 400 且不建号 | 建出遮住别人的账号 | `backend/server/routers/auth_router.py` | `test/unit/routers/test_auth_login_identifier_conflicts.py` | 去掉该检查 → 对应用例红（实测 1 failed） | Passed |
| 改个人资料：手机号撞别人 uid → 400；普通手机号 → 200 | 自己把别人的登录标识遮住 | 同上 | 同文件用例；真库实测（注册两个账号后 PUT `/api/auth/profile`） | 去掉该检查 → 对应用例红（实测 1 failed） | Passed |
| 自排除：把自己的手机号设成自己的 uid → 200 | 过紧，重复保存也会被拒 | 同上 | 同文件 `test_self_owned_uid_phone_combination_is_allowed` | 去掉 `get_by_uid_excluding` 的 `exclude_user_id` → 该用例红 | Passed |
| 管理员改用户：撞别人 uid → 400；格式非法 → 400；都不写库 | 越权改写别人的手机号归属 | 同上 | 同文件用例（三种载荷） | 去掉 uid 检查 → 对应用例红（实测 1 failed） | Passed |
| 部门管理员建号：`admin_uid` 撞别人手机号 → 400 且不建部门 | 建出遮住别人的管理员 | `backend/server/routers/auth_dept_router.py` | 同文件用例 | 去掉该检查 → 对应用例红（实测 1 failed） | Passed |
| `/initialize` 拒绝结尾换行的 uid | 首启 uid 冒充干净值 | `backend/server/routers/auth_router.py` | 同文件用例（400 + 库仍空） | 退回内联正则 → 对应用例红（实测 1 failed） | Passed |
| OIDC raw 模式：uid 撞本地手机号 → 拒绝建号 | IdP 给的 username 遮住别人的手机号 | `ars/services/oidc_service.py` | `test/unit/services/test_oidc_service.py::test_create_oidc_user_rejects_raw_uid_matching_local_phone`；另有不冲突时的正向用例 | 撤掉该检查 → 对应用例红（干净库上的失败是「没有抛异常、反而建了号」；本机开发库里已有一条软删的同 uid 行，所以那次实测报的是 500） | Passed |
| OIDC 回调把建号冲突折成回登录页的错误 | 浏览器导航收到裸 JSON | `ars/services/oidc_service.py` | 同文件 `test_oidc_callback_redirects_to_login_when_raw_uid_collides_with_local_phone`（302 + `oidc_error` 带「手机号冲突」，且没有建号）——同时证明守卫在正常回调链路上可达 | 撤掉 callback 的 `except HTTPException` → 该用例红（实测 409 直接抛出） | Passed |
| 生成的 uid 永远不是纯数字（管理员建号不会撞手机号） | 生成的 uid 与手机号形态重合 | `ars/services/user_identity_service.py` | `test/unit/services/test_user_identity_service.py` | 去掉 `u` 前缀 → 该用例红 | Passed |
| 全量门禁不退化 | 改动波及既有行为 | 本记录 | 后端 `test/unit`、前端 `test:unit`、`lint:check`、`check-types`、`check:tokens`、`lint:fsd`、`arch:check`、`api:check`、`build`、`verify_engineering_contracts.py` | — | Passed |
| 旧能力不存在： 只在单侧检查的写入口、`/initialize` 的内联 uid 正则 | 半套规则共存 | 本记录 | 上表五条的直接证据 | — | Passed |
| 重新引入条件： 需要放宽「uid 与手机号不得重合」时（例如允许数字 uid 与手机号共存），必须先改 `get_by_login_identifier` 的解析顺序并同步本记录，而不是在单个写入口开后门 | 无条件回退 | 本记录 | — | — | Passed |
