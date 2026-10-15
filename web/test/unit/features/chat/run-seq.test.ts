import { describe, expect, it } from 'vitest';

import {
  compareRunSeq,
  hasOngoingRunChunks,
  normalizeRunSeq,
  resolveRunResumeAfterSeq,
  type RunResumeThreadState,
} from '@/features/chat/lib/run-seq';

describe('normalizeRunSeq', () => {
  it('缺失值回落到 0-0', () => {
    expect(normalizeRunSeq(undefined)).toBe('0-0');
    expect(normalizeRunSeq(null)).toBe('0-0');
    expect(normalizeRunSeq('')).toBe('0-0');
    expect(normalizeRunSeq('   ')).toBe('0-0');
  });

  it('去掉首尾空白并保留合法序号', () => {
    expect(normalizeRunSeq('  1712345678901-7 ')).toBe('1712345678901-7');
    expect(normalizeRunSeq('0-0')).toBe('0-0');
    // Redis Stream 的 ms 位允许前导零，规范化不做数值化处理
    expect(normalizeRunSeq('0001-02')).toBe('0001-02');
  });

  it('非 `数字-数字` 形状一律回落到 0-0', () => {
    expect(normalizeRunSeq('abc')).toBe('0-0');
    expect(normalizeRunSeq('12')).toBe('0-0');
    expect(normalizeRunSeq('12-34-56')).toBe('0-0');
    expect(normalizeRunSeq('-12-34')).toBe('0-0');
    expect(normalizeRunSeq('12-')).toBe('0-0');
    expect(normalizeRunSeq(1234)).toBe('0-0');
  });

  it('超出安全整数范围的序号仍按字符串保留', () => {
    expect(normalizeRunSeq('9007199254740993-1')).toBe('9007199254740993-1');
  });
});

describe('compareRunSeq', () => {
  it('相等序号返回 0', () => {
    expect(compareRunSeq('5-3', '5-3')).toBe(0);
    expect(compareRunSeq('0-0', '0-0')).toBe(0);
  });

  it('先比 ms 位再比序号位', () => {
    expect(compareRunSeq('1712345678902-0', '1712345678901-9')).toBe(1);
    expect(compareRunSeq('1712345678901-1', '1712345678902-0')).toBe(-1);
    expect(compareRunSeq('5-10', '5-2')).toBe(1);
    expect(compareRunSeq('5-2', '5-10')).toBe(-1);
  });

  it('不同长度的 ms 位按数值比较而不是字典序', () => {
    expect(compareRunSeq('10-0', '9-100')).toBe(1);
    expect(compareRunSeq('9-100', '10-0')).toBe(-1);
  });

  it('超过安全整数的 ms 位仍能分辨大小', () => {
    expect(compareRunSeq('9007199254740993-0', '9007199254740992-0')).toBe(1);
    expect(compareRunSeq('9007199254740992-0', '9007199254740993-0')).toBe(-1);
  });

  it('非法或缺失的输入按 0-0 参与比较', () => {
    expect(compareRunSeq(undefined, '0-0')).toBe(0);
    expect(compareRunSeq(null, null)).toBe(0);
    expect(compareRunSeq('garbage', '0-0')).toBe(0);
    expect(compareRunSeq('1-0', 'garbage')).toBe(1);
    expect(compareRunSeq('garbage', '1-0')).toBe(-1);
  });
});

describe('hasOngoingRunChunks', () => {
  it('线程状态缺失或结构不对时返回 false', () => {
    expect(hasOngoingRunChunks(undefined)).toBe(false);
    expect(hasOngoingRunChunks(null)).toBe(false);
    expect(hasOngoingRunChunks({})).toBe(false);
    expect(hasOngoingRunChunks({ onGoingConv: null })).toBe(false);
    expect(hasOngoingRunChunks({ onGoingConv: {} })).toBe(false);
    expect(
      hasOngoingRunChunks({
        onGoingConv: {
          msgChunks: 'not-an-object' as unknown as Record<string, unknown>,
        },
      }),
    ).toBe(false);
  });

  it('分片表为空或只有空数组时返回 false', () => {
    expect(hasOngoingRunChunks({ onGoingConv: { msgChunks: {} } })).toBe(false);
    expect(
      hasOngoingRunChunks({ onGoingConv: { msgChunks: { m1: [], m2: [] } } }),
    ).toBe(false);
    expect(
      hasOngoingRunChunks({ onGoingConv: { msgChunks: { m1: null, m2: 0 } } }),
    ).toBe(false);
  });

  it('任一条消息还有分片就返回 true', () => {
    expect(
      hasOngoingRunChunks({
        onGoingConv: { msgChunks: { m1: [], m2: [{ id: 'm2' }] } },
      }),
    ).toBe(true);
    // 非数组的真值同样算未渲染完
    expect(
      hasOngoingRunChunks({
        onGoingConv: { msgChunks: { m1: 'partial' } },
      }),
    ).toBe(true);
  });
});

describe('resolveRunResumeAfterSeq', () => {
  const ongoingThread: RunResumeThreadState = {
    activeRunId: 'run-1',
    runLastSeq: '1712345678901-7',
    onGoingConv: { msgChunks: { m1: [{ id: 'm1' }] } },
  };

  it('快照缺失或没有 run_id 时从 0-0 重放', () => {
    expect(
      resolveRunResumeAfterSeq({ snapshot: null, threadState: ongoingThread }),
    ).toBe('0-0');
    expect(
      resolveRunResumeAfterSeq({
        snapshot: undefined,
        threadState: ongoingThread,
      }),
    ).toBe('0-0');
    expect(
      resolveRunResumeAfterSeq({
        snapshot: { last_seq: '1712345678901-7' },
        threadState: ongoingThread,
      }),
    ).toBe('0-0');
    expect(
      resolveRunResumeAfterSeq({
        snapshot: { run_id: '', last_seq: '1712345678901-7' },
        threadState: ongoingThread,
      }),
    ).toBe('0-0');
  });

  it('没有未渲染分片时即使快照有效也从 0-0 重放', () => {
    expect(
      resolveRunResumeAfterSeq({
        snapshot: { run_id: 'run-1', last_seq: '1712345678901-7' },
        threadState: { activeRunId: 'run-1', onGoingConv: { msgChunks: {} } },
      }),
    ).toBe('0-0');
    expect(
      resolveRunResumeAfterSeq({
        snapshot: { run_id: 'run-1', last_seq: '1712345678901-7' },
        threadState: null,
      }),
    ).toBe('0-0');
  });

  it('快照对应的 run 就是当前活跃 run 时用线程已处理位置续传', () => {
    expect(
      resolveRunResumeAfterSeq({
        snapshot: { run_id: 'run-1', last_seq: '1712345678901-4' },
        threadState: ongoingThread,
      }),
    ).toBe('1712345678901-7');
  });

  it('线程位置为空时退回快照的 last_seq', () => {
    expect(
      resolveRunResumeAfterSeq({
        snapshot: { run_id: 'run-1', last_seq: '1712345678901-4' },
        threadState: { ...ongoingThread, runLastSeq: '' },
      }),
    ).toBe('1712345678901-4');
  });

  it('线程位置是非法值时按 0-0 处理而不是退回快照', () => {
    expect(
      resolveRunResumeAfterSeq({
        snapshot: { run_id: 'run-1', last_seq: '1712345678901-4' },
        threadState: { ...ongoingThread, runLastSeq: 'oops' },
      }),
    ).toBe('0-0');
  });

  it('快照是上一个 run 时从 0-0 重放', () => {
    expect(
      resolveRunResumeAfterSeq({
        snapshot: { run_id: 'run-0', last_seq: '1712345678900-3' },
        threadState: ongoingThread,
      }),
    ).toBe('0-0');
    expect(
      resolveRunResumeAfterSeq({
        snapshot: { run_id: 'run-1', last_seq: '1712345678901-4' },
        threadState: { ...ongoingThread, activeRunId: undefined },
      }),
    ).toBe('0-0');
  });
});
