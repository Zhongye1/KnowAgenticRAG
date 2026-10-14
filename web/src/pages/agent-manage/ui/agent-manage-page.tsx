/**
 * 智能体管理页。
 *
 * 页头按参照 `PageHeader` 的排布：标题、内联的视图切换 tab（与标题之间一条竖分隔线）、
 * 右侧统计芯片；整行带底边。`?tab=providers` 可深链，模型供应商 tab 只对管理员可见。
 *
 * 「去对话」在这里接线：面板不依赖对话切片，本页把选中的智能体写进会话列表 store 再跳转
 * （对话页的智能体来自那份 store，不是 URL）。
 */
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { Button } from 'antd';
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
      <div className="flex flex-col gap-4">
        {/* 同行元素按基线对齐：标题 16px 与 tab 14px 字号不同，中心对齐会让文字底错开 2px */}
        <header className="flex flex-wrap items-baseline gap-3 border-b border-color-border-1 py-2">
          <h1 className="text-base font-semibold text-color-text-1">
            智能体管理
          </h1>
          <nav
            className="flex items-center gap-0.5 border-l border-[var(--gray-200)] pl-3"
            aria-label="智能体管理视图切换"
          >
            {tabs.map((tab) => {
              const active = tab === current;
              return (
                <Button
                  key={tab}
                  htmlType="button"
                  type="text"
                  /* 参照 .tab-item：悬停 gray-50，选中是 gray-800 混 6% 的更深的灰；
                     两种状态都不要 outline（antd 文本按钮默认无边框，这里显式兜住聚焦外框） */
                  className={`h-7 rounded-[6px] border-0 px-2.5 text-sm outline-none ${
                    active
                      ? 'bg-[color-mix(in_srgb,var(--gray-800)_6%,var(--gray-0))] font-medium text-color-text-1'
                      : 'bg-transparent text-color-text-3 hover:bg-[var(--gray-50)] hover:text-color-text-1'
                  }`}
                  aria-current={active ? 'page' : undefined}
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
              );
            })}
          </nav>
          {current === 'agents' ? (
            <div className="ml-auto flex flex-wrap items-baseline gap-2 self-center">
              <AgentSummaryChip>{stats.total} 个智能体</AgentSummaryChip>
              <AgentSummaryChip>{stats.global} 个全局</AgentSummaryChip>
              <AgentSummaryChip>{stats.builtin} 个内置</AgentSummaryChip>
              <AgentSummaryChip>{stats.manageable} 个可管理</AgentSummaryChip>
            </div>
          ) : null}
        </header>

        {current === 'providers' ? (
          <ModelProviderPanel />
        ) : (
          <AgentManagePanel onOpenChat={openAgentChat} />
        )}
      </div>
    </ContentLayout>
  );
};
