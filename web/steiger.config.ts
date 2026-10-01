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
]);
