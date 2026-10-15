/**
 * 技能图标：渲染 `getSkillIcon` 解析出的 Lucide 组件。
 *
 * 图标以 prop 传入，而不是在渲染期把调用结果命名成组件：后者会被 React Compiler 判成
 * 「渲染期创建组件」（图标本身是模块级常量，并没有真的新建）。
 */
import type { LucideIcon } from 'lucide-react';

export const SkillIcon = ({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className?: string;
}) => <Icon className={className} aria-hidden />;
