/**
 * 工具调用组：一行摘要 + 展开后的时间线列表。
 *
 * 摘要文案、名称去重与状态统计集中在纯逻辑里；活跃期间自动展开，活跃结束后收起，
 * 避免正文开始输出时还占着屏幕。结构与动画对齐参照 ToolCallsGroupComponent.vue：
 * 展开面板用 grid-rows 0fr→1fr 过渡，展开体带 border-top 灰线。
 */
import * as React from 'react';
import { Atom, ChevronDown } from 'lucide-react';

import type { ChatToolCall } from '../api/agent-api';
import {
  getToolCallId,
  getToolName,
  normalizeToolCalls,
} from '../lib/tool-call';
import { resolveToolRunState, ToolCallRow } from './tool-call-row';
import styles from './tool-call-row.module.css';

type ToolCallsGroupProps = {
  /** 透传给每条工具行；见 `ToolCallRow`。 */
  resolveKbName?: (kbId: string) => string;
  toolCalls: ChatToolCall[];
  /** 该组是不是当前正在发生的一步；用于自动展开。 */
  isActive?: boolean;
};

const labelOf = (toolCall: ChatToolCall): string =>
  toolCall.display_label?.trim() || getToolName(getToolCallId(toolCall));

export const ToolCallsGroup = ({
  resolveKbName,
  toolCalls,
  isActive = false,
}: ToolCallsGroupProps) => {
  const normalized = React.useMemo(
    () => normalizeToolCalls(toolCalls),
    [toolCalls],
  );
  // 默认跟随活跃状态：活跃时展开、结束后收起；用户点过之后以他的选择为准
  const [userChoice, setUserChoice] = React.useState<boolean | null>(null);
  const expanded = userChoice ?? isActive;

  if (normalized.length === 0) return null;

  const names = [...new Set(normalized.map(labelOf))].filter(Boolean);
  const visibleNames = names.slice(0, 3);
  const namesMeta = `${visibleNames.join(' · ')}${
    names.length > visibleNames.length
      ? ` +${names.length - visibleNames.length}`
      : ''
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
    <div className={styles.groupContainer}>
      <button
        type="button"
        className={styles.groupToggle}
        aria-expanded={expanded}
        onClick={() => setUserChoice(!expanded)}
      >
        <Atom className={styles.groupIcon} size={14} aria-hidden />

        <span className={styles.groupSummaryContent}>
          <span className={styles.groupSummaryTitle}>
            {normalized.length === 1
              ? `调用: ${labelOf(normalized[0]!)}`
              : `已调用 ${normalized.length} 个工具`}
          </span>
          {normalized.length > 1 && namesMeta ? (
            <>
              <span className={styles.groupMetaSeparator} aria-hidden>
                ·
              </span>
              <span className={styles.groupMeta}>{namesMeta}</span>
            </>
          ) : null}
          {statusSummary ? (
            <span className={styles.groupStatusTag}>{statusSummary}</span>
          ) : null}
        </span>

        <ChevronDown
          className={`${styles.groupChevron} ${expanded ? '' : styles.groupChevronCollapsed}`}
          size={14}
          aria-hidden
        />
      </button>

      {/* 参照 .tool-calls-collapse-panel：常驻节点走 grid-rows 动画，不用条件渲染 */}
      <div
        className={`${styles.groupPanel} ${expanded ? styles.groupPanelExpanded : ''}`}
      >
        <div className={styles.groupPanelInner}>
          <div className={styles.groupList}>
            {normalized.map((toolCall, index) => (
              <ToolCallRow
                key={toolCall.id || `${getToolCallId(toolCall)}-${index}`}
                toolCall={toolCall}
                resolveKbName={resolveKbName}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
