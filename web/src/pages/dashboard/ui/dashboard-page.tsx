/**
 * 数据总览页。
 *
 * 两个 tab 与「点过才加载」：`?tab=threads` 可深链，其余值归到 `overview`；切 tab 只改 URL，
 * 激活过的 tab 不卸载，来回切换不重发请求、图表实例保留；未激活的 tab 不挂载，其查询
 * 不在首屏发出。反馈弹窗挂在页面级，概览与工具栏两个入口共用同一实例。
 *
 * 页头用 `PageHeader` + `PageHeaderTabs`，与智能体管理、扩展页同一套形态；tab 上下文
 * 说明文字放行尾动作位。外壳（设置、主题、任务中心）属于 AppLayout，本页不重复实现。
 */
import * as React from 'react';
import { useSearchParams } from 'react-router';

import {
  DashboardOverviewTab,
  DashboardThreadsTab,
  FeedbackDialog,
} from '@/features/dashboard';
import { ContentLayout } from '@/shared/ui/content-layout';
import { PageHeader, PageHeaderTabs } from '@/shared/ui/page-header';

type DashboardTab = 'overview' | 'threads';

const TAB_ITEMS = [
  { key: 'overview' as const, label: '系统概览' },
  { key: 'threads' as const, label: '会话分析' },
];

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
      <div className="flex flex-col gap-4 py-4">
        <PageHeader
          title="数据总览"
          actions={
            <span className="text-xs text-color-text-3">
              {TAB_CONTEXT[current]}
            </span>
          }
        >
          <PageHeaderTabs
            tabs={TAB_ITEMS}
            current={current}
            ariaLabel="数据总览视图切换"
            onChange={selectTab}
          />
        </PageHeader>

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
