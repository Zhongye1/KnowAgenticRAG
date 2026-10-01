import { describe, expect, it } from 'vitest';

import { hasPendingInterruptPayload } from '@/features/chat/lib/tool-approval';
import {
  APPROVAL_REQUIRED_STATUSES,
  extractPendingInterrupt,
  extractQuestionPayload,
  extractToolApprovalPayload,
} from '@/features/chat/lib/pending-interrupt';

const approvalChunk = {
  status: 'human_approval_required',
  approval: {
    action_requests: [{ name: 'execute', args: '{"command":"ls -la"}' }],
    review_configs: [{ allowed_decisions: ['approve', 'reject'] }],
  },
  thread_id: 't-1',
  run_id: 'r-1',
};

describe('APPROVAL_REQUIRED_STATUSES', () => {
  it('与上游同值：只有问题回答与工具审批两个状态', () => {
    expect([...APPROVAL_REQUIRED_STATUSES]).toEqual([
      'ask_user_question_required',
      'human_approval_required',
    ]);
  });
});

describe('extractToolApprovalPayload', () => {
  it('action_requests 与 review_configs 数量一致时取出 actionRequests', () => {
    expect(extractToolApprovalPayload(approvalChunk)).toEqual({
      actionRequests: [{ name: 'execute', args: '{"command":"ls -la"}' }],
    });
  });

  it('也认 interrupt_info.approval 这个嵌套位置', () => {
    expect(
      extractToolApprovalPayload({
        interrupt_info: { approval: approvalChunk.approval },
      }),
    ).toEqual({
      actionRequests: [{ name: 'execute', args: '{"command":"ls -la"}' }],
    });
  });

  it('数量不一致、缺失或非数组时都判为畸形载荷', () => {
    expect(
      extractToolApprovalPayload({
        approval: {
          action_requests: [{ name: 'a' }],
          review_configs: [{}, {}],
        },
      }),
    ).toBeNull();
    expect(
      extractToolApprovalPayload({
        approval: { action_requests: [], review_configs: [] },
      }),
    ).toBeNull();
    expect(
      extractToolApprovalPayload({
        approval: {
          action_requests: [{ name: 'a' }],
          review_configs: undefined,
        },
      }),
    ).toBeNull();
    expect(
      extractToolApprovalPayload({
        approval: { action_requests: 'not-an-array', review_configs: [] },
      }),
    ).toBeNull();
  });

  it('approval 整体缺失时返回 null', () => {
    expect(
      extractToolApprovalPayload({ status: 'human_approval_required' }),
    ).toBeNull();
    expect(extractToolApprovalPayload(null)).toBeNull();
  });
});

describe('extractQuestionPayload', () => {
  it('顶层 questions 与 source 缺省为 interrupt', () => {
    const payload = extractQuestionPayload({
      questions: [{ question: '部署到哪个环境？' }],
    });

    expect(payload.source).toBe('interrupt');
    expect(payload.questions).toHaveLength(1);
    expect(payload.questions[0]).toMatchObject({
      questionId: 'q-1',
      question: '部署到哪个环境？',
    });
  });

  it('也认 interrupt_info.questions 与 interrupt_info.source', () => {
    const payload = extractQuestionPayload({
      interrupt_info: {
        questions: [{ question: '继续吗？' }],
        source: 'agent',
      },
    });

    expect(payload.source).toBe('agent');
    expect(payload.questions).toHaveLength(1);
  });

  it('畸形 questions 归一化为空数组而不是抛错', () => {
    expect(extractQuestionPayload({ questions: 42 }).questions).toEqual([]);
    expect(
      extractQuestionPayload({ questions: ['', null, 5] }).questions,
    ).toEqual([]);
    expect(extractQuestionPayload(null).questions).toEqual([]);
  });

  it('保留上游规范化分支：包装键、JSON 字符串、id 回退、其他选项注入', () => {
    expect(
      extractQuestionPayload({
        questions: { items: [{ question: '只有一项' }] },
      }).questions,
    ).toEqual([
      {
        questionId: 'q-1',
        question: '只有一项',
        options: [{ label: '其他', value: '__other__' }],
        multiSelect: false,
        allowOther: true,
        operation: '',
      },
    ]);

    expect(
      extractQuestionPayload({ questions: '[{"question":"从 JSON 来"}]' })
        .questions[0],
    ).toMatchObject({ questionId: 'q-1', question: '从 JSON 来' });

    expect(
      extractQuestionPayload({
        questions: [
          {
            id: 'env',
            title: '部署到哪个环境？',
            choices: { test: '测试' },
            allow_other: 'false',
            multi_select: 'yes',
            operation: 'deploy',
          },
        ],
      }).questions,
    ).toEqual([
      {
        questionId: 'env',
        question: '部署到哪个环境？',
        options: [{ label: '测试', value: 'test' }],
        multiSelect: true,
        allowOther: false,
        operation: 'deploy',
      },
    ]);
  });

  it('已有「其他」选项时不重复注入', () => {
    const payload = extractQuestionPayload({
      questions: [
        {
          question: '选一个',
          options: [
            { label: '甲', value: 'a' },
            { label: '其他', value: '__other__' },
          ],
        },
      ],
    });

    expect(payload.questions[0].options).toEqual([
      { label: '甲', value: 'a' },
      { label: '其他', value: '__other__' },
    ]);
  });
});

describe('extractPendingInterrupt', () => {
  it('human_approval_required 且载荷完整时返回工具审批中断', () => {
    expect(extractPendingInterrupt(approvalChunk, 't-fallback')).toEqual({
      kind: 'tool_approval',
      actionRequests: [{ name: 'execute', args: '{"command":"ls -la"}' }],
      status: 'human_approval_required',
      threadId: 't-1',
      interruptedRunId: 'r-1',
    });
  });

  it('线程 id 与 run id 缺失时分别回退入参线程与 null', () => {
    const interrupt = extractPendingInterrupt(
      { status: 'human_approval_required', approval: approvalChunk.approval },
      't-fallback',
    );

    expect(interrupt).toMatchObject({
      threadId: 't-fallback',
      interruptedRunId: null,
    });
  });

  it('审批载荷畸形时返回 null，即使同时带着合法 questions', () => {
    expect(
      extractPendingInterrupt(
        {
          status: 'human_approval_required',
          approval: { action_requests: [{ name: 'a' }], review_configs: [] },
          questions: [{ question: '不该被解析' }],
        },
        't-1',
      ),
    ).toBeNull();
  });

  it('问题状态返回提问中断，source 与 status 原样带出', () => {
    expect(
      extractPendingInterrupt(
        {
          status: 'ask_user_question_required',
          questions: [{ question: '继续吗？', options: ['是', '否'] }],
          source: 'interrupt',
          thread_id: 't-2',
          run_id: 'r-2',
        },
        't-fallback',
      ),
    ).toEqual({
      kind: 'question',
      questions: [
        {
          questionId: 'q-1',
          question: '继续吗？',
          options: [
            { label: '是', value: '是' },
            { label: '否', value: '否' },
            { label: '其他', value: '__other__' },
          ],
          multiSelect: false,
          allowOther: true,
          operation: '',
        },
      ],
      source: 'interrupt',
      status: 'ask_user_question_required',
      threadId: 't-2',
      interruptedRunId: 'r-2',
    });
  });

  it('非审批状态但带合法 questions 时仍按提问中断提取，status 缺失给空串', () => {
    expect(
      extractPendingInterrupt({ questions: [{ question: '在吗' }] }, 't-1'),
    ).toMatchObject({ kind: 'question', status: '' });
    expect(
      extractPendingInterrupt(
        { status: 'running', questions: [{ question: '在吗' }] },
        't-1',
      ),
    ).toMatchObject({ kind: 'question', status: 'running' });
  });

  it('取不到有效载荷时返回 null', () => {
    expect(extractPendingInterrupt(null, 't-1')).toBeNull();
    expect(extractPendingInterrupt({}, 't-1')).toBeNull();
    expect(
      extractPendingInterrupt({ status: 'running', questions: [] }, 't-1'),
    ).toBeNull();
    expect(
      extractPendingInterrupt({ status: 'human_approval_required' }, 't-1'),
    ).toBeNull();
  });

  it('提取结果可直接喂给 hasPendingInterruptPayload', () => {
    expect(
      hasPendingInterruptPayload(extractPendingInterrupt(approvalChunk, 't-1')),
    ).toBe(true);
    expect(
      hasPendingInterruptPayload(
        extractPendingInterrupt({ questions: [{ question: '在吗' }] }, 't-1'),
      ),
    ).toBe(true);
    expect(hasPendingInterruptPayload(extractPendingInterrupt({}, 't-1'))).toBe(
      false,
    );
  });
});
