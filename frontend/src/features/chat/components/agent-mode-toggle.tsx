import { SparklesIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

import { useChatSettingsStore } from '../stores/chat-settings-store';

/**
 * 问答模式开关（D35）。
 *
 * - 关：/chat/stream，固定检索一次后生成（低延迟，行为冻结）；
 * - 开：/agent/stream，服务端图编排（规划子查询 → 工具检索 → 自省改写 → 生成），
 *   回答上方会多出执行轨迹面板。
 *
 * 选择持久化在 chat-settings-store，只影响下一轮 run（runtime 不重建）。
 */
export const AgentModeToggle = () => {
  const mode = useChatSettingsStore((s) => s.mode);
  const setMode = useChatSettingsStore((s) => s.setMode);
  const active = mode === 'agent';

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => setMode(active ? 'chat' : 'agent')}
      title={
        active
          ? 'Agent 模式：先规划、可自省改写（回答更稳，耗时更长）'
          : '普通模式：检索一次直接作答（更快）'
      }
      className={cn(
        'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors',
        active
          ? 'bg-primary/15 text-primary hover:bg-primary/20'
          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <SparklesIcon className="size-3.5 shrink-0" />
      Agent
    </button>
  );
};
