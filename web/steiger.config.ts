import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

/**
 * FSD 结构规则。
 *
 * 层间导入方向、同层切片隔离、跨切片只走 public API、段名与层名由这套规则负责；
 * 循环依赖与契约生成物的边界留在 `.dependency-cruiser.cjs`，两者职责不重叠。
 */
export default defineConfig([
  // 契约生成物不是 FSD 代码，不参与结构审查
  { ignores: ['**/generated/**'] },
  ...fsd.configs.recommended,
  {
    // fsd/insignificant-slice 按「引用它的切片数」判定，一个消费方就建议合并。
    // 聊天运行时是跨页面的：当前只有 pages/chat，工作台与数据总览在 S3–S5 接入。
    // 它不并入页面，因此只对这个切片关闭该条，其余位置仍然生效。
    files: ['**/features/chat/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 知识库切片马上会有第二个消费方（详情页 pages/knowledge-base 随 S3.2 落地），
    // 列表页与详情页共用的查询、表单与类型都不适合塞进页面，因此同样不并入页面。
    files: ['**/features/knowledge-base/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 调试面板的入口只有用户菜单一处（上游同样只有 UserInfoComponent 引用 DebugComponent）。
    // 日志解析、四个接口与查询装配和弹窗是一体的：并入 widgets/app-sidebar 会让侧边栏同时
    // 拥有身份切换与系统配置写入，因此保留切片，只关掉「单引用建议合并」这一条。
    files: ['**/features/debug/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 任务中心的入口只有导航列底部一处（上游同样只有 AppLayout 的 UserInfoComponent 插槽）。
    // 四个接口、状态与时长文案、轮询装配和面板是一体的：并入 widgets/app-sidebar 会让侧边栏
    // 同时拥有后台作业轮询与取消/删除写入，因此与 features/debug 同口径只关闭这一条。
    files: ['**/features/task-center/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 供应商面板的入口只有 /agent-manage 一处（上游同样挂在 AgentManageView 的 tab 里）。
    // api/model/lib/ui 四段与三个对话框是一体的：并入 pages/agent-manage 会让页面直接持有
    // 供应商写入、模型清单与凭据表单，因此与 features/debug 同口径只关闭这一条。
    files: ['**/features/model-providers/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 数据总览的入口只有 /dashboard 一处（上游同样挂在 DashboardView 的两个 tab 里）。
    // 十一个端点、图表 option 构造、配色解析与两类面板是一体的；并入 pages/dashboard 会让
    // 页面同时持有超管统计请求装配、canvas 生命周期与审计表筛选，页面就不再只是组装。
    files: ['**/features/dashboard/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 智能体面板的入口同样只有 /agent-manage 一处（与供应商 tab 并列）。搜索、分组、统计与
    // 卡片是一体的；并入页面会让页面同时持有卡片渲染。列表读取本身已经上移到 entities/agent，
    // 这一条只针对面板切片。
    files: ['**/features/agents/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 个人空间页面的入口只有 /workspace 一处；三段式（侧栏/文件表/预览）、格式化与控制器是一体的，
    // 并入 pages/workspace 会让页面同时持有端点编排与预览编辑缓冲。
    files: ['**/features/workspace/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // entities/workspace 目前的消费方是 features/workspace（页面控制器）与 features/chat 的
    // 委派分支，但后者不单独 `import` 它的模块（同 entities/agent 的那条说明），因此同样按
    // 「只关闭这一条」处理，而不是把端点与归一塞进页面。
    files: ['**/entities/workspace/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 三个分区的实体与面板各有两端消费方（features/settings 外壳通过 `@x` 公共 API 引用），
    // 但 steiger 的引用统计把被 off 掉的切片文件从树里摘掉，这些引用不计入（同 entities/agent
    // 的说明）。按同一口径只关掉「单引用/零引用建议合并」，而不是把分区并进外壳。
    files: [
      '**/features/api-keys/**',
      '**/features/agent-env/**',
      '**/entities/user-apikey/**',
      '**/entities/agent-env/**',
    ],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 设置外壳的入口只有用户菜单一处；分区导航与装配是它自己的事实，各分区实体与面板
    // 属于各自的切片（account-settings / api-keys / agent-env），因此保留外壳切片。
    files: ['**/features/settings/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 账户设置弹窗的入口只有用户菜单一处（参照同样只有 UserInfoComponent 引 SettingsModal）。
    // 资料写入、头像上传、Memory 开关与校验是一体的：并入 widgets/app-sidebar 会让侧边栏
    // 同时拥有身份展示与用户资料写入，因此保留切片，只关掉「单引用建议合并」这一条。
    files: ['**/features/account-settings/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // entities/agent 有两个 feature 消费方（features/chat 的候选列表、features/agents 的面板），
    // 但这条规则看不到它们：对 features/* 关闭本规则时，steiger 会把那些文件从本规则的树里摘掉
    // （dist 的 `prepareVfsForRuleRun` 对 `severity: 'off'` 的 glob 取反），于是它们的引用不计入。
    // 实测：同一条导入放进 widgets 会被计入，放进 features 不会。这里按同一口径关闭本规则，
    // 而不是把切片并进页面。
    files: ['**/entities/agent/**'],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 设置弹窗的四个管理分区入口都只有 features/settings 一处（上游同样只挂在 SettingsModal 的
    // tab 里）。与 entities/agent 同因：唯一消费方是 features/* 时本规则看不到引用。每个分区都是
    // 一屏完整的管理面（列表、筛选、表单与写入），并入外壳会让外壳同时拥有七个领域的状态。
    files: [
      '**/features/basic-settings/**',
      '**/features/ocr-settings/**',
      '**/features/user-management/**',
      '**/features/department-management/**',
    ],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 三个新实体同样只有 features/* 的消费方（部门与用户管理共读部门、两个管理面读用户、
    // OCR 与基本设置共读系统配置），因此与 entities/agent 同口径关闭这一条。
    files: [
      '**/entities/department/**',
      '**/entities/user-admin/**',
      '**/entities/system-config/**',
    ],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
  {
    // 扩展页的「工具」tab：面板只有 pages/extensions 一个消费方，工具清单只有它读；
    // 「MCP」面板有 pages/extensions 与 pages/mcp-detail 两个消费方，但 entities/mcp 只有前者读。
    // 与上面各条同因（本仓的约定是实体持端点、切片持界面），按同一口径关闭。
    files: [
      '**/features/tools/**',
      '**/entities/tool/**',
      '**/entities/mcp/**',
    ],
    rules: { 'fsd/insignificant-slice': 'off' },
  },
]);
