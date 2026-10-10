/**
 * 扩展页外壳。
 *
 * 顶部 tab 切换，各 tab 一个面板：「知识库」与「技能」已落地，工具与 MCP 仍是占位。
 * 知识库、工具与 MCP 的 tab 只对管理员可见，知识库还要求能力开启。
 */
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { KnowledgeList } from '@/features/knowledge-base';
import { SkillCardList } from '@/features/skills';
import { useKnowledgeEnabled, useUser } from '@/entities/session';
import { paths } from '@/shared/config';
import { Button } from '@/shared/ui/button';
import { ContentLayout } from '@/shared/ui/content-layout';
import { PagePlaceholder } from '@/shared/ui/page-placeholder';

type ExtensionsTab = 'knowledge' | 'skills' | 'tools' | 'mcp';

const TAB_LABELS: Record<ExtensionsTab, string> = {
  knowledge: '知识库',
  skills: '技能',
  tools: '工具',
  mcp: 'MCP',
};

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
  const tabs = useExtensionTabs();
  // 当前 tab 写进 ?tab=：刷新与深链都落在同一个面板上
  const requestedTab = searchParams.get('tab') as ExtensionsTab | null;
  const current =
    requestedTab && tabs.includes(requestedTab) ? requestedTab : tabs[0];

  return (
    <ContentLayout title="智能体扩展">
      <div className="flex flex-col gap-4">
        <nav
          className="flex flex-wrap gap-1 border-b border-color-border-1"
          aria-label="智能体扩展视图切换"
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
        ) : (
          <PagePlaceholder
            title={current ? TAB_LABELS[current] : '扩展'}
            description="该面板随对应分片接入。"
          />
        )}
      </div>
    </ContentLayout>
  );
};
