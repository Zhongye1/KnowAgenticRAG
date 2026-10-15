/** 分区级占位框：空态、加载中、加载失败共用同一套尺寸与外壳。 */
import * as React from 'react';

/** 占位框高度；与画布类分区（图谱 / 导图）的内容高度一致，空态与内容态位置相同。 */
export const PANEL_STATE_BOX_CLASS =
  'flex h-[520px] flex-col items-center justify-center gap-3 rounded-[8px] border border-[var(--gray-150)] bg-[var(--gray-0)] px-4 text-center';

type PanelStateBoxProps = {
  children: React.ReactNode;
  /** 覆盖默认尺寸（例如内容区本身更矮的弹窗内预览）。 */
  className?: string;
};

export const PanelStateBox = ({ children, className }: PanelStateBoxProps) => (
  <div className={className ?? PANEL_STATE_BOX_CLASS}>{children}</div>
);
