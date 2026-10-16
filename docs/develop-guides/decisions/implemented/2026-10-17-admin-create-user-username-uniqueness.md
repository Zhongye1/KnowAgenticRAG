# 管理员建号的用户名查重改成精确查询

状态：implemented
类型：bug-fix
Owner：backend/server/routers/auth_router.py

事实分工：本决定拥有 `POST /api/auth/users` 的用户名查重与唯一约束冲突的处理；同一个处理器的部门归属归 [管理员建号的部门归属](./2026-10-17-admin-user-creation-department.md)，uid 与手机号的跨列约束归 [手机号不能与别人的登录标识重合](./2026-10-17-login-identifier-phone-conflicts.md)。

## 问题

`create_user` 的用户名查重是「翻一页 `list_users()`（默认 100 行、按 id 升序）再在 Python 里比名字」。生效用户超过 100 之后，第 100 行之后的重名就查不出来：插入时撞 `username` 唯一索引，而仓库没有全局 `IntegrityError` 处理，管理员看到的是 500，不是「用户名已存在」。同一个处理器的 `update_user` 与 `validate-username` 用的都是精确查询 `get_by_username`，只有这一处是翻页扫描。

另外唯一性检查都是先读后写：两个管理员同时建同一个用户名时，两边都能通过检查，也会走到同一条 500（数据不会被写坏，唯一索引挡住了）。

概率上这条是三条残余里唯一会随规模自然变坏的：本机当前 23 个生效用户，所以现在扫得全；一旦超过 100 就会开始漏。

## 决策

1. 用户名查重改成精确查询 `get_by_username(user_data.username)`，与 `update_user` / `validate-username` 同口径，不再受页长影响。
2. 唯一约束冲突折成 400：新增 `identity_admin_service.create_managed_user()` 负责这次落库，把 `IntegrityError` 折成 `IdentityConflictError`，路由只把它映射成 400「用户名或手机号已被占用」。**折算放在服务层是因为工程信任门禁不允许路由 import SQLAlchemy**（第一版写在路由里被 `verify_engineering_contracts.py` 直接拦下）；放服务层同时不动 `UserRepository.create` 的其它调用方（首启与注册各自已有自己的折算）。
3. 顺带删掉因此没有调用者的 `UserRepository.list_users`（列表接口用的是 `list_with_department`）。

## 替代方案

**把 `list_users()` 的 limit 调大**：仍然是有界扫描，只是把阈值往后推，用户再多一次还是漏。

**只加 `IntegrityError` 兜底、不动查重**：管理员拿到 400，但文案是「用户名或手机号已被占用」，把「重名」与「手机号被占用」混在一起，无法据此判断该改哪个字段——而且这条兜底要等插入失败才生效。

**把查重交给数据库唯一索引、前端只做提示**：管理员仍然要等到提交才知道重名，且错误文案不精确。

## 后果

- 管理员建号在任意用户规模下都能拿到精确的「用户名已存在」；并发撞唯一约束时是 400 而不是 500。
- 行为变化只在错误路径：>100 用户时的 500 → 400「用户名已存在」，并发重名时的 500 → 400「用户名或手机号已被占用」。
- 结构变化：管理员建号的落库从路由内联改成走 `identity_admin_service.create_managed_user`（路由不碰 SQLAlchemy，见上）。
- 未处理（非本次引入）：查重仍是先读后写、没有锁；跨行的唯一性最终仍由数据库唯一索引兜底（现在是 400）。这条与 [手机号不能与别人的登录标识重合](./2026-10-17-login-identifier-phone-conflicts.md) 里记的并发残余是同一类。
- 兜底的文案不区分约束：`create_managed_user` 把插入时的任何 `IntegrityError` 都折成「用户名或手机号已被占用」，所以并发的 uid 冲突或外键冲突（部门被并发删除）也会落到这句上——仍是 400，但指错了字段。概率低，暂不为它解析约束名。
- 同一处理器里剩下的扫描：`uid` 的唯一性走 `get_all_uids()` 全量取回（**没有 LIMIT**，与本次修掉的翻页扫描不是同一类缺陷），只是 O(N)；用户量很大时值得单独优化。

## 验证

| 验收主张 | 失败面 | 语义 Owner | 直接证据 / 命令 | 负向案例 | 当前结果 |
|---|---|---|---|---|---|
| 用户数超过一页时仍能查出重名并给「用户名已存在」 | 第 100 行之后漏查 → 500 | `backend/server/routers/auth_router.py` | `test/unit/routers/test_auth_admin_user_creation.py::test_username_check_is_exact_not_a_page_scan`（种 120 个用户，重名者最后插入，落在第一页之外） | 退回 `list_users()` 翻页扫描 → 文案变成「用户名或手机号已被占用」，该用例红（实测 1 failed） | Passed |
| 唯一约束冲突折成 400 而不是 500 | 并发重名 → 500 | `ars/services/identity_admin_service.py` | 上一条的负向案例同时证明兜底生效：去掉精确查重后走的正是这条兜底，返回 400「用户名或手机号已被占用」而不是 500 | 去掉 `create_managed_user` 里的 `except IntegrityError` → 同一次变异会变成未处理异常 | Passed |
| 全量门禁不退化 | 删掉 `list_users` 波及既有调用 | 本记录 | 后端 `test/unit` 全过；`verify_engineering_contracts.py` | — | Passed |
| 旧能力不存在： `create_user` 里的翻页查重、没有调用者的 `list_users` | 半套查重方式共存 | 本记录 | 上表第一条；`rg "list_users" backend/` 只剩注释与 `list_with_department` 的命中 | — | Passed |
| 重新引入条件： 需要分页遍历用户时用 `list_with_department` 或新的分页方法，不要把它当唯一性检查用 | 无条件回退 | 本记录 | — | — | Passed |
