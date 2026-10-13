/**
 * 对话页的 antd 按钮适配。
 *
 * 把 shared/ui/button 的 `variant` / `size` 词汇映射到 antd Button：
 * 迁移期调用方不改 props，B6 收口后由调用方直接用 antd 词汇（或经由覆盖层定外观）。
 * 映射关系：ghost→text、outline→default、destructive→danger、sm→small；
 * `icon` / `icon-xs` 是方形容器，antd 没有对应 size，由本适配补样式类。
 */
import { Button as AntdButton, type ButtonProps } from 'antd';

import styles from './antd-button.module.css';

type Variant = 'ghost' | 'outline' | 'destructive' | 'default';
type Size = 'sm' | 'icon' | 'icon-xs';

export type ChatButtonProps = Omit<ButtonProps, 'type' | 'danger' | 'size' | 'variant' | 'ghost'> & {
  /** shared/ui 的词汇；迁移期保留，收口后删。 */
  variant?: Variant;
  size?: Size;
  /** 原 Button 的语义 `type="button"`；antd 的 type 是外观词汇，两者不同名。 */
  htmlType?: 'button' | 'submit';
};

const SIZE_CLASS: Record<Size, string | undefined> = {
  sm: undefined,
  icon: styles.icon,
  'icon-xs': styles.iconXs,
};

export const Button = ({
  variant,
  size,
  htmlType,
  className,
  ...rest
}: ChatButtonProps) => (
  <AntdButton
    {...rest}
    type={variant === 'destructive' || variant === 'default' ? 'primary' : 'text'}
    danger={variant === 'destructive'}
    htmlType={htmlType ?? 'button'}
    size={size === 'sm' ? 'small' : 'middle'}
    className={[variant === 'outline' ? styles.outline : '', SIZE_CLASS[size ?? 'sm'], className]
      .filter(Boolean)
      .join(' ')}
  />
);
