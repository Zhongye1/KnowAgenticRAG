# 设置面板补齐四个管理分区（基本设置 / OCR 配置 / 用户管理 / 部门管理）

状态：implemented
类型：feature
Owner：web/src/features/settings/ui/settings-modal.tsx

事实分工：四个分区各自拥有自己的一屏——`web/src/features/basic-settings`（默认项与内容审查、Skill 来源白名单、服务链接）、`web/src/features/ocr-settings`（默认引擎选择 + 四组服务凭据）、`web/src/features/user-management`（分页表、筛选、增删改）、`web/src/features/department-management`（部门表与创建/编辑）；端点与归一在 `web/src/entities/{department,user-admin,system-config}`；角色门控与导航顺序在 `web/src/features/settings/ui/settings-modal.tsx`。跨切片引用走 FSD 的 `@x` 公共 API。参照实现 `/home/liskarm/桌面/RAGS/Yuxi/web/src/components/{BasicSettingsSection,OCRSettingsSection,OCRSelector,UserManagementComponent,DepartmentManagementComponent,SkillSettingsSection}.vue` 只提供视觉与行为事实。

## 问题

1. **设置外壳缺四个分区**：上一记录接入三个登录态分区后，参照桌面端剩下的四项（基本设置 / OCR 配置 / 用户管理 / 部门管理）在本仓前端仍为零消费者，后端 `/api/system/config*`、`/api/system/ocr/*`、`/api/auth/users*`、`/api/departments*` 与生成 SDK（257 个操作）全部就绪。
2. **配置键的取舍不是产品决策**：`ars/config/options.py` 定义的 `system_options` 字段（`default_model` / `fast_model` / `embed_model` / `reranker` / `content_guard*` / `default_ocr_engine`）与四组 OCR 凭据项（`mineru_ocr_host_opts` 等）与参照同名同构——后端已经拥有这些键，前端照做即可，不新增也不裁剪。
3. **参照的两个行为缺陷**（走查参照源码时确认）：
   - `DepartmentManagementComponent.handleDepartmentFormSubmit` 无条件校验 `adminUid`，但编辑态既不渲染该输入框也不预填（`showEditDepartmentModal` 把 `adminUid` 置空）——**编辑部门永远被「请输入管理员UID」拦下**，该分支不可达。
   - 用户管理的「最后登录」与表格时间是两个不同实现（`formatTime` 走 dayjs 的 Asia/Shanghai，API Key 面板同名字段走 `toLocaleString`），同一屏里两套时间口径。

## 决策

1. **每个分区一个切片，外壳只做装配与门控**：`features/{basic-settings,ocr-settings,user-management,department-management}`。它们都是一屏完整的管理面（列表 + 筛选 + 表单 + 写入），并入外壳会让外壳同时拥有七个领域的状态。
2. **门控按参照的角色口径**：新增 `useIsAdmin`（`admin | superadmin`，与参照 `userStore.isAdmin` 同值）——基本设置 / OCR 配置 / 用户管理对它开放，部门管理只对 `useIsSuperuser` 开放，账户设置 / API Keys / 环境变量对所有登录用户开放。导航顺序与参照桌面端一致：账户设置、API Keys、基本设置、OCR 配置、用户管理、部门管理、环境变量。
3. **默认分区固定账户设置**：参照由调用方传 `initialTab`，它自己的用户菜单固定传 `account`（`UserInfoComponent.vue:144`）；`isAdmin ? 'base'` 那条回退只在没有指定分区时生效，当前无调用方走那条路径。本仓入口同样只有用户菜单，因此不引入 `initialTab` 参数。
4. **配置读写只有一处缓存事实**：`entities/system-config` 拥有系统配置、通用配置项、OCR 引擎与 OCR 健康四个 query key；基本设置与 OCR 配置共读系统配置（前者按 `_config_items` 取标签，后者取 `default_ocr_engine`），写入后由写入层回写缓存。部门与用户管理共读 `['departments']`（普通管理员的部门筛选退到可见用户的部门名，因为参照也只让超管拉全量部门列表）。
5. **用户写回只带要改的字段**：后端 `UserUpdate` 是 `extra="forbid"`，多带字段会被 422 拒绝；`updateManagedUser` 只发出现的键，手机号留空与参照一致表示「不改」。
6. **修正参照的部门编辑缺陷**：`validateDepartmentForm` 按 `editing` 决定是否校验管理员字段——编辑只改名称与描述，与它渲染出来的表单一致。负向用例固定在 `department-form.test.ts`（同一份值在创建路径上仍被拦下）。
7. **越界页由渲染时收敛，不写回状态**：`useUserManagement` 先用「请求页」取一次总数（换 key 时 `keepPreviousData` 兜住上一份），再按总数算出有效页并据此建第二个查询键；页码在范围内时两个 `useQuery` 同 key，TanStack 去重成一次请求。这样删除、刷新与窗口重聚焦后的重取都不会停在空页上，且不需要在 effect 里写状态（`react(set-state-in-effect)` 会拦下那种写法，参照的 `fetchUsers` 里正是那种写法）。
8. **显示格式化的共用**：用户名与手机号规则提到 `shared/lib/user-identity.ts`（账户设置 / 用户管理 / 部门创建三处消费，规则源是 `user_identity_service.py`）；分钟级时间戳与搜索片段格式化收进 `shared/lib/format/`。顺带修掉 API Key 面板里一个不存在的 token 引用（`--color-success-600`，同族只有 `--color-success-700`）。评审纠正过一次：同一处我把 `var(--font-mono)` 误判为不存在（它定义在 `src/index.css` 的 `@theme` 里）并换成了硬编码字体栈，已改回 token。
9. **外壳对齐参照的弹窗形态**：去掉 antd 的标题栏与默认关闭钮（`title={null}` + `closable={false}`），关闭钮自绘在左上角压在导航栏上方（`.sider` 的 52px 上内边距就是给它留的位置）；`.ant-modal-content` 的内边距归零、圆角 12px，导航栏贴到弹窗左边缘；内容高度 `min(84vh, 840px)`。上一记录把「自定义关闭钮 → antd 默认关闭钮」记作偏离，本轮按参照改回。
10. **账户资料字段占满可用宽度**：`.left` / `.fields` 补 `flex: 1`（参照有、本仓漏了），否则手机号会被省略号截成 `15251638…`。
11. **显式偏离参照**：

| 参照 | 本仓 | 理由 |
|---|---|---|
| 表格用 `a-table` | 原生 `table` + CSS Module 复刻外观（gray-50 表头 / gray-150 分隔线 / gray-25 悬停） | 与已落地的 `features/api-keys` 同口径；antd 默认表格样式要覆盖的比自绘多 |
| 模型选择是三个各写一遍的自定义下拉（含候选搜索与连通性检查） | antd `Dropdown` + 供应商分组菜单 | 搜索与连通性检查属于供应商管理面（`features/model-providers` 已有 `useTestModelStatus` / `refreshModelCache`），设置页不重复提供 |
| 服务链接用 `window.open` | 带 `href` 的 antd 按钮 | 语义是链接，且不受弹窗拦截影响 |
| 分区 `v-show` 保活 | 条件渲染（切回时复用缓存并后台重取） | 少一层常驻挂载；数据新鲜度更好 |
| 超管角色徽章 `rgba(217,119,6,.08)` + `#d97706` | `--color-warning-50` + `--color-warning-700` | `check:tokens` 禁止硬编码颜色 |
| 用户列表角色文案对未知角色回落原值 | 复用 `formatUserRole`（未知角色给「未知角色」） | 后端把 `role` 约束为三个枚举值，回落分支不可达；避免第二个角色文案事实源 |
| 「最后登录」用 dayjs Asia/Shanghai | 浏览器本地时区的 `YYYY-MM-DD HH:mm` | 与同弹窗的 API Key 面板同口径（+08:00 环境下两者相同） |
| 用户名只在后端校验字符集 | 提交前也按后端同一正则拦截 | 文案与后端相同，只是更早给出 |
| Star 推广卡 | 不做 | 上一记录已记录的偏离，延续 |

不造：参照的「去配置」跳转（OCR 选择器在设置页里就是配置页本身）、`initialTab` 参数（无调用方）。

## 替代方案

**把四个分区并进 `features/settings`。** 最少的切片数，但外壳会同时持有部门写入、用户分页、配置键与 OCR 凭据四套状态，且 `settings` 的 `@x` 公共 API 将失去意义（没有别的切片要引用它）。

**给四个分区各开一个页面路由（`/settings/*`）。** 参照明确把七项收在一个弹窗里，拆成路由会让「我的配置」散在两个信息架构里。

**不修参照的部门编辑缺陷，照抄。** 照抄等于交付一个不可用的编辑功能；偏离的代价只是校验条件多一个参数，收益是功能真的可用。

## 后果

- **`steiger.config.ts` 的例外清单继续变长**（本批新增四个 features 与三个 entities，共九条同因例外：引用统计在 `severity: 'off'` 的切片文件上失明）。上一记录已提出这条清单的治理问题，本批进一步放大。
- **`entities/system-config` 成为两个分区的共同上游**：基本设置与 OCR 配置都写 `['system-config']`；若将来出现第二个写入方，需要重新审视是否需要按 key 分段失效。
- **服务链接的端口是部署常量**（7474 / 5050 / 9001 / 9091），与 `docker-compose.yml` 的映射一致；改变端口映射时这里需要同步。
- **`useIsAdmin` 与 `useIsSuperuser` 都只影响呈现**，授权仍由后端 `get_admin_user` / `get_superadmin_user` 判定。
- **两条既有决策记录的 Owner 失效引用已修正**：`2026-10-12-chat-antd-controls{,-2}.md` 指向的过渡适配层 `antd-button.tsx` 已按该记录决策 1 在 B6 删除，Owner 改为仍承载其主张的 `web/src/app/theme/antd-provider.tsx`（`python3 scripts/verify_engineering_contracts.py` 因此从 2 个错误变为通过）。

## 验证

**单测与门禁（本机 Node 26）**

| 命令 | 结果 |
|---|---|
| `NODE_ENV=test vitest run` | 220 文件、2368 例通过（新增 11 个文件 48 例；`model-provider-panel` 的既有装载失败与本批无关） |
| `tsc --noEmit` / `oxlint src` / `steiger` / `depcruise` / `check:tokens` / `prettier --check` / `vite build` | 全部通过（oxlint 0 error / 28 warning，与改动前同数，新增文件 0 warning） |
| `python3 scripts/verify_engineering_contracts.py` / `python3 -m unittest scripts.test_verify_engineering_contracts` | 通过（顺带修掉两条既有 Owner 失效引用） |

新增用例的断言面：部门列表/创建/编辑/删除的请求载荷与归一、部门表单在创建与编辑两条路径上的校验差别（含参照缺陷的负向用例）、用户分页查询的参数裁剪与 `UserUpdate` 的字段裁剪、页码在总数变小后的收敛（含删除路径）、系统配置与配置项的归一（含敏感来源三态与列表默认值）、模型清单归一（重复供应商与缺 spec 的去重）、OCR 只读展示的四条分支与编辑态保存载荷、OCR 引擎清单与健康检测各自的取数时机、设置外壳在三种角色下的导航项与顺序、默认分区与切换。

**独立评审（不继承开发上下文的 Reviewer Agent）**

评审在提交前跑过一遍，给出 3 条 should-fix 与 5 条 nit，全部已处理：

| 发现 | 处理 |
|---|---|
| OCR 引擎清单挂在面板打开上，触发钮在首次渲染显示占位文案而不是已配置的引擎 | `useOcrEngines()` 改为挂载即取（与参照的 `onMounted` 同口径），健康检测仍只在打开时取；用例断言两个 hook 的 `enabled` 实参 |
| `var(--font-mono)` 被误判为不存在的 token，换成了硬编码字体栈（它定义在 `src/index.css` 的 `@theme`，另有四处消费方） | 六处改回 `var(--font-mono)`；记录里的表述一并订正 |
| 分页丢掉了参照的越界收敛，刷新后可能停在空页 | 见决策 7（渲染时收敛），并补了 `use-user-management.test.tsx` 的收敛用例 |
| `shared/lib/index.ts` 里四个无消费方的再导出；`user-identity` / `department-form` 里若干只在本模块使用的常量仍对外导出 | 全部收回模块私有 |
| OCR 用例的 mock 忽略 `enabled`、用户面板用例忽略查询参数、部门表单用例断言了界面产生不了的输入 | mock 改为尊重实参并断言取数时机；新增控制器级用例覆盖分页；删掉不可达断言 |

**真实页面走查（zwj / superadmin，真实后端 `localhost:5173`，参照在 `localhost:5175` 同库对照）**

导航：设置弹窗按参照桌面端的顺序出现七项（账户设置 / API Keys / 基本设置 / OCR 配置 / 用户管理 / 部门管理 / 环境变量），默认落在账户设置。

| 分区 | 走查结论 |
|---|---|
| 部门管理 | 三行与后端 `/api/departments` 一致；研发部（id=1）删除禁用；**编辑分支可用**——改名「产品部（走查）」提交后后端复核为 `2 产品部（走查） 7`，再改回「产品部」（参照在这条路径上被自己的隐藏字段校验拦住） |
| 用户管理 | 20 行第一页、总数 21（分页器出现）；搜索占位、部门/权限筛选与参照一致；自己与超管的删除按钮禁用；编辑态默认不校验密码，勾「修改密码」后拦下空密码 |
| OCR 配置 | 默认引擎触发钮显示已配置的 `MinerU Official API`；四组凭据卡的只读值分别为「读取 MINERU_API_URI」「已通过 MINERU_API_KEY 配置」「读取 PADDLEX_URI」「读取 PADDLEOCR_API_URL」「未配置」，与 `sensitive_state` 三态一致；引擎下拉可用 2 项、不可用 5 项折叠，展开后逐条显示后端健康说明（如「PADDLEOCR_API_TOKEN 未配置」） |
| 基本设置 | 四段齐备；内容审查级联可用（开总开关 → 出 LLM 开关 → 出模型选择）；Skill 白名单显示后端默认 `github.com` / `modelscope.cn`；模型下拉按供应商分组（SiliconFlow + 3 个模型，当前项高亮） |

走查数据已复原（`enable_content_guard*` 回到 false、部门名回到「产品部」，后端复核确认）。

截图：`web/alembic/pages/account-settings/evidence/settings-{department,users,ocr,basic}-light-1440x900.png`、`settings-ocr-engine-dropdown-light-1440x900.png`、`settings-basic-model-dropdown-light-1440x900.png`、`settings-basic-content-guard-light-1440x900.png`、`settings-department-dark-1440x900.png`；参照对照图 `yuxi-settings-{department,users}-light-1440x900.png`。

**走查中发现并修掉的问题**

| 问题 | 处理 |
|---|---|
| 弹窗按钮与分页器一直是英文（`20 / page`） | **既有缺陷，与本批无关但直接可见**：`import zhCN from 'antd/locale/zh_CN'` 拿到的是 CJS 转发模块的命名空间对象（`{default, __esModule}`），`ConfigProvider` 读不到 `Modal.okText` 等键就退回英文；vitest 走 Vite 的 `interopDefault` 因此单测看不出。改为 `antd/es/locale/zh_CN`（真正的 ESM 默认导出），复核为「取消/确定」「20 条/页」 |
| OCR 默认引擎触发钮常驻转动图标 | `useOcrHealth` 用 `isPending` 报加载态，而禁用中的查询 `isPending` 恒为 true；改报 `isFetching`，并补 `use-ocr-health.test.tsx` |
| 用户表角色徽章折成两行、行高被撑到 70px | 徽章加 `white-space: nowrap`；`.userCell` 由 `inline-flex` 改 `flex`（行内盒子按基线多占一行）；`.userUid` 加 nowrap（等宽字体下比用户名宽）；时间列加 nowrap。行高回到 53px（参照 56px） |
| 操作列两个图标钮上下叠成两排 | 操作列加 `white-space: nowrap`，宽度 10%→12%（用户列 26%→24%），两钮回到同一行 |
| 弹窗外壳 860px，角色徽章与时间列都放不下 | 改为 980px，与参照的 `maxWidth: 980px` 同值 |

**未验证范围（不计为通过）**

- 创建部门（连带创建管理员）与删除部门的真实链路：走查只覆盖了列表与编辑；创建/删除只由单测覆盖请求载荷与确认分支。
- 用户的新建/编辑/删除真实链路：同样只由单测覆盖（分页、筛选与禁删门禁在页面上验过）。
- 非超管角色下的界面：走查账号是超管，普通管理员与普通用户的导航门禁只有单测覆盖。
- 窄屏（≤760px）与「修改密码」勾选后的真实提交。
- OCR 凭据的实际保存（走查只看了只读态与编辑态的进入/取消；保存会清库值，未做）。
