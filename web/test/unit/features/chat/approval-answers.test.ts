import { describe, expect, it } from 'vitest';

import {
  buildQuestionAnswer,
  buildQuestionAnswers,
  buildToolApprovalResume,
  INTERRUPT_REJECT,
} from '@/features/chat/lib/approval-answers';
import type { NormalizedQuestion } from '@/features/chat/lib/pending-interrupt';

const question = (
  overrides: Partial<NormalizedQuestion> = {},
): NormalizedQuestion => ({
  questionId: 'q1',
  question: '选一个',
  options: [
    { label: '甲', value: 'a' },
    { label: '乙', value: 'b' },
  ],
  multiSelect: false,
  allowOther: false,
  operation: 'ask',
  ...overrides,
});

describe('buildQuestionAnswer', () => {
  it('单选取第一个值', () => {
    expect(buildQuestionAnswer(question(), { selected: ['a'] })).toBe('a');
  });

  it('未选择时给空串，而不是 undefined', () => {
    expect(buildQuestionAnswer(question(), { selected: [] })).toBe('');
  });

  it('多选原样给出数组', () => {
    expect(
      buildQuestionAnswer(question({ multiSelect: true }), { selected: ['a', 'b'] }),
    ).toEqual(['a', 'b']);
  });

  it('勾选「其他」时给出结构化对象，并把其他项从已选里剔除', () => {
    const answer = buildQuestionAnswer(
      question({ allowOther: true }),
      {
        selected: ['a', 'q1__other__'],
        otherSelected: true,
        otherText: '  自定义回答  ',
      },
    );

    expect(answer).toEqual({ type: 'other', text: '自定义回答', selected: ['a'] });
  });

  it('允许其他但未勾选时仍按普通选项处理', () => {
    expect(
      buildQuestionAnswer(question({ allowOther: true }), { selected: ['b'] }),
    ).toBe('b');
  });

  it('多选且勾选其他时对象里的 selected 仍是数组', () => {
    const answer = buildQuestionAnswer(
      question({ multiSelect: true, allowOther: true }),
      { selected: ['q1__other__'], otherSelected: true, otherText: 'x' },
    );

    expect(answer).toEqual({ type: 'other', text: 'x', selected: [] });
  });
});

describe('buildQuestionAnswers', () => {
  it('按问题 id 汇总，缺选择的题给空串', () => {
    const questions = [
      question(),
      question({ questionId: 'q2', multiSelect: true }),
    ];

    expect(buildQuestionAnswers(questions, { q1: { selected: ['b'] } })).toEqual({
      q1: 'b',
      q2: [],
    });
  });
});

describe('buildToolApprovalResume', () => {
  it('decisions 与 actionRequests 一一对应，拒绝带上游文案', () => {
    expect(buildToolApprovalResume({ 0: 'approve', 1: 'reject' }, 2)).toEqual({
      decisions: [
        { type: 'approve' },
        { type: 'reject', message: '用户拒绝执行该操作' },
      ],
    });
  });

  it('未表态的条目按拒绝处理（与上游判定一致：只有显式 approve 才通过）', () => {
    expect(buildToolApprovalResume({}, 2)).toEqual({
      decisions: [
        { type: 'reject', message: '用户拒绝执行该操作' },
        { type: 'reject', message: '用户拒绝执行该操作' },
      ],
    });
  });
});

describe('INTERRUPT_REJECT', () => {
  it('取消字面量与后端约定一致', () => {
    expect(INTERRUPT_REJECT).toBe('reject');
  });
});
