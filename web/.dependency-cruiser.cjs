/**
 * 依赖规则。
 *
 * FSD 的结构规则（层间导入方向、同层切片隔离、跨切片只走 public API、段名与层名）
 * 由 Steiger 拥有，见 steiger.config.ts；这里只保留它不覆盖的两类：
 * 循环依赖，以及契约生成物的边界。
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
const GENERATED = '^src/shared/api/generated/';

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        '禁止循环依赖：相互引用会破坏分层与可测试性。契约生成物的内部实现结构不由本仓维护，单独排除。',
      from: { pathNot: GENERATED },
      to: { circular: true },
    },
    {
      name: 'generated-import-boundary',
      severity: 'error',
      comment:
        '契约生成物只允许被 api 段引用（shared/api 或各切片的 api/）：调用方走手写 API 层，界面与模型不直接触碰生成物',
      from: { pathNot: ['^src/shared/api/', '/api/'] },
      to: { path: GENERATED },
    },
    {
      name: 'generated-stays-inert',
      severity: 'error',
      comment:
        '生成物不得反向引用手写层：契约变更只能通过重新生成进入，不能就地打补丁',
      from: { path: GENERATED },
      to: { path: '^src/', pathNot: GENERATED },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    tsPreCompilationDeps: true,
    exclude: {
      path: ['(^src/app/main\\.tsx$)', '(\\.test\\.|\\.stories\\.)'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: '^src/(app|entities|pages|shared|widgets)/[^/]+',
      },
    },
  },
};
