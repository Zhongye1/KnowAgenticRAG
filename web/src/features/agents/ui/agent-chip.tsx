/** 智能体管理页里的两类小标签。 */
import * as React from 'react';

/** 卡片上的小标签。 */
export const AgentCardTag = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex min-h-[22px] items-center rounded-[4px] bg-[var(--gray-100)] px-2 text-[11px] font-semibold leading-none text-[var(--gray-600)]">
    {children}
  </span>
);

/** 页头上的统计芯片。 */
export const AgentSummaryChip = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <span className="rounded-[7px] border border-[var(--gray-100)] bg-[var(--gray-10)] px-2.5 py-1.5 text-xs leading-[18px] text-[var(--gray-700)]">
    {children}
  </span>
);
