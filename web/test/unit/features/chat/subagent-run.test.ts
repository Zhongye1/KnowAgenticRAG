import { describe, expect, it } from 'vitest';

import type { ChatToolCall } from '@/features/chat/api/agent-api';
import {
  buildSubagentLifecycleView,
  buildSubagentTaskView,
  isSubagentToolCall,
  readSubagentRuns,
  resolveSubagentDisplayName,
  resolveSubagentEffectiveStatus,
  resolveTaskRunStatus,
  subagentStatusLabel,
  truncateText,
} from '@/features/chat/lib/subagent-run';

const call = (overrides: Partial<ChatToolCall> = {}): ChatToolCall => ({
  id: 'call-1',
  name: 'task',
  args: { description: '帮我调研一下', subagent_slug: 'researcher' },
  ...overrides,
});

describe('readSubagentRuns', () => {
  it('读取完整的运行态条目', () => {
    const runs = readSubagentRuns({
      subagent_runs: [
        {
          run_id: 'r1',
          child_thread_id: 't1',
          subagent_name: '调研员',
          status: 'running',
        },
      ],
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      run_id: 'r1',
      child_thread_id: 't1',
      subagent_name: '调研员',
      status: 'running',
    });
  });

  it('丢弃缺子线程或缺 run id 的条目', () => {
    const runs = readSubagentRuns({
      subagent_runs: [
        { run_id: 'r1', status: 'running' },
        { child_thread_id: 't2' },
        'garbage',
      ],
    });
    expect(runs).toEqual([]);
  });

  it('非对象状态与缺字段返回空数组', () => {
    expect(readSubagentRuns(null)).toEqual([]);
    expect(readSubagentRuns('x')).toEqual([]);
    expect(readSubagentRuns({})).toEqual([]);
    expect(readSubagentRuns({ subagent_runs: 'no' })).toEqual([]);
  });
});

describe('resolveSubagentDisplayName', () => {
  it('结果里的名字优先，其次参数 slug，退回「子智能体」', () => {
    expect(
      resolveSubagentDisplayName(
        call({ tool_call_result: { content: JSON.stringify({ subagent_name: '写手' }) } }),
      ),
    ).toBe('写手');
    expect(resolveSubagentDisplayName(call())).toBe('researcher');
    expect(resolveSubagentDisplayName(call({ args: {} }))).toBe('子智能体');
  });
});

describe('resolveSubagentEffectiveStatus', () => {
  it('run_status 优先于 status', () => {
    expect(
      resolveSubagentEffectiveStatus(
        call({
          tool_call_result: {
            content: JSON.stringify({ run_status: 'running', status: 'ok' }),
          },
        }),
      ),
    ).toBe('running');
  });
});

describe('subagentStatusLabel', () => {
  it('白名单译成中文，未知原样返回', () => {
    expect(subagentStatusLabel('running')).toBe('运行中');
    expect(subagentStatusLabel('cancel_requested')).toBe('取消中');
    expect(subagentStatusLabel('weird')).toBe('weird');
    expect(subagentStatusLabel('')).toBe('');
  });
});

describe('resolveTaskRunStatus', () => {
  it('有结果即完成，结果标 failed 算失败', () => {
    expect(
      resolveTaskRunStatus(call({ tool_call_result: { content: 'done' } })),
    ).toBe('completed');
    expect(
      resolveTaskRunStatus(
        call({
          tool_call_result: {
            content: JSON.stringify({ status: 'failed' }),
          },
        }),
      ),
    ).toBe('failed');
  });

  it('没有结果时只有活跃调用算运行中', () => {
    expect(
      resolveTaskRunStatus(call({ id: 'a', tool_call_result: null }), {
        activeToolCallIds: new Set(['a']),
      }),
    ).toBe('running');
    expect(
      resolveTaskRunStatus(call({ id: 'b', tool_call_result: null }), {
        activeToolCallIds: new Set(['a']),
      }),
    ).toBe('completed');
  });

  it('error 状态算失败', () => {
    expect(resolveTaskRunStatus(call({ status: 'error' }))).toBe('failed');
  });
});

describe('isSubagentToolCall', () => {
  it('认全六个工具 id，不认别的', () => {
    for (const id of ['task', 'subagent_start', 'subagent_status', 'subagent_events', 'subagent_cancel', 'subagent_await']) {
      expect(isSubagentToolCall(call({ name: id }))).toBe(true);
    }
    expect(isSubagentToolCall(call({ name: 'read_file' }))).toBe(false);
    expect(isSubagentToolCall(null)).toBe(false);
  });
});

describe('buildSubagentLifecycleView', () => {
  it('组装头部、状态与元信息', () => {
    const view = buildSubagentLifecycleView(
      call({
        name: 'subagent_start',
        args: { subagent_slug: 'researcher' },
        tool_call_result: {
          content: JSON.stringify({
            subagent_name: '调研员',
            run_status: 'running',
            run_id: 'r1',
            thread_id: 't1',
            message: '已启动',
          }),
        },
      }),
    );
    expect(view.title).toBe('启动子智能体: 调研员');
    expect(view.statusLabel).toBe('运行中');
    expect(view.statusKind).toBe('running');
    expect(view.detail).toBe('已启动');
    expect(view.meta).toEqual([
      { label: 'run_id', value: 'r1' },
      { label: 'thread_id', value: 't1' },
      { label: 'subagent_slug', value: 'researcher' },
    ]);
  });

  it('失败状态进 failed，错误状态也进 failed', () => {
    const failed = buildSubagentLifecycleView(
      call({
        name: 'subagent_await',
        tool_call_result: {
          content: JSON.stringify({ run_status: 'failed', error: 'boom' }),
        },
      }),
    );
    expect(failed.statusKind).toBe('failed');
    const errored = buildSubagentLifecycleView(call({ status: 'error' }));
    expect(errored.statusKind).toBe('failed');
  });

  it('结果正文取 output，事件截到八条', () => {
    const events = Array.from({ length: 12 }, (_, i) => ({ seq: String(i), event: 'e' }));
    const view = buildSubagentLifecycleView(
      call({
        name: 'subagent_status',
        tool_call_result: {
          content: JSON.stringify({
            events,
            result: { output: '最终产出' },
          }),
        },
      }),
    );
    expect(view.resultText).toBe('最终产出');
    expect(view.events).toHaveLength(8);
  });

  it('非对象结果不产生兜底文本', () => {
    const view = buildSubagentLifecycleView(
      call({
        name: 'subagent_cancel',
        tool_call_result: { content: 'plain text' },
      }),
    );
    expect(view.resultText).toBe('');
    // 非对象内容没有结构可序列化，交给通用渲染而不是把空对象当内容
    expect(view.fallbackResult).toBe('');
  });

  it('无结果时不拼出结构化内容，slug 来自参数', () => {
    const view = buildSubagentLifecycleView(call({ name: 'subagent_status' }));
    expect(view.events).toEqual([]);
    expect(view.progressMessages).toEqual([]);
    expect(view.fallbackResult).toBe('');
    // 参数里的 slug 撑头部与元信息
    expect(view.title).toBe('查询子智能体: researcher');
    expect(view.meta).toEqual([{ label: 'subagent_slug', value: 'researcher' }]);
  });
});

describe('buildSubagentTaskView', () => {
  it('描述截到 50', () => {
    const long = '字'.repeat(60);
    const view = buildSubagentTaskView(call({ args: { description: long } }));
    expect(view.description).toHaveLength(53); // 50 + '...'
  });

  it('结果正文取工具结果', () => {
    const view = buildSubagentTaskView(
      call({ tool_call_result: { content: '调研结论：……' } }),
    );
    expect(view.resultText).toBe('调研结论：……');
    expect(view.runStatusLabel).toBe('已完成');
  });
});

describe('truncateText', () => {
  it('空白归一并截断', () => {
    expect(truncateText('  a\n b  ')).toBe('a b');
    expect(truncateText('x'.repeat(61), 60)).toBe(`${'x'.repeat(60)}...`);
    expect(truncateText(null)).toBe('');
  });
});
