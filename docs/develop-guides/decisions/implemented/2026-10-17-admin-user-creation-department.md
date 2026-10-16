# 管理员建号的部门归属：落到创建者所在部门，落不到就显式失败

状态：implemented
类型：bug-fix
Owner：backend/server/routers/auth_router.py

事实分工：本决定拥有 `POST /api/auth/users` 的部门归属规则；自助注册那条公开入口的部门规则归 [自助注册](./2026-10-17-self-registration.md)（两者都要求落到一个确定存在的部门，但选法不同：那条用按需创建的专属部门）；「用户必须有部门」这条约束本身仍归 `backend/server/utils/auth_middleware.py` 的 `get_required_user`（实测 118 处端点依赖它）。

## 问题

`POST /api/auth/users` 在超管未指定部门时按名字找「默认部门」，**找不到就静默写 `department_id = NULL`**。而 `get_required_user`（114 处端点依赖它）对没有部门的账号一律 400「当前用户未绑定部门」——这种账号一建出来就完全不可用，而创建者看不到任何异常。

真实部署正好踩到：本项目 dev 库的部门是 研发部 / 产品部 / 运营部，没有「默认部门」；管理员建号表单的部门选择框又是可选的（`allowClear`、无 `rules`），超管留空就会造出这种账号。

## 决策

1. **两条分支统一成「创建者所在的部门」**：超管不指定部门时用自己的部门（与普通管理员那条分支同一条规则），指定了就用指定的；普通管理员仍不能指定（403）。
2. **最终拿不到部门时显式失败**：创建者自己都没有部门 → 400「无法确定新用户的部门：请指定部门，或先让当前账号加入一个部门」，不再静默写 NULL。这一条是纵深防御——`get_admin_user` 链上的 `get_required_user` 本来就会先挡掉没有部门的账号（400「当前用户未绑定部门」），所以真实 HTTP 路径上够不到它；真正修掉 bug 的是第 1 条那个 `or current_user.department_id` 回退。用例覆盖的是函数本身，不是这条不可达路径。
3. **删掉按名字找「默认部门」的兜底**：初始化流程会把超管放进它建的默认部门，所以「超管自己的部门」在新部署上与它等价；而改名或删掉默认部门的部署只有新规则成立。名字兜底还让行为随部署的名字而变，是这次 bug 的根源。

## 替代方案

**保留名字兜底，只在找不到时 400**：超管在改名过的部署上必须显式选部门，比普通管理员那条分支更严，行为仍随部署名字而变。

**找不到时落到「第一个部门」**：任意，可能把用户放进与之无关的部门。

**落到自助注册的专属部门**：语义不对——那是公开注册的人待的地方，管理员建号是有意指定归属的动作。

## 后果

- 管理员建号不会再产生没有部门的账号；超管留空部门时落到自己的部门，与普通管理员建号的行为一致（表单里的空选择现在意味着「跟随我」）。
- 行为变化：有「默认部门」的部署里，超管留空时新用户从「默认部门」变成「超管所在部门」。初始化流程两者本来就是同一个部门，只有超管后来被调走时才会不同。
- 关于「uid 等于别人手机号」这条隐患：我一开始判断它不可达（`generate_uid` 对数字开头的名字加 `u` 前缀，生成的 uid 永不是纯数字；`/initialize` 只在库为空时成立），但独立评审用实测推翻了——漏洞在**写手机号那一侧**：`/initialize` 的纯数字 uid 会在之后被某个账号的手机号撞上，`POST /api/departments` 的 `admin_uid` 更是逐字落库。四条路径与修复见 [手机号不能与别人的登录标识重合](./2026-10-17-login-identifier-phone-conflicts.md)。`generate_uid` 的前缀前提仍由 `test/unit/services/test_user_identity_service.py` 钉住。
- 顺带清掉：`DepartmentRepository.list_departments` 在删掉名字兜底后成了全仓唯一没有调用者的方法，已删除（它的用途由 `list_with_user_count` 覆盖）。
- 未处理：`UserCreate.username` 的唯一列没有预检查，撞上时是 `IntegrityError` → 400「该用户ID或手机号已被占用」，安全但文案不准。UID 格式规则已在本次收口：`/initialize`、部门管理员建号与注册都用 `validate_uid` 一份（见 [手机号不能与别人的登录标识重合](./2026-10-17-login-identifier-phone-conflicts.md)）。
- 部署数据提醒：dev 库里 `verify_tc`（id 23）是一个 `department_id` 为空的生效超管，正是本决定针对的账号形态；本决定不修改部署数据。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 超管不指定部门时落到自己的部门 | 旧行为写 NULL，账号不可用 | `backend/server/routers/auth_router.py` | `test/unit/routers/test_auth_admin_user_creation.py`：200 + `department_id` 等于创建者部门且非空 | 把该分支退回「按名字找默认部门」→ 该用例红（实测 1 failed） | Passed |
| 超管可指定别的部门 | 指定被忽略 | 同上 | 同文件用例：落到目标部门 | — | Passed |
| 创建者自己没有部门时显式 400 且不建号 | 静默造出不可用账号 | 同上 | 同文件用例：400 + 文案 + 库里没有该用户 | — | Passed |
| 普通管理员继承自己的部门、不能指定 | 越权指定部门 | 同上 | 同文件用例：继承成功 + 指定时 403 | — | Passed |
| 真实 HTTP + 真实 PostgreSQL | 只在内存 SQLite 上成立 | `backend/test/integration/api/test_auth_router.py` | 新增 `test_superadmin_created_user_without_department_lands_in_creators_department`：真库建号 → 部门等于创建者部门 → 新账号登录 200 且 `/api/auth/me` 200（证明账号可用）；本机用一个临时超管账号驱动，`pytest … -k "department_lands or register"` → `3 passed`，跑完已软删。**该文件没有接进任何 workflow，且默认没有 `TEST_USERNAME`/`TEST_PASSWORD`（本机 16 例里 11 例 skip），所以这一行是手工证据；它还有一条隐含前提：凭据账号本身必须属于某个部门** | — | Passed |
| 生成的 uid 永远不是纯数字（管理员建号不会撞手机号） | 生成的 uid 与手机号形态重合 | `ars/services/user_identity_service.py` | `test/unit/services/test_user_identity_service.py`：`test_generated_uid_is_never_all_digits` | 去掉 `generate_uid` 的 `u` 前缀 → 该用例红 | Passed |
| 旧能力不存在： 按名字找「默认部门」并允许写 NULL 的兜底 | 半套规则共存 | 本记录 | 上表第一条的直接证据；`auth_router.py` 里 `默认部门` 只剩解释该历史的注释，名字查询本身已删除（`rg "list_departments\|默认部门" backend/server/routers/auth_router.py` 只命中注释） | — | Passed |
| 重新引入条件： 要让管理员建号落到某个固定部门时，用显式配置（例如系统配置项）而不是按名字猜，并同步更新本记录 | 无条件回退 | 本记录 | — | — | Passed |
