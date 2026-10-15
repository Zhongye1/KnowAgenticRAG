/**
 * 智能体管理页。
 *
 * 页头用 `PageHeader` + `PageHeaderTabs`（标题、内联的视图切换 tab、右侧统计芯片）。
 * `?tab=providers` 可深链，模型供应商 tab 只对管理员可见。
 *
 * 「去对话」在这里接线：面板不依赖对话切片，本页把选中的智能体写进会话列表 store 再跳转
 * （对话页的智能体来自那份 store，不是 URL）。
 */
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { useAgents } from '@/entities/agent';
import { useUser } from '@/entities/session';
import {
  AgentManagePanel,
  AgentSummaryChip,
  agentStats,
  type Agent,
} from '@/features/agents';
import { useThreadList } from '@/features/chat';
import { ModelProviderPanel } from '@/features/model-providers';
import { paths } from '@/shared/config';
import { ContentLayout } from '@/shared/ui/content-layout';
import { PageHeader, PageHeaderTabs } from '@/shared/ui/page-header';

type AgentManageTab = 'agents' | 'providers';

const TAB_ITEMS = [
  { key: 'agents' as const, label: '智能体' },
  { key: 'providers' as const, label: '模型供应商' },
];

/** 可见 tab：模型供应商只给管理员（授权边界仍在后端 `get_admin_user`）。 */
const useManageTabs = (): AgentManageTab[] => {
  const user = useUser();
  const isAdmin =
    user.data?.role === 'admin' || user.data?.role === 'superadmin';
  return isAdmin ? ['agents', 'providers'] : ['agents'];
};

export const AgentManagePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectAgent = useThreadList((store) => store.selectAgent);
  const tabs = useManageTabs();
  const requestedTab = searchParams.get('tab') as AgentManageTab | null;
  const current =
    requestedTab && tabs.includes(requestedTab) ? requestedTab : tabs[0];

  // 与面板读同一份缓存（同一 query key），页头统计不会多发一个请求
  const { agents } = useAgents(true);
  const stats = agentStats(agents);

  const openAgentChat = (agent: Agent) => {
    selectAgent(agent.slug);
    navigate(paths.app.chat.getHref());
  };

  return (
    <ContentLayout title="智能体管理">
      {/* ContentLayout 只给水平留白，页面自己补纵向：不补的话内容会贴到外壳顶端 */}
      <div className="flex flex-col py-4 gap-4">
        <PageHeader
          title="智能体管理"
          actions={
            current === 'agents' ? (
              <>
                <AgentSummaryChip>{stats.total} 个智能体</AgentSummaryChip>
                <AgentSummaryChip>{stats.global} 个全局</AgentSummaryChip>
                <AgentSummaryChip>{stats.builtin} 个内置</AgentSummaryChip>
                <AgentSummaryChip>{stats.manageable} 个可管理</AgentSummaryChip>
              </>
            ) : undefined
          }
        >
          <PageHeaderTabs
            tabs={TAB_ITEMS.filter((tab) => tabs.includes(tab.key))}
            current={current}
            ariaLabel="智能体管理视图切换"
            onChange={(tab) =>
              setSearchParams(
                (params) => {
                  const next = new URLSearchParams(params);
                  next.set('tab', tab);
                  return next;
                },
                { replace: true },
              )
            }
          />
        </PageHeader>

        {current === 'providers' ? (
          <ModelProviderPanel />
        ) : (
          <AgentManagePanel onOpenChat={openAgentChat} />
        )}
      </div>
    </ContentLayout>
  );
};
