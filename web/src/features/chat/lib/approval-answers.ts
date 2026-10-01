/**
 * 审批与提问的提交载荷构造。
 *
 * 逐行对照上游 `HumanApprovalModal.vue` 的 `buildQuestionAnswer` / `buildAnswer`
 * 与审批提交：提问答案是「问题 id → 选项」的映射，审批是 decisions 数组，
 * 取消统一发 `'reject'`。
 */
import {
  buildToolApprovalDecisions,
  type ToolApprovalDecision,
  type ToolApprovalSelections,
} from './tool-approval';
import type { NormalizedQuestion } from './pending-interrupt';

/** 用户对某道题的选择：单选一个值，多选一组值，或「其他」加自由文本。 */
export type QuestionSelection = {
  selected: string[];
  otherText?: string;
  otherSelected?: boolean;
};

export type QuestionAnswer =
  | string
  | string[]
  | { type: 'other'; text: string; selected: string[] };

/** 单题的答案：勾了「其他」时给出结构化对象，多选给数组，单选给单值。 */
export function buildQuestionAnswer(
  question: NormalizedQuestion,
  selection: QuestionSelection,
): QuestionAnswer {
  const otherOptionValue = `${question.questionId}__other__`;
  const selected = selection.selected ?? [];

  if (question.allowOther && selection.otherSelected) {
    return {
      type: 'other',
      text: String(selection.otherText ?? '').trim(),
      selected: selected.filter((value) => value !== otherOptionValue),
    };
  }

  if (question.multiSelect) return selected;
  return selected[0] ?? '';
}

/** 全部问题的答案映射，键是 `questionId`。 */
export function buildQuestionAnswers(
  questions: NormalizedQuestion[],
  selections: Record<string, QuestionSelection>,
): Record<string, QuestionAnswer> {
  const answer: Record<string, QuestionAnswer> = {};
  for (const question of questions) {
    answer[question.questionId] = buildQuestionAnswer(
      question,
      selections[question.questionId] ?? { selected: [] },
    );
  }
  return answer;
}

/** 工具审批的提交载荷：decisions 与 actionRequests 一一对应。 */
export function buildToolApprovalResume(
  selections: ToolApprovalSelections,
  actionCount: number,
): { decisions: ToolApprovalDecision[] } {
  return { decisions: buildToolApprovalDecisions(selections, actionCount) };
}

/** 取消审批或提问时统一发送的字面量。 */
export const INTERRUPT_REJECT = 'reject';
