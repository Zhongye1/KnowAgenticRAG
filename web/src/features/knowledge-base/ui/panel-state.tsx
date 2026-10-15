/**
 * 分区级占位框：空态、加载中、加载失败共用同一套尺寸与外壳。
 *
 * 六个分区原来各写一套——高度有 380 / 420 / 520 三种，边框还混用 `--gray-150` 与旧的
 * `--color-border-1`，于是切页签时正文的纵向位置会跳。这里收成一处。
 *
 * 真正的解法是页面骨架（gaps 2.1/2.4）那条 flex 链：分区撑满内容区、占位框 `flex:1`。
 * 骨架落地前先用固定高度把位置对齐，届时只改这一个文件。
 *
 * 文件管理分区不用它：那一处的空态落在表体里、表头保留（参照同口径，见 gaps 1.4）。
 */
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
