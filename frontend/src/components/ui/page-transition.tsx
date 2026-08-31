import type { ReactNode } from 'react';

import { cn } from '@/utils/cn';

type PageTransitionProps = {
  children: ReactNode;
  className?: string;
};

/**
 * 页面转场容器：路由切换时仅页面内容播放滑动 / 淡出动画，
 * NavBar、侧边栏等常驻元素留在 root 快照中保持静止。
 * 样式见 src/index.css 的 .page-transition。
 */
export const PageTransition = ({
  children,
  className,
}: PageTransitionProps) => (
  <div className={cn('page-transition', className)}>{children}</div>
);
