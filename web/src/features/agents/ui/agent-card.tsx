/**
 * 智能体卡片。
 *
 * 结构对齐参照的 `InfoCard`：32px 图标 + 名称/标识 + 两行描述 + 标签行（共享范围标签在左、
 * 「去对话」在右）+ 右上角的更多操作菜单。可管理的卡片整块可点开编辑，菜单是键盘可达的那条路径。
 *
 * 图标先试配置里的图标（上传接口给的 URL），取不到再落到首字母兜底。
 */
import { ChevronRight, MoreHorizontal } from 'lucide-react';

import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import type { Agent } from '@/entities/agent';
import { avatarBackground, avatarInitials } from '@/shared/lib/avatar';

import { agentShareLabel } from '../lib/agent-view';
import { AgentCardTag } from './agent-chip';

export type AgentCardProps = {
  agent: Agent;
  /** 用这个智能体开一段新对话。 */
  onOpenChat: (agent: Agent) => void;
  /** 打开编辑对话框。 */
  onEdit: (agent: Agent) => void;
  /** 删除（内置智能体不会走到这里）。 */
  onDelete: (agent: Agent) => void;
};

/** 图标取不到时的兜底：按标识哈希挑渐变底 + 名称首字母。 */
const AgentAvatar = ({ agent }: { agent: Agent }) =>
  agent.icon ? (
    <img
      className="size-8 shrink-0 rounded-[7px] border border-[var(--gray-150)] object-cover"
      src={agent.icon}
      alt=""
    />
  ) : (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-semibold text-[var(--gray-0)]"
      style={{ background: avatarBackground(agent.slug) }}
      aria-hidden
    >
      {avatarInitials(agent.name)}
    </span>
  );

export const AgentCard = ({
  agent,
  onOpenChat,
  onEdit,
  onDelete,
}: AgentCardProps) => {
  // 内置智能体不给删除入口（后端也会拒），其余动作都在菜单里
  const menuItems: MenuProps['items'] = [
    { key: 'edit', label: '编辑智能体' },
    {
      key: 'delete',
      label: '删除智能体',
      danger: !agent.isBuiltin,
      disabled: agent.isBuiltin,
    },
  ];

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'edit') onEdit(agent);
    if (key === 'delete' && !agent.isBuiltin) onDelete(agent);
  };

  return (
    <section
      className={`flex flex-col gap-2.5 rounded-[8px] border border-[var(--gray-150)] bg-[var(--gray-0)] p-4 transition-colors ${
        agent.canManage ? 'cursor-pointer hover:bg-[var(--gray-25)]' : ''
      }`}
      data-testid={`agent-card-${agent.slug}`}
      onClick={agent.canManage ? () => onEdit(agent) : undefined}
    >
      <header className="flex items-center gap-2.5">
        <AgentAvatar agent={agent} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate text-sm font-semibold text-[var(--gray-900)]">
            {agent.name}
          </h3>
          <span className="truncate font-mono text-xs text-[var(--gray-600)]">
            {agent.slug}
          </span>
        </div>
        {agent.canManage ? (
          <Dropdown
            menu={{ items: menuItems, onClick: onMenuClick }}
            trigger={['click']}
            placement="bottomRight"
          >
            <button
              type="button"
              /* border-0 outline-none：原生 button 的默认 outset 边框与聚焦外框
                 都不要，悬停反馈交给背景色 */
              className="flex size-7 shrink-0 items-center justify-center rounded-[6px] border-0 bg-transparent text-[var(--gray-500)] outline-none hover:bg-[var(--gray-100)]"
              aria-label={`${agent.name} 的更多操作`}
              /* 卡片整块可点开编辑，菜单不该跟着触发一次 */
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="size-[18px]" aria-hidden />
            </button>
          </Dropdown>
        ) : null}
      </header>

      <p className="line-clamp-2 min-h-[2.8em] text-[13px] leading-[1.4] text-[var(--gray-600)]">
        {agent.description || '暂无描述'}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <AgentCardTag>{agentShareLabel(agent)}</AgentCardTag>
        {agent.isSubagent ? null : (
          <Button
            htmlType="button"
            type="primary"
            /* 与工具栏主按钮同规格：antd 自带投影不要，层序 bug 会把文字压成深色 */
            className="ml-auto text-color-white shadow-none"
            aria-label={`用 ${agent.name} 开新对话`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenChat(agent);
            }}
          >
            去对话
            <ChevronRight className="size-3.5" aria-hidden />
          </Button>
        )}
      </div>
    </section>
  );
};
