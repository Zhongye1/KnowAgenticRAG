/**
 * 智能体管理页里的两类小标签。
 *
 * 两处此前各写了一份「圆角浅底 span」，取值互不相同也都和参照对不上；这里收成一处，
 * 各自对齐参照里对应的那一类：
 * - `AgentCardTag`：参照 `InfoCard` 的 `.card-tag`（叠 `.tag-gray`，无边框）。
 * - `AgentSummaryChip`：参照 `AgentManageView` 的 `.summary-strip span`。
 */
import * as React from 'react';

/** 卡片上的小标签：参照 `.card-tag` + `.tag-gray`。 */
export const AgentCardTag = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex min-h-[22px] items-center rounded-[4px] bg-[var(--gray-100)] px-2 text-[11px] font-semibold leading-none text-[var(--gray-600)]">
    {children}
  </span>
);

/** 页头上的统计芯片：参照 `.summary-strip span`。 */
export const AgentSummaryChip = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <span className="rounded-[7px] border border-[var(--gray-100)] bg-[var(--gray-10)] px-2.5 py-1.5 text-xs leading-[18px] text-[var(--gray-700)]">
    {children}
  </span>
);
