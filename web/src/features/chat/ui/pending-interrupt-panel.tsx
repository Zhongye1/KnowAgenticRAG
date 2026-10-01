import * as React from 'react';

import {
  buildQuestionAnswers,
  buildToolApprovalResume,
  INTERRUPT_REJECT,
  type QuestionSelection,
} from '../lib/approval-answers';
import type { PendingInterrupt } from '../lib/pending-interrupt';
import { getToolApprovalSummary } from '../lib/tool-approval';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

type PendingInterruptPanelProps = {
  interrupt: PendingInterrupt;
  disabled?: boolean;
  onSubmit: (resume: unknown) => void;
  onCancel: () => void;
};

/**
 * 审批与提问的交互面板。
 *
 * 上游用弹窗承载；这里作为对话流内的一块，语义与提交载荷保持一致：
 * 审批发 `{ decisions }`，提问发「问题 id → 选项」的映射，取消统一发 `'reject'`。
 */
export const PendingInterruptPanel = ({
  interrupt,
  disabled = false,
  onSubmit,
  onCancel,
}: PendingInterruptPanelProps) => {
  if (interrupt.kind === 'tool_approval') {
    return (
      <ToolApprovalPanel
        interrupt={interrupt}
        disabled={disabled}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );
  }

  return (
    <QuestionPanel
      interrupt={interrupt}
      disabled={disabled}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
};

type PanelProps = Omit<PendingInterruptPanelProps, 'interrupt'> & {
  interrupt: Extract<PendingInterrupt, { kind: 'tool_approval' }>;
};

/** 逐条工具调用给出批准/拒绝，提交时与 actionRequests 一一对应。 */
const ToolApprovalPanel = ({
  interrupt,
  disabled,
  onSubmit,
  onCancel,
}: PanelProps) => {
  const [selections, setSelections] = React.useState<
    Record<number, 'approve' | 'reject'>
  >(() =>
    Object.fromEntries(interrupt.actionRequests.map((_, index) => [index, 'approve'])),
  );

  const toggle = (index: number) =>
    setSelections((current) => ({
      ...current,
      [index]: current[index] === 'approve' ? 'reject' : 'approve',
    }));

  return (
    <div className="flex flex-col gap-3 rounded-large border border-color-warning-3 bg-color-bg-2 p-4">
      <p className="text-sm font-medium">需要你确认以下操作</p>
      {interrupt.actionRequests.map((request, index) => (
        <div key={index} className="flex items-center justify-between gap-3">
          <span className="truncate text-sm text-color-text-2">
            {getToolApprovalSummary(request)}
          </span>
          <Button
            type="button"
            size="sm"
            variant={selections[index] === 'approve' ? 'default' : 'outline'}
            disabled={disabled}
            onClick={() => toggle(index)}
          >
            {selections[index] === 'approve' ? '已批准' : '已拒绝'}
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={disabled}
          onClick={() =>
            onSubmit(
              buildToolApprovalResume(selections, interrupt.actionRequests.length),
            )
          }
        >
          提交
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onCancel}
        >
          全部拒绝
        </Button>
      </div>
    </div>
  );
};

type QuestionPanelProps = Omit<PendingInterruptPanelProps, 'interrupt'> & {
  interrupt: Extract<PendingInterrupt, { kind: 'question' }>;
};

/** 逐题选择；多选可多值，勾「其他」时附带自由文本。 */
const QuestionPanel = ({
  interrupt,
  disabled,
  onSubmit,
  onCancel,
}: QuestionPanelProps) => {
  const [selections, setSelections] = React.useState<
    Record<string, QuestionSelection>
  >({});

  const selectionFor = (questionId: string): QuestionSelection =>
    selections[questionId] ?? { selected: [] };

  const updateSelection = (questionId: string, next: QuestionSelection) =>
    setSelections((current) => ({ ...current, [questionId]: next }));

  const toggleOption = (
    questionId: string,
    value: string,
    multiSelect: boolean,
  ) => {
    const current = selectionFor(questionId).selected;
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : multiSelect
        ? [...current, value]
        : [value];
    updateSelection(questionId, { ...selectionFor(questionId), selected: next });
  };

  return (
    <div className="flex flex-col gap-4 rounded-large border border-color-border-1 bg-color-bg-2 p-4">
      {interrupt.questions.map((question) => {
        const selection = selectionFor(question.questionId);
        const otherValue = `${question.questionId}__other__`;
        return (
          <div key={question.questionId} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{question.question}</p>
            <div className="flex flex-wrap gap-2">
              {question.options.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={
                    selection.selected.includes(option.value) ? 'default' : 'outline'
                  }
                  disabled={disabled}
                  onClick={() =>
                    toggleOption(question.questionId, option.value, question.multiSelect)
                  }
                >
                  {option.label}
                </Button>
              ))}
              {question.allowOther ? (
                <Button
                  type="button"
                  size="sm"
                  variant={selection.otherSelected ? 'default' : 'outline'}
                  disabled={disabled}
                  onClick={() =>
                    updateSelection(question.questionId, {
                      ...selection,
                      selected: selection.otherSelected
                        ? selection.selected.filter((item) => item !== otherValue)
                        : [...selection.selected, otherValue],
                      otherSelected: !selection.otherSelected,
                    })
                  }
                >
                  其他
                </Button>
              ) : null}
            </div>
            {question.allowOther && selection.otherSelected ? (
              <Input
                value={selection.otherText ?? ''}
                disabled={disabled}
                placeholder="补充你的回答"
                aria-label={`${question.question} 的其他回答`}
                onChange={(event) =>
                  updateSelection(question.questionId, {
                    ...selection,
                    otherText: event.target.value,
                  })
                }
              />
            ) : null}
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={disabled}
          onClick={() => onSubmit(buildQuestionAnswers(interrupt.questions, selections))}
        >
          提交
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onSubmit(INTERRUPT_REJECT)}
        >
          跳过
        </Button>
        <Button type="button" variant="ghost" disabled={disabled} onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
};
