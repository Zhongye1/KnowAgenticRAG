/**
 * 工具调用组：一行摘要 + 展开后的时间线列表。
 *
 * 摘要文案、名称去重与状态统计与上游 `ToolCallsGroupComponent.vue` 一致；
 * 活跃期间自动展开，活跃结束后收起，避免正文开始输出时还占着屏幕。
 */
import * as React from 'react';
import { Atom, ChevronDown } from 'lucide-react';

import type { ChatToolCall } from '../api/agent-api';
import { getToolCallId, getToolName, normalizeToolCalls } from '../lib/tool-call';
import { resolveToolRunState, ToolCallRow } from './tool-call-row';

type ToolCallsGroupProps = {
  toolCalls: ChatToolCall[];
  /** 该组是不是当前正在发生的一步；用于自动展开。 */
  isActive?: boolean;
};

const labelOf = (toolCall: ChatToolCall): string =>
  toolCall.display_label?.trim() || getToolName(getToolCallId(toolCall));

export const ToolCallsGroup = ({
  toolCalls,
  isActive = false,
}: ToolCallsGroupProps) => {
  const normalized = React.useMemo(() => normalizeToolCalls(toolCalls), [toolCalls]);
  // 默认跟随活跃状态：活跃时展开、结束后收起；用户点过之后以他的选择为准
  const [userChoice, setUserChoice] = React.useState<boolean | null>(null);
  const expanded = userChoice ?? isActive;

  if (normalized.length === 0) return null;

  const names = [...new Set(normalized.map(labelOf))].filter(Boolean);
  const visibleNames = names.slice(0, 3);
  const namesMeta = `${visibleNames.join(' · ')}${
    names.length > visibleNames.length ? ` +${names.length - visibleNames.length}` : ''
  }`;
  const states = normalized.map((toolCall) => resolveToolRunState(toolCall));
  const errorCount = states.filter((state) => state === 'error').length;
  const runningCount = states.filter((state) => state === 'running').length;
  const statusSummary = [
    errorCount > 0 ? `${errorCount} 失败` : '',
    runningCount > 0 ? `${runningCount} 进行中` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col">
      <button
        type="button"
        className="flex w-fit max-w-full items-center gap-2 py-1 text-left text-sm text-color-text-2 hover:text-color-text-1"
        aria-expanded={expanded}
        onClick={() => setUserChoice(!expanded)}
      >
        <Atom className="size-4 shrink-0" aria-hidden />

        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate">
            {normalized.length === 1
              ? `调用: ${labelOf(normalized[0]!)}`
              : `已调用 ${normalized.length} 个工具`}
          </span>
          {normalized.length > 1 && namesMeta ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate text-color-text-3">{namesMeta}</span>
            </>
          ) : null}
          {statusSummary ? (
            <span className="shrink-0 text-xs text-color-text-3">{statusSummary}</span>
          ) : null}
        </span>

        <ChevronDown
          className={`size-4 shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="mt-1 flex flex-col gap-1">
          {normalized.map((toolCall, index) => (
            <ToolCallRow
              key={toolCall.id || `${getToolCallId(toolCall)}-${index}`}
              toolCall={toolCall}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
