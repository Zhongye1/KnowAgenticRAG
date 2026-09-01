/** @type {import('dependency-cruiser').IConfiguration} */
const FEATURES = [
  'auth',
  'comments',
  'discussions',
  'home',
  'knowledge',
  'teams',
  'users',
];

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '禁止循环依赖：相互引用会破坏分层与可测试性',
      from: {},
      to: { circular: true },
    },
    // feature 之间互不引用：按 feature 数组展开，新增 feature 时同步加入
    ...FEATURES.map((feature) => ({
      name: `no-cross-feature-${feature}`,
      severity: 'error',
      comment: `${feature} 不得依赖其他 feature：共享能力下沉到 components / lib / hooks / utils`,
      from: { path: `^src/features/${feature}/` },
      to: { path: '^src/features/', pathNot: `^src/features/${feature}/` },
    })),
    {
      name: 'features-not-to-app',
      severity: 'error',
      comment: 'feature 禁止反向依赖 app 层：app 负责组装路由与 Provider，feature 保持独立',
      from: { path: '^src/features/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'shared-not-to-app-features',
      severity: 'error',
      comment: '共享层（lib / hooks / components / utils / config / types）禁止依赖 app 与 feature',
      from: { path: '^src/(lib|hooks|components|utils|config|types)/' },
      to: { path: '^src/(app|features)/' },
    },
    {
      name: 'generated-is-leaf',
      severity: 'error',
      comment: 'OpenAPI 生成产物是叶子节点：只被消费，不得反向依赖 src 内代码（改 generated 需重新生成）',
      from: { path: '^src/generated/' },
      to: { path: '^src/' },
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
      path: [
        '(^src/main\\.tsx$)',
        '(^src/testing/)',
        '(\\.test\\.|/__tests__/|\\.stories\\.)',
      ],
    },
    reporterOptions: {
      dot: {
        collapsePattern: '^src/(app|components|features|generated|hooks|lib|utils)/[^/]+',
      },
    },
  },
};
