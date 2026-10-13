/**
 * task 调用的行渲染。
 *
 * 头部是「子智能体名 | 状态 | 描述」，展开后是描述与结果正文；
 * 状态口径见 `resolveTaskRunStatus`。
 */
import * as React from 'react';

import type { ChatToolCall } from '../api/agent-api';
import { buildSubagentTaskView } from '../lib/subagent-run';

const STATUS_DOT_CLASS: Record<string, string> = {
  running: 'bg-[var(--main-500)]',
  completed: 'bg-color-success-6',
  failed: 'bg-danger-6',
};

export const SubagentTaskRow = ({
  toolCall,
  activeToolCallIds,
}: {
  toolCall: ChatToolCall;
  activeToolCallIds?: ReadonlySet<string>;
}) => {
  const view = buildSubagentTaskView(toolCall, { activeToolCallIds });
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="flex flex-col rounded-medium border border-[var(--gray-150)]">
      <button
        type="button"
        className="flex items-center gap-2 px-2 py-1 text-left text-sm"
        aria-expanded={expanded}
        aria-label={`子智能体 ${view.name} ${view.runStatusLabel}`}
        onClick={() => setExpanded((value) => !value)}
      >
        <span
          className={`size-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[view.runStatus] ?? 'bg-[var(--gray-300)]'} ${
            view.runStatus === 'running' ? 'animate-pulse' : ''
          }`}
          aria-hidden
        />
        <span className="shrink-0 text-[var(--gray-800)]">{view.name}</span>
        <span className="shrink-0 text-[var(--gray-500)]" aria-hidden>
          |
        </span>
        <span
          className={`truncate ${view.runStatus === 'running' ? 'text-[var(--gray-1000)]' : 'text-[var(--gray-800)]'}`}
        >
          {view.description || view.runStatusLabel}
        </span>
        <span className="sr-only">{`子智能体 ${view.name} ${view.runStatusLabel}`}</span>
      </button>
      {expanded ? (
        <div className="flex flex-col gap-2 border-t border-[var(--gray-150)] px-2 py-2 text-xs">
          {view.description ? (
            <p className="text-[var(--gray-800)]">{view.description}</p>
          ) : null}
          {view.childThreadId ? (
            <p className="truncate font-mono text-[var(--gray-500)]" title={view.childThreadId}>
              thread: {view.childThreadId}
            </p>
          ) : null}
          {view.resultText ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[var(--gray-800)]">
              {view.resultText}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
