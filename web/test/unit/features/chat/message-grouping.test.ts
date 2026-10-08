import { describe, expect, it } from 'vitest';

import {
  collapseConversationProcess,
  formatProcessDuration,
  getConversationDisplayItems,
} from '@/features/chat/lib/message-grouping';
import type { ConversationItem } from '@/features/chat/lib/message-grouping';
import type { ConversationMessage } from '@/features/chat/lib/message-processor';

const human = (id: number, content = '问题'): ConversationMessage => ({
  id,
  type: 'human',
  content,
});

const assistant = (
  id: number,
  extra: Partial<ConversationMessage> = {},
): ConversationMessage => ({
  id,
  type: 'ai',
  content: '回答',
  ...extra,
});

const toolCall = (id: string, name = 'bash') => ({
  id,
  name,
  args: { command: 'ls' },
});

describe('formatProcessDuration', () => {
  it('没有时长时退回中性文案', () => {
    expect(formatProcessDuration(0)).toBe('处理过程');
  });

  it('按分钟与秒展示', () => {
    expect(formatProcessDuration(65_000)).toBe('耗时1分钟5秒');
    expect(formatProcessDuration(9_000)).toBe('耗时0分钟9秒');
  });
});

describe('getConversationDisplayItems', () => {
  it('没有工具调用时逐条输出消息', () => {
    const items = getConversationDisplayItems([human(1), assistant(2)]);

    expect(items.map((item) => item.type)).toEqual(['message', 'message']);
  });

  it('把相邻助手消息的工具调用合并成一个工具组', () => {
    const items = getConversationDisplayItems([
      human(1),
      assistant(2, { content: '', tool_calls: [toolCall('t-1')] }),
      assistant(3, { content: '', tool_calls: [toolCall('t-2', 'grep')] }),
    ]);

    expect(items.map((item) => item.type)).toEqual(['message', 'tool-group']);
    const group = items[1];
    expect(group?.type === 'tool-group' && group.toolCalls).toHaveLength(2);
  });

  it('带正文的助手消息与它的工具组各占一项', () => {
    const items = getConversationDisplayItems([
      human(1),
      assistant(2, { content: '先看看', tool_calls: [toolCall('t-1')] }),
    ]);

    expect(items.map((item) => item.type)).toEqual([
      'message',
      'message',
      'tool-group',
    ]);
  });

  it('没有正文只有工具调用的助手消息不单独占一行', () => {
    const items = getConversationDisplayItems([
      human(1),
      assistant(2, { content: '', tool_calls: [toolCall('t-1')] }),
    ]);

    expect(items.map((item) => item.type)).toEqual(['message', 'tool-group']);
  });

  it('隐藏工具被过滤，只剩隐藏工具时不产生工具组', () => {
    const items = getConversationDisplayItems([
      human(1),
      assistant(2, {
        content: '',
        tool_calls: [toolCall('t-1', 'present_artifacts')],
      }),
    ]);

    expect(items.map((item) => item.type)).toEqual(['message']);
  });

  it('无效或半截的工具调用被丢弃', () => {
    const items = getConversationDisplayItems([
      human(1),
      assistant(2, {
        content: '',
        tool_calls: [{ name: 'bash' }, toolCall('t-2')] as never,
      }),
    ]);

    const group = items[1];
    expect(group?.type === 'tool-group' && group.toolCalls).toHaveLength(1);
  });

  it('用户消息会打断工具组，不会跨轮合并', () => {
    const items = getConversationDisplayItems([
      human(1),
      assistant(2, { content: '', tool_calls: [toolCall('t-1')] }),
      human(3),
      assistant(4, { content: '', tool_calls: [toolCall('t-2')] }),
    ]);

    expect(items.map((item) => item.type)).toEqual([
      'message',
      'tool-group',
      'message',
      'tool-group',
    ]);
  });

  it('空输入返回空数组', () => {
    expect(getConversationDisplayItems([])).toEqual([]);
    expect(getConversationDisplayItems(null)).toEqual([]);
  });
});

describe('collapseConversationProcess', () => {
  const items = getConversationDisplayItems([
    human(1),
    assistant(2, { content: '先看看', tool_calls: [toolCall('t-1')] }),
    assistant(3, { content: '再看一眼', tool_calls: [toolCall('t-2')] }),
    assistant(4, {
      content: '最终回答',
      run_started_at: '2026-10-01T10:00:00',
      run_finished_at: '2026-10-01T10:01:05',
    }),
  ]);

  it('未开启折叠时原样返回', () => {
    expect(collapseConversationProcess(items, false)).toBe(items);
  });

  it('已收尾时把中间过程折成一组，带上消息数、工具数与耗时', () => {
    const collapsed = collapseConversationProcess(items, true);

    expect(collapsed.map((item) => item.type)).toEqual([
      'message',
      'process-group',
      'message',
    ]);
    const group = collapsed[1];
    expect(group?.type === 'process-group' && group).toMatchObject({
      messageCount: 2,
      toolCallCount: 2,
      durationMs: 65_000,
    });
  });

  it('最后一项不是助手消息时不折叠，避免藏住未收尾的内容', () => {
    const unfinished = getConversationDisplayItems([
      human(1),
      assistant(2, { content: '中间', tool_calls: [toolCall('t-1')] }),
      human(3),
    ]);

    expect(collapseConversationProcess(unfinished, true)).toBe(unfinished);
  });

  it('中间夹着用户消息时不折叠', () => {
    // 手工构造「过程里混进用户消息」的渲染项：正常分组不会这样产出，这里直接验证守卫
    const mixed: ConversationItem[] = [
      { type: 'message', key: '1', message: human(1), sourceIndex: 0 },
      {
        type: 'message',
        key: '2',
        message: assistant(2, { content: '中间' }),
        sourceIndex: 1,
      },
      { type: 'message', key: '9', message: human(9), sourceIndex: 2 },
      { type: 'tool-group', key: 'g', toolCalls: [toolCall('t-1')] },
      {
        type: 'message',
        key: '3',
        message: assistant(3, { content: '最终回答' }),
        sourceIndex: 4,
      },
    ];

    expect(collapseConversationProcess(mixed, true)).toBe(mixed);
  });

  it('末尾还有工具组时不折叠，避免把仍在执行的一步藏起来', () => {
    const withTrailingToolGroup = getConversationDisplayItems([
      human(1),
      assistant(2, { content: '中间', tool_calls: [toolCall('t-1')] }),
      assistant(3, {
        content: '最终回答',
        run_started_at: '2026-10-01T10:00:00',
        run_finished_at: '2026-10-01T10:00:30',
      }),
      assistant(4, { content: '', tool_calls: [toolCall('t-2')] }),
    ]);

    expect(withTrailingToolGroup.map((item) => item.type)).toEqual([
      'message',
      'message',
      'tool-group',
      'message',
      'tool-group',
    ]);
    expect(collapseConversationProcess(withTrailingToolGroup, true)).toBe(
      withTrailingToolGroup,
    );
  });

  it('只有思维链没有正文的助手消息也要占一项，否则思维链会消失', () => {
    const items = getConversationDisplayItems([
      human(1),
      assistant(2, {
        content: '',
        extra_metadata: {
          additional_kwargs: { reasoning_content: '还在想' },
        },
      }),
    ]);

    expect(items.map((item) => item.type)).toEqual(['message', 'message']);
  });

  it('中间过程为空时不做无用折叠', () => {
    const single = getConversationDisplayItems([human(1), assistant(2)]);

    expect(collapseConversationProcess(single, true)).toBe(single);
  });
});
