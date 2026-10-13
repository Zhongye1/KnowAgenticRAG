/**
 * 面板里的状态分区。
 *
 * 聚合用量 / 待办 / 附件·文件 / 产物 / 子智能体五个分区；数据由页面从
 * `agent_state` 读取（`lib/agent-state-readers.ts`），本组件只管渲染与折叠。
 */
import * as React from 'react';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  XCircle,
} from 'lucide-react';
import styles from './panel-sections.module.css';

import type { AgentStateFile } from '../lib/agent-state-readers';
import { todoStatusLabel } from '../lib/agent-state-readers';
import type { SubagentRun } from '../lib/subagent-run';
import { isFailedRunStatus, isTerminalRunStatus } from '../lib/subagent-run';
import type { TodoItem } from '../lib/todo-list';
import { TokenUsageCard } from './token-usage-card';

export type StatePanelProps = {
  tokenUsage: Record<string, unknown> | null;
  todos: TodoItem[];
  files: AgentStateFile[];
  artifacts: AgentStateFile[];
  subagentRuns: SubagentRun[];
  onOpenFile?: (file: AgentStateFile) => void;
  onOpenSubagent?: (run: SubagentRun) => void;
};

const SUBAGENT_STATUS_ICON = {
  completed: CheckCircle2,
  failed: XCircle,
  running: Loader2,
} as const;

/** 折叠区的共享外壳；标题、计数与展开态由调用方给。展开面板走 grid-rows 动画。 */
const CollapsibleSection = ({
  title,
  count,
  defaultExpanded = true,
  children,
}: {
  title: string;
  count?: number | string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) => {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  return (
    <section
      className={`${styles.stateSection} ${expanded ? styles.stateSectionExpanded : ''}`}
    >
      <button
        type="button"
        className={styles.stateToggle}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={styles.stateToggleLabel}>
          {title}
          <ChevronDown
            className={`${styles.stateChevron} ${expanded ? '' : styles.stateChevronCollapsed}`}
            aria-hidden
          />
        </span>
        {count !== undefined ? (
          <span className={styles.stateCount}>{count}</span>
        ) : null}
      </button>
      <div
        className={`${styles.statePanel} ${expanded ? styles.statePanelExpanded : ''}`}
      >
        <div className={styles.statePanelInner}>
          <div className={styles.stateContent}>{children}</div>
        </div>
      </div>
    </section>
  );
};

export const StatePanel = ({
  tokenUsage,
  todos,
  files,
  artifacts,
  subagentRuns,
  onOpenFile,
  onOpenSubagent,
}: StatePanelProps) => {
  const isEmpty =
    todos.length === 0 &&
    files.length === 0 &&
    artifacts.length === 0 &&
    subagentRuns.length === 0;
  // 用量卡是可选段：agent_state 没有它不占位
  const hasUsage = tokenUsage !== null && tokenUsage !== undefined;

  if (isEmpty && !hasUsage) {
    return (
      <div className={styles.stateEmpty}>
        暂无状态内容
      </div>
    );
  }

  const completedTodos = todos.filter((todo) => todo.status === 'completed').length;

  return (
    <div className={styles.stateBodyColumn}>
      {hasUsage ? (
        <section
          aria-label="上下文使用情况"
          className={`${styles.stateUsage} ${styles.stateUsageExpanded}`}
        >
          <TokenUsageCard usage={tokenUsage} />
        </section>
      ) : null}

      {todos.length > 0 ? (
        <CollapsibleSection
          title="待办"
          count={todos.length > 0 ? `${completedTodos}/${todos.length}` : undefined}
        >
          <ul className={styles.stateListCompact}>
            {todos.map((todo, index) => (
              <li
                key={`${todo.title}-${index}`}
                className={styles.todoItem}
                role="img"
                aria-label={todoStatusLabel(
                  todo.status === 'unknown' ? undefined : todo.status,
                )}
              >
                {/* 参照 .todo-status-indicator：14px 空心圆环，进行中带脉冲点 */}
                <span
                  aria-hidden
                  className={`${styles.todoIndicator} ${
                    todo.status === 'completed'
                      ? styles.todoIndicatorCompleted
                      : todo.status === 'cancelled'
                        ? styles.todoIndicatorCancelled
                        : ''
                  }`}
                >
                  {todo.status === 'in_progress' || todo.status === 'pending' ? (
                    <span className={styles.todoIndicatorPulse} />
                  ) : null}
                </span>
                <span
                  className={`${styles.todoText} ${todo.status === 'completed' ? styles.todoTextDone : ''}`}
                  title={todo.title}
                >
                  {todo.label}
                </span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

      {files.length > 0 ? (
        <CollapsibleSection title="附件/文件" count={files.length}>
          <ul className={styles.stateList}>
            {files.map((file) => (
              <li key={file.key}>
                <button
                  type="button"
                  className={`${styles.stateRow} ${styles.stateRowCompact}`}
                  title={file.path}
                  onClick={() => onOpenFile?.(file)}
                >
                  <FileText className={styles.stateListItemIcon} aria-hidden />
                  <span className={styles.stateItemText}>{file.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

      {artifacts.length > 0 ? (
        <CollapsibleSection title="产物" count={artifacts.length}>
          <ul className={styles.stateList}>
            {artifacts.map((file) => (
              <li key={file.key}>
                <button
                  type="button"
                  className={`${styles.stateRow} ${styles.stateRowCompact}`}
                  title={file.path}
                  onClick={() => onOpenFile?.(file)}
                >
                  <FileText className={styles.stateListItemIcon} aria-hidden />
                  <span className={styles.stateItemText}>{file.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

      {subagentRuns.length > 0 ? (
        <CollapsibleSection title="子智能体" count={subagentRuns.length}>
          <ul className={styles.stateList}>
            {subagentRuns.map((run, index) => {
              const key =
                run.child_thread_id || run.run_id || `subagent-${index}`;
              const StatusIcon = run.status
                ? isFailedRunStatus(run.status)
                  ? SUBAGENT_STATUS_ICON.failed
                  : isTerminalRunStatus(run.status)
                    ? SUBAGENT_STATUS_ICON.completed
                    : run.status === 'running' || run.status === 'pending'
                      ? SUBAGENT_STATUS_ICON.running
                      : null
                : null;
              const clickable = Boolean(run.child_thread_id);
              const body = (
                <>
                  {/* 参照 .state-subagent-icon：24px 头像框 */}
                  <span className={styles.stateSubagentIcon} aria-hidden>
                    <Bot className="size-3.5" />
                  </span>
                  <span className={styles.stateRowBody}>
                    <span className={styles.stateItem}>
                      <span className={styles.stateItemText}>
                        {run.subagent_name || run.subagent_slug || '子智能体'}
                      </span>
                      {StatusIcon ? (
                        <StatusIcon
                          className={`${styles.stateStatusIcon} ${
                            run.status && isFailedRunStatus(run.status)
                              ? styles.statusIconFailed
                              : isTerminalRunStatus(run.status ?? '')
                                ? styles.statusIconDone
                                : styles.statusIconRunning
                          }`}
                          aria-hidden
                        />
                      ) : null}
                    </span>
                    {run.description ? (
                      <span className={styles.stateMeta} title={run.description}>
                        {run.description}
                      </span>
                    ) : null}
                  </span>
                </>
              );
              return (
                <li key={key}>
                  {clickable ? (
                    <button
                      type="button"
                      className={styles.stateRow}
                      onClick={() => onOpenSubagent?.(run)}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={`${styles.stateRow} ${styles.stateRowStatic}`}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </CollapsibleSection>
      ) : null}
    </div>
  );
};
