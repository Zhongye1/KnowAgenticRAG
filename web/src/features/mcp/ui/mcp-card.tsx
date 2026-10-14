/**
 * MCP 卡片。
 *
 * 结构与样式走 `shared/ui` 的 `InfoCard`（对齐参照 `McpCardList.vue` 的 mini 形态）：
 * emoji 图标块 + 名称 + 单行描述，右侧一个动作钮。动作钮是「一钮两态」：常态显示当前语义的
 * 图标，悬停时换成即将发生的动作（添加 ↔ 移除/删除）。
 */
import { Check, Plus, Trash2 } from 'lucide-react';

import type { McpServer } from '@/entities/mcp';
import { formatExtensionTitle } from '@/shared/lib';
import { InfoCard } from '@/shared/ui/info-card';

import { isMcpRemoveAction, mcpActionLabel } from '../lib/mcp-view';

type McpCardProps = {
  server: McpServer;
  /** 该卡的动作是否在飞（禁用按钮并防止重复点击）。 */
  busy: boolean;
  onOpen: (server: McpServer) => void;
  onAction: (server: McpServer) => void;
};

export const McpCard = ({ server, busy, onOpen, onAction }: McpCardProps) => {
  const removing = isMcpRemoveAction(server);
  const label = mcpActionLabel(server);

  return (
    <InfoCard
      slug={server.slug}
      title={formatExtensionTitle(server.name) || server.slug}
      description={
        server.requiresMigration
          ? '需要迁移为远程 MCP'
          : server.description || '暂无描述'
      }
      onOpen={() => onOpen(server)}
      icon={
        <span className="text-base leading-none">{server.icon || '🔌'}</span>
      }
      action={
        <button
          type="button"
          className={`flex size-7 items-center justify-center rounded-[8px] border border-[var(--gray-150)] bg-[var(--gray-0)] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
            removing
              ? 'text-success-6 hover:border-color-border-4 hover:bg-danger-1 hover:text-danger-6'
              : 'text-color-text-3 hover:border-color-border-4 hover:bg-color-bg-2 hover:text-color-text-1'
          }`}
          disabled={busy}
          aria-label={`${label} ${server.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onAction(server);
          }}
        >
          {removing ? (
            <>
              <Check className="size-3.5 group-hover/card:hidden" aria-hidden />
              <Trash2
                className="hidden size-3.5 group-hover/card:block"
                aria-hidden
              />
            </>
          ) : (
            <Plus className="size-3.5" aria-hidden />
          )}
        </button>
      }
    />
  );
};
