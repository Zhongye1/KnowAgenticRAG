/**
 * 智能体管理页。
 *
 * 「智能体 / 模型供应商」两个 tab，`?tab=providers` 可深链；模型供应商 tab 只对管理员
 * 可见，智能体 tab 仍是占位。
 */
import * as React from 'react';
import { useSearchParams } from 'react-router';

import { useUser } from '@/entities/session';
import { ModelProviderPanel } from '@/features/model-providers';
import { Button } from '@/shared/ui/button';
import { ContentLayout } from '@/shared/ui/content-layout';
import { PagePlaceholder } from '@/shared/ui/page-placeholder';

type AgentManageTab = 'agents' | 'providers';

const TAB_LABELS: Record<AgentManageTab, string> = {
  agents: '智能体',
  providers: '模型供应商',
};

/** 可见 tab：模型供应商只给管理员（授权边界仍在后端 `get_admin_user`）。 */
const useManageTabs = (): AgentManageTab[] => {
  const user = useUser();
  const isAdmin =
    user.data?.role === 'admin' || user.data?.role === 'superadmin';
  return isAdmin ? ['agents', 'providers'] : ['agents'];
};

export const AgentManagePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = useManageTabs();
  const requestedTab = searchParams.get('tab') as AgentManageTab | null;
  const current =
    requestedTab && tabs.includes(requestedTab) ? requestedTab : tabs[0];

  return (
    <ContentLayout title="智能体管理">
      <div className="flex flex-col gap-4">
        <nav
          className="flex flex-wrap gap-1 border-b border-color-border-1"
          aria-label="智能体管理视图切换"
        >
          {tabs.map((tab) => (
            <Button
              key={tab}
              type="button"
              variant="ghost"
              className="rounded-b-none"
              aria-current={tab === current ? 'page' : undefined}
              onClick={() =>
                setSearchParams(
                  (params) => {
                    const next = new URLSearchParams(params);
                    next.set('tab', tab);
                    return next;
                  },
                  { replace: true },
                )
              }
            >
              {TAB_LABELS[tab]}
            </Button>
          ))}
        </nav>

        {current === 'providers' ? (
          <ModelProviderPanel />
        ) : (
          <PagePlaceholder
            title="智能体"
            description="该面板随对应分片接入。"
          />
        )}
      </div>
    </ContentLayout>
  );
};
