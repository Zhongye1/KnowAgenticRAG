import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import { LoaderCircle } from 'lucide-react';

// 兼容旧用法 size="lg"/"xl"，尺寸映射沿用迁移前的组件
const SPINNER_SIZE_CLASSES = {
  sm: 'size-4',
  md: 'size-8',
  lg: 'size-16',
  xl: 'size-24',
} as const;

function Spinner({
  className,
  size = 'sm',
  ...props
}: React.ComponentProps<'output'> & {
  size?: keyof typeof SPINNER_SIZE_CLASSES;
}) {
  return (
    // `output` 的隐式角色就是 `status`，加载状态由它承载。`inline-flex` 让外层紧贴 svg，
    // 不引入行框的基线留白；尺寸与颜色仍落在 svg 上，调用点的布局不变。
    <output
      data-slot="spinner"
      aria-label="Loading"
      className="inline-flex"
      {...props}
    >
      <LoaderCircle
        className={cn('animate-spin', SPINNER_SIZE_CLASSES[size], className)}
      />
    </output>
  );
}

export { Spinner };
