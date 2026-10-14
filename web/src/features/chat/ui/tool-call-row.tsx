/**
 * 单条工具调用的时间线行。
 *
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
import { getToolIcon } from '@/shared/ui/tool-icons';
import { buildToolHeader } from '../lib/tool-header';
import { buildToolResultView } from '../lib/tool-result';
import styles from './tool-call-row.module.css';
import { AskQuestionResult } from './ask-question-result';
import { KbDocumentPreview } from './kb-document-preview';
import { KbQueryResultView } from './kb-query-result';
import { SubagentLifecycleRow } from './subagent-lifecycle-row';
import { SubagentTaskRow } from './subagent-task-row';
import { TodoList } from './todo-list';
import { WebSearchResults } from './web-search-results';

export type ToolRunState = 'running' | 'completed' | 'error';

/** 结果缺省、也不是成功状态时算进行中。 */
export function resolveToolRunState(toolCall: ChatToolCall): ToolRunState {
  if (toolCall.status === 'error') return 'error';
  if (toolCall.tool_call_result || toolCall.status === 'success')
    return 'completed';
  return 'running';
}

/** 参数是否值得展示：只有一对花括号时不展示。 */
function hasVisibleParams(toolCall: ChatToolCall): boolean {
  const args = toolCall.args ?? toolCall.function?.arguments ?? '';
  const text = typeof args === 'string' ? args : JSON.stringify(args);
  return text.length > 2;
}

type ToolCallRowProps = {
  toolCall: ChatToolCall;
  defaultExpanded?: boolean;
  /**
   * `kb_id` → 知识库名。知识库列表属于 `features/knowledge-base`，本切片不能反向依赖，
   * 因此由页面层注入；拿不到时头部不显示「知识库: X」那一段。
   */
  resolveKbName?: (kbId: string) => string;
  /** 当前活跃的子智能体工具调用 id；task 行据此区分运行中与已完成。 */
  activeSubagentToolCallIds?: ReadonlySet<string>;
};

export const ToolCallRow = ({
  toolCall,
  defaultExpanded = false,
  resolveKbName,
  activeSubagentToolCallIds,
}: ToolCallRowProps) => {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  const toolId = getToolCallId(toolCall);
  const toolName = toolCall.display_label?.trim() || getToolName(toolId);
  const runState = resolveToolRunState(toolCall);
  const result = formatToolCallResult(parseToolCallResultForDisplay(toolCall));
  const header = buildToolHeader(toolCall, { resolveKbName });
  const resultView = buildToolResultView(toolCall);
  // 专用头部只渲染「主文案 | 参数」，运行状态由图标传达；图标对辅助技术不可见，
  // 因此额外渲染一份纯文本状态，视觉不变。
  const statusText =
    runState === 'completed'
      ? `工具 ${toolName} 执行完成`
      : runState === 'error'
        ? `工具 ${toolName} 执行失败${toolCall.error_message ? `（${toolCall.error_message}）` : ''}`
        : `正在调用工具: ${toolName}`;
  const params = hasVisibleParams(toolCall)
    ? formatToolCallResult(parseToolCallArgs(toolCall))
    : '';

  // 子智能体类工具有专用行：头部、状态与结果一次组装，不走通用外壳
  if (resultView?.kind === 'subagent-task') {
    return (
      <SubagentTaskRow
        toolCall={toolCall}
        activeToolCallIds={activeSubagentToolCallIds}
      />
    );
  }
  if (resultView?.kind === 'subagent-lifecycle') {
    return <SubagentLifecycleRow toolCall={toolCall} />;
  }

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {/* 参照 .tool-loader：单一状态图标（运行中旋转、失败红叉、完成用工具图标），
            参照不叠第二个图标 */}
        {runState === 'error' ? (
          <XCircle
            className={`${styles.stateIcon} ${styles.stateIconError}`}
            aria-hidden
          />
        ) : runState === 'running' ? (
          <Loader
            className={`${styles.stateIcon} ${styles.stateIconRunning}`}
            aria-hidden
          />
        ) : (
          // 完成态直接用工具图标，不再叠一个对勾
          React.createElement(getToolIcon(toolId), {
            className: `${styles.stateIcon} ${styles.stateIconDone}`,
            'aria-hidden': true,
          })
        )}

        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
          {header ? (
            <>
              <span className={styles.note}>{header.note}</span>
              {header.segments.map((segment, index) => (
                <React.Fragment key={`${segment.text}-${index}`}>
                  <span className={styles.separator} aria-hidden>
                    |
                  </span>
                  {segment.tag ? (
                    <span className={styles.segmentTag}>{segment.text}</span>
                  ) : (
                    <span
                      className={`${styles.segment} ${segment.code ? styles.segmentCode : ''}`}
                      title={segment.title}
                    >
                      {segment.text}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </>
          ) : runState === 'completed' ? (
            <>
              工具 <span className={styles.note}>{toolName}</span> 执行完成
            </>
          ) : runState === 'error' ? (
            <>
              工具 <span className={styles.note}>{toolName}</span> 执行失败
              {toolCall.error_message ? `（${toolCall.error_message}）` : ''}
            </>
          ) : (
            <>
              正在调用工具: <span className={styles.note}>{toolName}</span>
            </>
          )}
        </span>

        {header ? <span className="sr-only">{statusText}</span> : null}

        {/* 展开箭头：参照 .tool-expand-icon——静态灰图标，不继承旋转 */}
        {expanded ? (
          <ChevronsDownUp className={styles.expandIcon} aria-hidden />
        ) : (
          <ChevronsUpDown className={styles.expandIcon} aria-hidden />
        )}
      </button>

      {expanded ? (
        <div className={styles.detail}>
          {params && !header?.hideParams ? (
            <div>
              <strong className={styles.detailLabel}>参数: </strong>
              <pre className={styles.detailBlock}>{params}</pre>
            </div>
          ) : null}
          {resultView?.kind === 'image' ? (
            <img
              src={resultView.url}
              alt="工具生成的图片"
              className={styles.humanImage}
            />
          ) : resultView?.kind === 'web-search' ? (
            resultView.results.length > 0 ? (
              <WebSearchResults results={resultView.results} />
            ) : (
              <pre className={styles.detailBlock}>{resultView.rawText}</pre>
            )
          ) : resultView?.kind === 'document-preview' ? (
            <KbDocumentPreview preview={resultView.preview} />
          ) : resultView?.kind === 'ask-question' ? (
            <AskQuestionResult
              questions={resultView.questions}
              answer={resultView.answer}
            />
          ) : resultView?.kind === 'kb-query' ? (
            <KbQueryResultView result={resultView.result} />
          ) : resultView?.kind === 'memory' ? (
            <div className="flex flex-col gap-1">
              <p
                className={
                  resultView.isError
                    ? styles.stateIconError
                    : styles.detailLabel
                }
              >
                {resultView.statusText}
              </p>
              {resultView.meta ? (
                <p className={styles.attachmentMeta}>{resultView.meta}</p>
              ) : null}
            </div>
          ) : resultView?.kind === 'todo' ? (
            <TodoList items={resultView.items} />
          ) : resultView?.kind === 'text' ? (
            <p className={`${styles.detailBlock} ${styles.segmentCode}`}>
              {resultView.text}
            </p>
          ) : result ? (
            <div>
              <pre className={styles.detailResultPre}>{result}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
