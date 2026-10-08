/**
 * 单条工具调用的时间线行。
 *
 * 与上游 `ToolCallingResult/BaseToolCall.vue` 的 `appearance="timeline"` 语义一致：
 * 状态图标 + 一行说明，展开后显示参数与结果。
 */
import * as React from 'react';
import { ChevronsDownUp, ChevronsUpDown, Loader, XCircle } from 'lucide-react';

import type { ChatToolCall } from '../api/agent-api';
import {
  formatToolCallResult,
  getToolCallId,
  getToolName,
  parseToolCallArgs,
  parseToolCallResultForDisplay,
} from '../lib/tool-call';
import { getToolIcon } from './tool-icons';

export type ToolRunState = 'running' | 'completed' | 'error';

/** 结果缺省、也不是成功状态时算进行中；上游同判定。 */
export function resolveToolRunState(toolCall: ChatToolCall): ToolRunState {
  if (toolCall.status === 'error') return 'error';
  if (toolCall.tool_call_result || toolCall.status === 'success') return 'completed';
  return 'running';
}

/** 参数是否值得展示：只有一对花括号时不展示，与上游的 `length > 2` 同义。 */
function hasVisibleParams(toolCall: ChatToolCall): boolean {
  const args = toolCall.args ?? toolCall.function?.arguments ?? '';
  const text = typeof args === 'string' ? args : JSON.stringify(args);
  return text.length > 2;
}

type ToolCallRowProps = {
  toolCall: ChatToolCall;
  defaultExpanded?: boolean;
};

export const ToolCallRow = ({
  toolCall,
  defaultExpanded = false,
}: ToolCallRowProps) => {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  const toolId = getToolCallId(toolCall);
  const toolName = toolCall.display_label?.trim() || getToolName(toolId);
  const runState = resolveToolRunState(toolCall);
  const result = formatToolCallResult(parseToolCallResultForDisplay(toolCall));
  const params = hasVisibleParams(toolCall)
    ? formatToolCallResult(parseToolCallArgs(toolCall))
    : '';

  return (
    <div className="flex flex-col rounded-medium border border-color-border-1">
      <button
        type="button"
        className="flex items-center gap-2 px-2 py-1 text-left text-sm"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {runState === 'error' ? (
          <XCircle className="size-4 shrink-0 text-color-danger-6" aria-hidden />
        ) : runState === 'running' ? (
          <Loader className="size-4 shrink-0 animate-spin text-color-text-3" aria-hidden />
        ) : (
          // 完成态直接用工具图标，不再叠一个对勾（与上游一致）
          React.createElement(getToolIcon(toolId), {
            className: 'size-4 shrink-0 text-success-6',
            'aria-hidden': true,
          })
        )}

        {runState === 'completed' ? null : React.createElement(getToolIcon(toolId), {
          className: 'size-4 shrink-0 text-color-text-3',
          'aria-hidden': true,
        })}

        <span className="min-w-0 flex-1 truncate text-color-text-2">
          {runState === 'completed' ? (
            <>
              工具 <span className="text-color-text-1">{toolName}</span> 执行完成
            </>
          ) : runState === 'error' ? (
            <>
              工具 <span className="text-color-text-1">{toolName}</span> 执行失败
              {toolCall.error_message ? `（${toolCall.error_message}）` : ''}
            </>
          ) : (
            <>
              正在调用工具: <span className="text-color-text-1">{toolName}</span>
            </>
          )}
        </span>

        {expanded ? (
          <ChevronsDownUp className="size-4 shrink-0 text-color-text-3" aria-hidden />
        ) : (
          <ChevronsUpDown className="size-4 shrink-0 text-color-text-3" aria-hidden />
        )}
      </button>

      {expanded ? (
        <div className="flex flex-col gap-2 border-t border-color-border-1 px-2 py-2 text-xs">
          {params ? (
            <div>
              <strong className="text-color-text-2">参数: </strong>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-color-text-2">
                {params}
              </pre>
            </div>
          ) : null}
          {result ? (
            <div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-color-text-2">
                {result}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
