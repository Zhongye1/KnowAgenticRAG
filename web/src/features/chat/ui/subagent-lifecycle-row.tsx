/**
 * subagent_* 生命周期工具的行渲染。
 *
 * 头部是「动作: 名字 | 状态 | 细节」，展开后是元信息、进度、事件与结果正文；
 * 展示视图的组装在 `buildSubagentLifecycleView`。
 */
import * as React from 'react';

import type { ChatToolCall } from '../api/agent-api';
import {
  buildSubagentLifecycleView,
  type SubagentLifecycleView,
} from '../lib/subagent-run';

const STATUS_TEXT_CLASS: Record<SubagentLifecycleView['statusKind'], string> = {
  running: 'text-[var(--main-600)]',
  completed: 'text-color-success',
  failed: 'text-[var(--color-error-500)]',
  unknown: 'text-[var(--gray-500)]',
};

export const SubagentLifecycleRow = ({
  toolCall,
}: {
  toolCall: ChatToolCall;
}) => {
  const view = buildSubagentLifecycleView(toolCall);
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="flex flex-col rounded-medium border border-[var(--gray-150)]">
      <button
        type="button"
        className="flex items-center gap-2 px-2 py-1 text-left text-sm"
        aria-expanded={expanded}
        aria-label={`${view.title} ${view.statusLabel}`}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="shrink-0 text-[var(--gray-800)]">{view.title}</span>
        {view.statusLabel ? (
          <span
            className={`shrink-0 text-xs ${STATUS_TEXT_CLASS[view.statusKind]}`}
          >
            {view.statusLabel}
          </span>
        ) : null}
        {view.detail ? (
          <>
            <span className="shrink-0 text-[var(--gray-500)]" aria-hidden>
              |
            </span>
            <span className="truncate text-[var(--gray-800)]">
              {view.detail}
            </span>
          </>
        ) : null}
      </button>
      {expanded ? (
        <div className="flex flex-col gap-2 border-t border-[var(--gray-150)] px-2 py-2 text-xs">
          {view.meta.length ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {view.meta.map((item) => (
                <React.Fragment key={item.label}>
                  <dt className="text-[var(--gray-500)]">{item.label}</dt>
                  <dd
                    className="truncate font-mono text-[var(--gray-800)]"
                    title={item.value}
                  >
                    {item.value}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          ) : null}
          {view.progressMessages.length ? (
            <ul className="flex flex-col gap-1">
              {view.progressMessages.map((message, index) => (
                <li key={`${message.kind}-${index}`} className="flex gap-2">
                  <span className="shrink-0 text-[var(--gray-500)]">
                    {message.kind}
                  </span>
                  <span className="truncate text-[var(--gray-800)]">
                    {message.content}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {view.events.length ? (
            <ul className="flex flex-col gap-1 font-mono">
              {view.events.map((event, index) => (
                <li
                  key={`${event.seq}-${index}`}
                  className="flex gap-2 text-[var(--gray-500)]"
                >
                  <span className="w-10 shrink-0">{event.seq}</span>
                  <span className="truncate">{event.name}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {view.resultText ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[var(--gray-800)]">
              {view.resultText}
            </pre>
          ) : view.fallbackResult ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[var(--gray-800)]">
              {view.fallbackResult}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
