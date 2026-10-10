/**
 * 数据总览页。
 *
 * 两个 tab 与「点过才加载」：`?tab=threads` 可深链，其余值归到 `overview`；切 tab 只改 URL，
 * 激活过的 tab 不卸载，来回切换不重发请求、图表实例保留；未激活的 tab 不挂载，其查询
 * 不在首屏发出。反馈弹窗挂在页面级，概览与工具栏两个入口共用同一实例。
 *
 * 页头与外壳（设置、主题、任务中心）属于 AppLayout，本页不重复实现。
 */
import * as React from 'react';
import { useSearchParams } from 'react-router';

import {
  DashboardOverviewTab,
  DashboardThreadsTab,
  FeedbackDialog,
} from '@/features/dashboard';
import { ContentLayout } from '@/shared/ui/content-layout';
import { cn } from '@/shared/lib';

type DashboardTab = 'overview' | 'threads';

const TAB_LABELS: Record<DashboardTab, string> = {
  overview: '系统概览',
  threads: '会话分析',
};

const TAB_CONTEXT: Record<DashboardTab, string> = {
  overview: '系统运行与资源使用',
  threads: '会话趋势与历史审计',
};

const normalizeTab = (tab: string | null): DashboardTab =>
  tab === 'threads' ? 'threads' : 'overview';

export const DashboardPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const current = normalizeTab(searchParams.get('tab'));
  /** 激活过的 tab 只增不减：切回来不重新取数，也不重建图表。 */
  const [activated, setActivated] = React.useState<DashboardTab[]>([current]);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);

  // URL 是「当前 tab」的外部事实来源（深链、前进后退都会改它），激活集合只能单调增长。
  // 用渲染期调整 state 的写法同步，避免在 effect 里 setState 引发级联渲染。
  if (!activated.includes(current)) {
    setActivated([...activated, current]);
  }

  const selectTab = (tab: DashboardTab) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (tab === 'overview') next.delete('tab');
        else next.set('tab', tab);
        return next;
      },
      { replace: true },
    );
  };

  const openFeedback = () => setFeedbackOpen(true);

  return (
    <ContentLayout title="数据总览">
      <div className="flex flex-col gap-4 pb-6">
        <nav
          className="flex flex-wrap items-center gap-1 border-b border-color-border-1"
          aria-label="数据总览视图切换"
        >
          {(Object.keys(TAB_LABELS) as DashboardTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-current={tab === current ? 'page' : undefined}
              className={cn(
                'rounded-t-medium px-3 py-2 text-sm transition-colors',
                tab === current
                  ? 'border-b-2 border-primary-6 font-medium text-color-text-1'
                  : 'text-color-text-3 hover:text-color-text-1',
              )}
              onClick={() => selectTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
          <span className="ml-2 text-xs text-color-text-3">
            {TAB_CONTEXT[current]}
          </span>
        </nav>

        {activated.includes('overview') ? (
          <div hidden={current !== 'overview'}>
            <DashboardOverviewTab onOpenFeedback={openFeedback} />
          </div>
        ) : null}

        {activated.includes('threads') ? (
          <div hidden={current !== 'threads'}>
            <DashboardThreadsTab onOpenFeedback={openFeedback} />
          </div>
        ) : null}
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </ContentLayout>
  );
};
