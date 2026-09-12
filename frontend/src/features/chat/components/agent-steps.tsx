import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import { useChatRunInfo } from '../hooks/use-chat-run-info';

/**
 * Agent 模式执行轨迹面板（D38 step 事件 + done.agent）。
 *
 * 仅在 agent 端点本轮运行出现 `agent` 元数据时渲染；普通 chat 模式返回 null。
 * 折叠态给出一行摘要（子查询数 / 步数 / 改写次数 / 相关度），展开后按执行序
 * 列出 plan / act / grade / rewrite / generate 步骤明细与规划理由。
 */
export const AgentSteps = () => {
  const info = useChatRunInfo();
  const [open, setOpen] = useState(false);

  const agent = info?.agent;
  if (!agent) return null;

  const steps = info?.steps ?? [];
  const rewrites = agent.rewrites ?? 0;
  const subQueryCount = agent.sub_queries?.length ?? 0;
  const gradeScore =
    typeof agent.grade_score === 'number' && agent.grade_score > 0
      ? `相关度 ${agent.grade_score.toFixed(2)}`
      : undefined;
  const toolCalls =
    typeof agent.tool_calls === 'number' && agent.tool_calls > 0
      ? `工具 ${agent.tool_calls} 次`
      : undefined;

  const summary = [
    agent.need_retrieval === false ? '未检索，直接作答' : `子查询 ${subQueryCount}`,
    `${steps.length} 步`,
    rewrites > 0 ? `改写 ${rewrites} 次` : undefined,
    toolCalls,
    gradeScore,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-1.5">
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 rounded-md text-xs transition-colors">
        <ChevronDownIcon
          className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
        Agent · {summary}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {agent.plan_rationale && (
          <p className="text-muted-foreground mt-2 text-xs">{agent.plan_rationale}</p>
        )}
        {subQueryCount > 0 && (
          <ul className="text-muted-foreground mt-1.5 flex flex-wrap gap-1.5 text-xs">
            {agent.sub_queries?.map((query) => (
              <li
                key={query}
                className="bg-muted/70 text-foreground rounded-full px-2 py-0.5"
              >
                {query}
              </li>
            ))}
          </ul>
        )}
        {steps.length > 0 && (
          <ol className="border-border mt-2 space-y-1 border-s-2 ps-3">
            {steps.map((step, index) => (
              <li
                key={`${step.name}-${index}`}
                className="text-muted-foreground flex items-baseline gap-2 text-xs"
              >
                <span className="text-foreground font-medium">{step.name}</span>
                {step.detail && <span className="truncate">{step.detail}</span>}
              </li>
            ))}
          </ol>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};
