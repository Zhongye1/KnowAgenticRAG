/**
 * 对话页的 antd 加载指示适配。
 *
 * shared/ui/spinner 是自绘的旋转环；antd Spin 只有包裹形态，独立指示用
 * `<SpinSpinIndicator>`（`.ant-spin`）。size 词汇映射到样式类。
 */
import { Spin } from 'antd';

import styles from './antd-spinner.module.css';

export type SpinnerProps = {
  size?: 'sm' | 'md';
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
};

export const Spinner = ({ size = 'md', className, ...rest }: SpinnerProps) => (
  <Spin
    {...(rest as object)}
    className={[size === 'sm' ? styles.sm : styles.md, className].filter(Boolean).join(' ')}
  />
);
