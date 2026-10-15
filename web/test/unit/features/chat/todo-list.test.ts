import { describe, expect, it } from 'vitest';

import type { ChatToolCall } from '@/features/chat/api/agent-api';
import {
  parseTodoList,
  TODO_NAME_MAX_LENGTH,
  todoHeaderLabel,
  truncateTodoName,
} from '@/features/chat/lib/todo-list';

const call = (args: unknown, content?: unknown): ChatToolCall => ({
  id: 'call-1',
  name: 'write_todos',
  function: {
    name: 'write_todos',
    arguments: typeof args === 'string' ? args : JSON.stringify(args),
  },
  status: 'success',
  ...(content === undefined ? {} : { tool_call_result: { content } }),
});

describe('truncateTodoName', () => {
  it('按 Unicode 截断到 20 个字符，不截断代理对', () => {
    expect(Array.from(truncateTodoName('🙂'.repeat(30)))).toHaveLength(
      TODO_NAME_MAX_LENGTH,
    );
    expect(truncateTodoName('短')).toBe('短');
    expect(truncateTodoName(null)).toBe('');
  });
});

describe('parseTodoList', () => {
  it('接受数组与 {todos: [...]} 两种形状', () => {
    const items = [{ content: 'A', status: 'pending' }];

    expect(parseTodoList(items)).toHaveLength(1);
    expect(parseTodoList({ todos: items })).toHaveLength(1);
    expect(parseTodoList(JSON.stringify(items))).toHaveLength(1);
  });

  it('未登记的状态归到 unknown', () => {
    expect(parseTodoList([{ content: 'A', status: 'weird' }])[0]!.status).toBe(
      'unknown',
    );
    expect(parseTodoList([{ content: 'A' }])[0]!.status).toBe('unknown');
  });

  it('四档已知状态原样保留', () => {
    const statuses = ['completed', 'in_progress', 'pending', 'cancelled'];

    expect(
      parseTodoList(
        statuses.map((status) => ({ content: status, status })),
      ).map((item) => item.status),
    ).toEqual(statuses);
  });

  it('丢掉没有内容的条目', () => {
    expect(
      parseTodoList([{ status: 'pending' }, { content: 'B' }]),
    ).toHaveLength(1);
  });

  it('形状不符时返回空数组', () => {
    expect(parseTodoList('not json')).toEqual([]);
    expect(parseTodoList(null)).toEqual([]);
    expect(parseTodoList({ todos: 'x' })).toEqual([]);
  });
});

describe('todoHeaderLabel', () => {
  it('优先进行中，其次待处理，都没有时用最后一条', () => {
    const items = [
      { content: '完成项', status: 'completed' },
      { content: '进行项', status: 'in_progress' },
      { content: '待办项', status: 'pending' },
    ];

    expect(todoHeaderLabel(call({}, items))).toBe('进行中: 进行项');
    expect(
      todoHeaderLabel(
        call(
          {},
          items.filter((i) => i.status !== 'in_progress'),
        ),
      ),
    ).toBe('待处理: 待办项');
    expect(
      todoHeaderLabel(call({}, [{ content: '完成项', status: 'completed' }])),
    ).toBe('更新: 完成项');
  });

  it('结果里没有列表时退到参数', () => {
    expect(todoHeaderLabel(call({ content: '参数内容' }))).toBe('参数内容');
    expect(todoHeaderLabel(call({ action: '参数动作' }))).toBe('参数动作');
    expect(todoHeaderLabel(call({ todo: '参数待办' }))).toBe('参数待办');
  });

  it('两处都没有时返回空串', () => {
    expect(todoHeaderLabel(call({}))).toBe('');
  });
});
