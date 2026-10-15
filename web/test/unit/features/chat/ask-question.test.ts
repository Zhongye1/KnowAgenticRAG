import { describe, expect, it } from 'vitest';

import type { ChatToolCall } from '@/features/chat/api/agent-api';
import {
  answeredSummary,
  askQuestionSummary,
  formatAnswer,
  normalizeQuestions,
  parseBool,
  questionAnswer,
  resolveQuestions,
  resolveUserAnswer,
} from '@/features/chat/lib/ask-question';

const call = (args: unknown, content?: unknown): ChatToolCall => ({
  id: 'call-1',
  name: 'ask_user_question',
  function: {
    name: 'ask_user_question',
    arguments: typeof args === 'string' ? args : JSON.stringify(args),
  },
  status: 'success',
  ...(content === undefined ? {} : { tool_call_result: { content } }),
});

describe('parseBool', () => {
  it('认字符串与数字的真假值，其余走兜底', () => {
    expect(parseBool('true')).toBe(true);
    expect(parseBool('1')).toBe(true);
    expect(parseBool('no')).toBe(false);
    expect(parseBool(1)).toBe(true);
    expect(parseBool(undefined, true)).toBe(true);
    expect(parseBool('嗯', true)).toBe(true);
  });
});

describe('normalizeQuestions', () => {
  it('接受数组、包装键与单个问题对象三种形状', () => {
    expect(normalizeQuestions([{ question: 'A' }])).toHaveLength(1);
    expect(normalizeQuestions({ questions: [{ question: 'A' }] })).toHaveLength(
      1,
    );
    expect(normalizeQuestions({ question: 'A' })).toHaveLength(1);
  });

  it('字段名走别名，questionId 缺省时按序号生成', () => {
    const [item] = normalizeQuestions([
      { title: 'A', id: 'x', operation: '选一个' },
    ]);

    expect(item).toMatchObject({
      question: 'A',
      questionId: 'x',
      operation: '选一个',
      multiSelect: false,
    });
    expect(normalizeQuestions([{ question: 'B' }])[0]!.questionId).toBe('q-1');
  });

  it('默认补「其他」选项，已经有时不重复补', () => {
    expect(
      normalizeQuestions([{ question: 'A', options: [{ label: '甲' }] }])[0]!
        .options,
    ).toEqual([
      { label: '甲', value: '甲', description: '' },
      { label: '其他', value: '__other__', description: '' },
    ]);

    expect(
      normalizeQuestions([
        { question: 'A', options: [{ label: '其他', value: 'other' }] },
      ])[0]!.options,
    ).toHaveLength(1);
  });

  it('allowOther 关掉时不补「其他」', () => {
    expect(
      normalizeQuestions([
        { question: 'A', allowOther: false, options: [{ label: '甲' }] },
      ])[0]!.options,
    ).toHaveLength(1);
  });

  it('没有题干的条目被丢掉', () => {
    expect(
      normalizeQuestions([{ options: [] }, { question: 'A' }]),
    ).toHaveLength(1);
  });

  it('形状不符时返回空数组', () => {
    expect(normalizeQuestions('not json')).toEqual([]);
    expect(normalizeQuestions(null)).toEqual([]);
  });
});

describe('resolveQuestions', () => {
  it('参数优先于结果', () => {
    expect(
      resolveQuestions(
        call(
          { questions: [{ question: '参数题' }] },
          { questions: [{ question: '结果题' }] },
        ),
      )[0]!.question,
    ).toBe('参数题');
  });

  it('参数没有时退到结果', () => {
    expect(
      resolveQuestions(call({}, { questions: [{ question: '结果题' }] }))[0]!
        .question,
    ).toBe('结果题');
  });
});

describe('askQuestionSummary', () => {
  it('单题给题干，多题补「等 N 题」，无题「无问题」', () => {
    const one = normalizeQuestions([{ question: 'A' }]);
    const two = normalizeQuestions([{ question: 'A' }, { question: 'B' }]);

    expect(askQuestionSummary(one)).toBe('A');
    expect(askQuestionSummary(two)).toBe('A 等 2 题');
    expect(askQuestionSummary([])).toBe('无问题');
  });

  it('题干超过 36 个字符时截断', () => {
    const summary = askQuestionSummary(
      normalizeQuestions([{ question: 'x'.repeat(40) }]),
    );

    expect(summary).toBe(`${'x'.repeat(36)}...`);
  });
});

describe('答案解析', () => {
  const questions = normalizeQuestions([
    {
      question: 'A',
      questionId: 'q1',
      options: [{ label: '甲', value: 'jia' }],
    },
    {
      question: 'B',
      questionId: 'q2',
      options: [{ label: '乙', value: 'yi' }],
    },
  ]);

  it('user_answer 优先于 answer', () => {
    expect(resolveUserAnswer(call({}, { answer: 'x', user_answer: 'y' }))).toBe(
      'y',
    );
    expect(resolveUserAnswer(call({}, { answer: 'x' }))).toBe('x');
    expect(resolveUserAnswer(call({}))).toBeNull();
  });

  it('单题时结果可以直接是标量', () => {
    const single = [questions[0]!];

    expect(questionAnswer('jia', single, single[0]!)).toBe('jia');
    expect(questionAnswer({ q1: 'jia' }, questions, questions[0]!)).toBe('jia');
    expect(
      questionAnswer({ q1: 'jia' }, questions, questions[1]!),
    ).toBeUndefined();
  });

  it('选项值翻译成标签，找不到原样返回', () => {
    expect(formatAnswer('jia', questions[0]!)).toBe('甲');
    expect(formatAnswer('unknown', questions[0]!)).toBe('unknown');
    expect(formatAnswer(['jia', 'yi'], questions[0]!)).toBe('甲、yi');
  });

  it('type=other 时拼「其他: 文本」', () => {
    expect(
      formatAnswer(
        { type: 'other', selected: ['jia'], text: '自己写' },
        questions[0]!,
      ),
    ).toBe('甲、其他: 自己写');
    expect(formatAnswer({ type: 'other' }, questions[0]!)).toBe('其他');
  });
});

describe('answeredSummary', () => {
  const questions = normalizeQuestions([
    { question: 'A', questionId: 'q1' },
    { question: 'B', questionId: 'q2' },
  ]);

  it('逐题拼起来，没有回答时为空串', () => {
    expect(answeredSummary({ q1: '甲', q2: '乙' }, questions)).toBe('甲 | 乙');
    expect(answeredSummary(null, questions)).toBe('');
  });

  it('超过 120 个字符时截断', () => {
    const long = answeredSummary({ q1: 'x'.repeat(200) }, questions);

    expect(long).toBe(`${'x'.repeat(120)}...`);
  });
});
