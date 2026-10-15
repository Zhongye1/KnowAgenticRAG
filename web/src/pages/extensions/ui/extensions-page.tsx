/**
 * 扩展页外壳。
 *
 * 顶部 tab 切换，各 tab 一个面板：知识库、工具与 MCP 只对管理员可见，知识库还要求能力开启；
 * 技能对所有登录用户开放。四个面板都在自己的切片里，这里只做装配。
 */
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { KnowledgeList } from '@/features/knowledge-base';
import { McpCardList } from '@/features/mcp';
import { SkillCardList } from '@/features/skills';
import { ToolsPanel } from '@/features/tools';
import { useKnowledgeEnabled, useUser } from '@/entities/session';
import { paths } from '@/shared/config';
import { ContentLayout } from '@/shared/ui/content-layout';
import { PageHeader, PageHeaderTabs } from '@/shared/ui/page-header';
import { useNotifications } from '@/shared/ui/notifications';

type ExtensionsTab = 'knowledge' | 'skills' | 'tools' | 'mcp';

const TAB_ITEMS: ReadonlyArray<{ key: ExtensionsTab; label: string }> = [
  { key: 'knowledge', label: '知识库' },
  { key: 'skills', label: '技能' },
  { key: 'tools', label: '工具' },
  { key: 'mcp', label: 'MCP' },
];

/** 管理员判定：后端返回的 role 同时用于呈现与入口隐藏；授权仍在后端。 */
const useExtensionTabs = (): ExtensionsTab[] => {
  const user = useUser();
  const knowledgeEnabled = useKnowledgeEnabled();
  const isAdmin =
    user.data?.role === 'admin' || user.data?.role === 'superadmin';

  return [
    // 能力未知（undefined）时先不显示知识库入口，避免 LITE 模式下闪一下又消失
    ...(knowledgeEnabled === true && isAdmin ? (['knowledge'] as const) : []),
    'skills',
    ...(isAdmin ? (['tools', 'mcp'] as const) : []),
  ];
};

export const ExtensionsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addNotification } = useNotifications();
  const tabs = useExtensionTabs();
  // 当前 tab 写进 ?tab=：刷新与深链都落在同一个面板上
  const requestedTab = searchParams.get('tab') as ExtensionsTab | null;
  const current =
    requestedTab && tabs.includes(requestedTab) ? requestedTab : tabs[0];

  return (
    <ContentLayout title="智能体扩展">
      {/* ContentLayout 只给水平留白，页面自己补纵向：不补的话内容会贴到外壳顶端 */}
      <div className="flex flex-col gap-4 py-4">
        <PageHeader title="智能体扩展">
          <PageHeaderTabs
            tabs={TAB_ITEMS.filter((tab) => tabs.includes(tab.key))}
            current={current}
            ariaLabel="智能体扩展视图切换"
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

        {current === 'knowledge' ? (
          <KnowledgeList
            onOpen={(database) =>
              navigate(
                paths.app.extensions.knowledgeBase.getHref(database.kb_id),
              )
            }
          />
        ) : current === 'skills' ? (
          <SkillCardList />
        ) : current === 'tools' ? (
          <ToolsPanel />
        ) : current === 'mcp' ? (
          <McpCardList
            notifySuccess={(title) =>
              addNotification({ type: 'success', title })
            }
            notifyError={(title) => addNotification({ type: 'error', title })}
          />
        ) : null}
      </div>
    </ContentLayout>
  );
};
