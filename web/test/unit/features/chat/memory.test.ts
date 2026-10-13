import { describe, expect, it } from 'vitest';

import type { ChatToolCall } from '@/features/chat/api/agent-api';
import {
  buildMemoryView,
  memoryContentPreview,
  MEMORY_PREVIEW_MAX_LENGTH,
} from '@/features/chat/lib/memory';

const call = (
  args: unknown,
  result?: unknown,
): ChatToolCall => ({
  id: 'call-1',
  name: 'remember_memory',
  function: {
    name: 'remember_memory',
    arguments: typeof args === 'string' ? args : JSON.stringify(args),
  },
  status: 'success',
  ...(result === undefined
    ? {}
    : {
        tool_call_result: {
          content: typeof result === 'string' ? result : JSON.stringify(result),
        },
      }),
});

describe('memoryContentPreview', () => {
  it('折叠空白并截断到 60 个字符', () => {
    expect(memoryContentPreview('  多  余\n空白  ')).toBe('多 余 空白');
    expect(memoryContentPreview('x'.repeat(80))).toHaveLength(
      MEMORY_PREVIEW_MAX_LENGTH + 1,
    );
    expect(memoryContentPreview(null)).toBe('');
  });
});

describe('buildMemoryView', () => {
  it('updated 且带 replaces 时是纠正，否则是追加', () => {
    expect(
      buildMemoryView(call({ content: 'A', replaces: 'B' }, { status: 'updated' }))
        .statusText,
    ).toBe('记忆已纠正更新');
    expect(
      buildMemoryView(call({ content: 'A' }, { status: 'updated' })).statusText,
    ).toBe('记忆已追加到末尾');
  });

  it('unchanged 与 error 各有文案，error 带上原因', () => {
    expect(
      buildMemoryView(call({ content: 'A' }, { status: 'unchanged' })).statusText,
    ).toBe('记忆内容已存在，未变更');

    const errored = buildMemoryView(
      call({ content: 'A' }, { status: 'error', error: '磁盘只读' }),
    );
    expect(errored.statusText).toBe('记忆更新失败：磁盘只读');
    expect(errored.isError).toBe(true);
  });

  it('状态未知时不猜文案', () => {
    const view = buildMemoryView(call({ content: 'A' }, { status: 'weird' }));

    expect(view.statusText).toBe('');
    expect(view.isError).toBe(false);
    expect(view.hasResult).toBe(true);
  });

  it('行号区间同号时只给一个行号', () => {
    expect(
      buildMemoryView(call({ content: 'A' }, { status: 'updated', start_line: 3, end_line: 3 }))
        .lineTag,
    ).toBe('L3');
    expect(
      buildMemoryView(call({ content: 'A' }, { status: 'updated', start_line: 3, end_line: 7 }))
        .lineTag,
    ).toBe('L3-7');
  });

  it('元信息按「路径 · 行数 · 字节数」拼装，缺项跳过', () => {
    expect(
      buildMemoryView(
        call(
          { content: 'A' },
          { status: 'updated', path: 'memory.md', start_line: 3, end_line: 7, size: 128 },
        ),
      ).meta,
    ).toBe('memory.md · 第 3-7 行 · 128 B');

    expect(
      buildMemoryView(call({ content: 'A' }, { status: 'updated', path: 'memory.md' }))
        .meta,
    ).toBe('memory.md');
  });

  it('没有结果时 hasResult 为 false 且文案为空', () => {
    const view = buildMemoryView(call({ content: 'A' }));

    expect(view.hasResult).toBe(false);
    expect(view.statusText).toBe('');
    expect(view.meta).toBe('');
  });

  it('参数是解析不了的字符串时预览为空、不是纠正', () => {
    const view = buildMemoryView(call('not json'));

    expect(view.contentPreview).toBe('');
    expect(view.isReplace).toBe(false);
  });
});
