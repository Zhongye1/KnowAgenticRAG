/** 审批卡片的交互逻辑与装配。 */
import * as React from 'react';
import { ChevronDown, Wrench } from 'lucide-react';

import {
  buildQuestionAnswers,
  buildToolApprovalResume,
  INTERRUPT_REJECT,
  type QuestionSelection,
} from '../lib/approval-answers';
import type {
  PendingInterrupt,
  QuestionInterrupt,
} from '../lib/pending-interrupt';
import type { ToolApprovalInterrupt } from '../lib/pending-interrupt';
import { getToolApprovalSummary } from '../lib/tool-approval';
import { getToolIcon } from '@/shared/ui/tool-icons';
import styles from './approval-modal.module.css';

type ApprovalModalProps = {
  interrupt: PendingInterrupt;
  disabled?: boolean;
  onSubmit: (resume: unknown) => void;
  onCancel: () => void;
};

/** 审批卡的对外形态：kind 决定渲染分支。 */
export const PendingInterruptPanel = ({
  interrupt,
  disabled = false,
  onSubmit,
  onCancel,
}: ApprovalModalProps) => {
  if (interrupt.kind === 'tool_approval') {
    return (
      <ToolApprovalCard
        interrupt={interrupt}
        disabled={disabled}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );
  }
  return (
    <QuestionCard
      interrupt={interrupt}
      disabled={disabled}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
};

/* ==================== 工具审批 ==================== */

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  write_file: '写入文件',
  edit_file: '编辑文件',
  execute: '执行命令',
};

const toolDisplayName = (name: unknown): string => {
  const key = typeof name === 'string' ? name : '';
  return TOOL_DISPLAY_NAMES[key] || key || '工具调用';
};

const formatToolArgs = (args: unknown): string => {
  if (args === null || args === undefined) return '';
  if (typeof args === 'string') return args;
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
};

/** 工具审批的问题文案。 */
const getToolApprovalQuestion = (request: { name?: unknown }): string => {
  const name = typeof request?.name === 'string' ? request.name : '';
  if (name === 'execute') return '要执行这条命令吗？';
  if (name === 'write_file' || name === 'edit_file')
    return '要写入这个文件吗？';
  return '要允许这次工具调用吗？';
};

type ToolApprovalCardProps = {
  interrupt: ToolApprovalInterrupt;
  disabled: boolean;
  onSubmit: (resume: unknown) => void;
  onCancel: () => void;
};

/** 单卡逐条过 actionRequests：允许/拒绝当前条，进度条 N/M。 */
const ToolApprovalCard = ({
  interrupt,
  disabled,
  onSubmit,
  onCancel,
}: ToolApprovalCardProps) => {
  const [activeIndex, setActiveIndex] = React.useState(0);
  // 已有条目的决定；提交时与 actionRequests 一一对应
  const [decisions, setDecisions] = React.useState<
    Record<number, 'approve' | 'reject'>
  >({});
  const [argsExpanded, setArgsExpanded] = React.useState(false);

  const requests = interrupt.actionRequests as Array<{
    name?: unknown;
    args?: unknown;
  }>;
  const activeRequest = requests[activeIndex] ?? null;
  const ActiveToolIcon =
    getToolIcon(
      typeof activeRequest?.name === 'string' ? activeRequest.name : '',
    ) || Wrench;
  const allDecided = requests.every(
    (_, index) => decisions[index] !== undefined,
  );

  const decide = (decision: 'approve' | 'reject') => {
    const next = { ...decisions, [activeIndex]: decision };
    setDecisions(next);
    // 还有没过完的条目就推进到下一条；全部过完即提交
    const nextUnanswered = requests.findIndex(
      (_, index) => index > activeIndex && next[index] === undefined,
    );
    if (nextUnanswered !== -1) {
      setActiveIndex(nextUnanswered);
      setArgsExpanded(false);
      return;
    }
    onSubmit(buildToolApprovalResumeFromDecisions(requests.length, next));
  };

  return (
    <div
      className={`${styles.approvalModal} ${styles.approvalModalIsToolApproval}`}
      role="dialog"
      aria-labelledby="tool-approval-question"
    >
      <div className={styles.approvalContent}>
        <div
          className={`${styles.approvalHeader} ${styles.toolApprovalHeader}`}
        >
          <div className={styles.toolApprovalContext}>
            <span className={styles.toolApprovalIcon}>
              <ActiveToolIcon size={17} />
            </span>
            <span>{toolDisplayName(activeRequest?.name)}</span>
            <code>{String(activeRequest?.name ?? '')}</code>
          </div>
          {requests.length > 1 ? (
            <span className={styles.toolProgressLabel}>
              {activeIndex + 1} / {requests.length}
            </span>
          ) : null}
        </div>

        {requests.length > 1 ? (
          <div
            className="flex items-center gap-1.5"
            style={{ marginBottom: 10 }}
            aria-label="审批进度"
          >
            {requests.map((_, index) => (
              <span
                key={index}
                className={`inline-flex size-6 items-center justify-center rounded-full border text-xs font-semibold ${
                  index === activeIndex
                    ? 'border-[var(--main-300)] bg-[var(--main-50)] text-[var(--main-700)]'
                    : decisions[index] !== undefined
                      ? 'border-[var(--gray-300)] bg-[var(--gray-100)] text-[var(--color-text)]'
                      : 'border-[var(--gray-150)] bg-[var(--gray-25)] text-[var(--color-text-secondary)]'
                }`}
              >
                {index + 1}
              </span>
            ))}
          </div>
        ) : null}

        <h4 id="tool-approval-question" className={styles.toolApprovalQuestion}>
          {getToolApprovalQuestion(activeRequest ?? undefined)}
        </h4>

        {activeRequest ? (
          <div className={styles.toolArgsDisclosure}>
            <button
              id="tool-approval-summary"
              type="button"
              className={styles.toolArgsTrigger}
              aria-expanded={argsExpanded}
              aria-controls="tool-approval-full-args"
              onClick={() => setArgsExpanded((current) => !current)}
            >
              <code>
                {getToolApprovalSummary(activeRequest) ||
                  String(activeRequest.name ?? '')}
              </code>
              <ChevronDown
                size={15}
                className={`${styles.toolArgsChevron} ${
                  argsExpanded ? styles.toolArgsChevronExpanded : ''
                }`}
              />
            </button>
            {argsExpanded ? (
              <pre
                id="tool-approval-full-args"
                className={styles.toolArgsExpanded}
              >
                {formatToolArgs(activeRequest.args)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={`${styles.approvalActions} ${styles.approvalActionsToolApproval}`}
      >
        <button
          type="button"
          className={`${styles.approvalBtn} ${styles.approvalBtnReject}`}
          disabled={disabled}
          onClick={onCancel}
        >
          拒绝全部
        </button>
        <button
          type="button"
          className={`${styles.approvalBtn} ${styles.approvalBtnReject}`}
          disabled={disabled || allDecided}
          onClick={() => decide('reject')}
        >
          拒绝
        </button>
        <button
          type="button"
          className={`${styles.approvalBtn} ${styles.approvalBtnApprove}`}
          disabled={disabled || allDecided}
          onClick={() => decide('approve')}
        >
          允许
        </button>
      </div>
    </div>
  );
};

/** 把逐条决定折成后端 resume 载荷；未决定的条目按拒绝处理（fail-closed）。 */
const buildToolApprovalResumeFromDecisions = (
  total: number,
  decisions: Record<number, 'approve' | 'reject'>,
): unknown =>
  buildToolApprovalResume(
    Object.fromEntries(
      Array.from({ length: total }, (_, index) => [
        index,
        decisions[index] ?? 'reject',
      ]),
    ),
    total,
  );

/* ==================== 提问 ==================== */

type QuestionCardProps = {
  interrupt: QuestionInterrupt;
  disabled: boolean;
  onSubmit: (resume: unknown) => void;
  /** 「取消」即 reject 提交，本卡片没有独立的取消路径。 */
  onCancel?: () => void;
};

/** 多题 tab 逐题作答。 */
const QuestionCard = ({ interrupt, disabled, onSubmit }: QuestionCardProps) => {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [selections, setSelections] = React.useState<
    Record<string, QuestionSelection>
  >({});
  const multi = interrupt.questions.length > 1;

  const activeQuestion = interrupt.questions[activeIndex];
  const selectionFor = (questionId: string): QuestionSelection =>
    selections[questionId] ?? { selected: [] };

  const updateSelection = (questionId: string, next: QuestionSelection) =>
    setSelections((current) => ({ ...current, [questionId]: next }));

  const toggleOption = (value: string) => {
    if (!activeQuestion) return;
    const current = selectionFor(activeQuestion.questionId).selected;
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : activeQuestion.multiSelect
        ? [...current, value]
        : [value];
    updateSelection(activeQuestion.questionId, {
      ...selectionFor(activeQuestion.questionId),
      selected: next,
    });
  };

  const isAnswered = (index: number): boolean => {
    const question = interrupt.questions[index];
    if (!question) return false;
    return selectionFor(question.questionId).selected.length > 0;
  };

  const canSubmit = interrupt.questions.every(
    (question) => selectionFor(question.questionId).selected.length > 0,
  );

  if (!activeQuestion) return null;

  return (
    <div className={styles.approvalModal} role="dialog">
      <div className={styles.approvalContent}>
        {multi ? (
          <div className={styles.questionTabs}>
            {interrupt.questions.map((question, index) => (
              <button
                key={question.questionId}
                type="button"
                className={`${styles.tabItem} ${
                  index === activeIndex ? styles.tabItemActive : ''
                }`}
                disabled={disabled}
                onClick={() => setActiveIndex(index)}
              >
                <span
                  className={styles.tabIndex}
                  style={
                    isAnswered(index) ? { color: 'var(--main-700)' } : undefined
                  }
                >
                  {index + 1}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className={styles.approvalHeader}>
          <h4>
            {activeIndex + 1}. {activeQuestion.question}
          </h4>
        </div>

        {activeQuestion.operation ? (
          <div className={styles.approvalOperation}>
            <span className={styles.label}>操作：</span>
            <span className={styles.operationText}>
              {activeQuestion.operation}
            </span>
          </div>
        ) : null}

        <div className={styles.questionOptions}>
          {activeQuestion.options.map((option, optionIndex) => (
            <label
              key={`${activeQuestion.questionId}-${option.value}-${optionIndex}`}
              className={styles.optionItem}
            >
              <input
                type={activeQuestion.multiSelect ? 'checkbox' : 'radio'}
                name={`approval-option-${activeQuestion.questionId}`}
                value={option.value}
                checked={selectionFor(
                  activeQuestion.questionId,
                ).selected.includes(option.value)}
                disabled={disabled}
                onChange={() => toggleOption(option.value)}
              />
              <span className={styles.optionContent}>
                <span
                  className={`${styles.optionLabel} ${
                    optionIndex === 0 &&
                    String(option.label).includes('(Recommended)')
                      ? styles.optionLabelRecommended
                      : ''
                  }`}
                >
                  {option.label}
                </span>
                {option.description ? (
                  <span className={styles.optionDescription}>
                    {option.description}
                  </span>
                ) : null}
              </span>
            </label>
          ))}

          {activeQuestion.allowOther ? (
            <div className={styles.otherInput}>
              <textarea
                rows={1}
                placeholder="其他：请输入自定义内容"
                aria-label={`${activeQuestion.question} 的其他回答`}
                disabled={disabled}
                value={selectionFor(activeQuestion.questionId).otherText ?? ''}
                onChange={(event) => {
                  const otherValue = `${activeQuestion.questionId}__other__`;
                  const value = event.target.value;
                  const selection = selectionFor(activeQuestion.questionId);
                  updateSelection(activeQuestion.questionId, {
                    ...selection,
                    otherText: value,
                    selected: value
                      ? Array.from(new Set([...selection.selected, otherValue]))
                      : selection.selected.filter(
                          (item) => item !== otherValue,
                        ),
                  });
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.approvalActions}>
        <button
          type="button"
          className={`${styles.approvalBtn} ${styles.approvalBtnReject}`}
          onClick={() => onSubmit(INTERRUPT_REJECT)}
          disabled={disabled}
        >
          取消
        </button>
        <button
          type="button"
          className={`${styles.approvalBtn} ${styles.approvalBtnApprove}`}
          disabled={disabled || !canSubmit}
          onClick={() =>
            onSubmit(buildQuestionAnswers(interrupt.questions, selections))
          }
        >
          提交
        </button>
      </div>
    </div>
  );
};
