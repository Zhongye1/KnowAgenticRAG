/**
 * 消息调试纯逻辑：条目构建、流式合并、分组、筛选搜索、tokens 与 Langfuse 链接。
 */
import { describe, expect, it } from 'vitest';

import {
  buildMessageDebugEntries,
  extractMessageToolNames,
  filterMessageDebugEntries,
  formatDebugTokens,
  formatRunId,
  formatDebugTokenTooltip,
  groupMessageDebugEntries,
  mergeMessageDebugMessages,
  messageDebugFilterTabs,
  resolveLangfuseRunUrl,
  type DebugMessage,
} from '@/features/chat/lib/message-debug';

const human = (extra: Partial<DebugMessage> = {}): DebugMessage => ({
  id: 'm-1',
  type: 'human',
  content: '你好\n世界',
  run_id: 'run_1',
  ...extra,
});

const ai = (extra: Partial<DebugMessage> = {}): DebugMessage => ({
  id: 'm-2',
  type: 'ai',
  content: '我在这里',
  run_id: 'run_1',
  ...extra,
});

describe('条目构建', () => {
  it('按类型给出角色、标签与摘要，内容压成单行', () => {
    const entries = buildMessageDebugEntries([
      human(),
      ai({
        tool_calls: [
          { name: 'search_kb' },
          { name: 'search_kb' },
          { name: 'open_kb' },
        ],
      }),
      {
        id: 'm-3',
        type: 'tool',
        name: 'search_kb',
        content: '结果',
        run_id: 'run_1',
      },
      { id: 'm-4', type: 'system', content: null, run_id: null },
      { id: 'm-5', type: 'weird', content: '???', run_id: null },
    ]);

    expect(entries[0]).toMatchObject({
      role: 'human',
      roleLabel: 'User',
      summary: '你好 世界',
    });
    expect(entries[1].roleLabel).toBe('AI · Tools');
    expect(entries[1].summary).toContain('工具: search_kb、open_kb');
    expect(entries[2]).toMatchObject({
      role: 'tool',
      summary: '工具: search_kb | 结果',
    });
    expect(entries[3]).toMatchObject({ role: 'system', summary: '[系统消息]' });
    expect(entries[4]).toMatchObject({ role: 'other', roleLabel: 'weird' });
  });

  it('带错误字段的 AI 消息算错误，摘要用后端原因', () => {
    const [entry] = buildMessageDebugEntries([
      ai({ error_type: 'timeout', error_message: '模型超时' }),
    ]);

    expect(entry).toMatchObject({
      role: 'error',
      roleLabel: 'Error',
      summary: '模型超时',
    });
  });

  it('id 缺失时用序号补，run 与模型从 extra_metadata 兜底', () => {
    const [entry] = buildMessageDebugEntries([
      {
        type: 'ai',
        content: 'x',
        extra_metadata: {
          run_id: 'run_9',
          model: 'gpt-4o',
          usage: { total_tokens: 10 },
        },
      },
    ]);

    expect(entry.id).toBe('message-0');
    expect(entry.runId).toBe('run_9');
    expect(entry.model).toBe('gpt-4o');
    expect(entry.usage).toEqual({ total_tokens: 10 });
  });

  it('工具名去重', () => {
    expect(
      extractMessageToolNames({
        tool_calls: [{ name: 'a' }, { tool_name: 'a' }, { name: 'b' }],
      }),
    ).toEqual(['a', 'b']);
  });
});

describe('流式合并', () => {
  it('没有进行中的 run 时只是拼接', () => {
    const merged = mergeMessageDebugMessages([human()], [ai({ id: 'live-1' })]);

    expect(merged.map((item) => item.id)).toEqual(['m-1', 'live-1']);
  });

  it('按 run_id 就地替换该 run 的 AI 投影，历史顺序不变', () => {
    const merged = mergeMessageDebugMessages(
      [human(), ai({ id: 'persisted-ai' }), ai({ id: 'm-3', run_id: 'run_2' })],
      [ai({ id: 'live-ai', run_id: 'run_1' })],
      'run_1',
    );

    expect(merged.map((item) => item.id)).toEqual(['m-1', 'live-ai', 'm-3']);
  });

  it('已经在历史里的流式消息不重复追加', () => {
    const merged = mergeMessageDebugMessages(
      [human(), ai({ id: 'm-2' })],
      [ai({ id: 'm-2' })],
    );

    expect(merged.map((item) => item.id)).toEqual(['m-1', 'm-2']);
  });

  it('同一 request 的用户消息已经在历史里就不再加', () => {
    const merged = mergeMessageDebugMessages(
      [human({ request_id: 'req-1' })],
      [human({ id: 'live-human', request_id: 'req-1' })],
    );

    expect(merged.map((item) => item.id)).toEqual(['m-1']);
  });
});

describe('分组与筛选', () => {
  const entries = buildMessageDebugEntries([
    human({ id: 'a' }),
    ai({ id: 'b' }),
    human({ id: 'c', run_id: null }),
    ai({ id: 'd', run_id: null }),
    ai({ id: 'e', run_id: 'run_2' }),
  ]);

  it('按连续 run_id 分组，未关联的单独成组', () => {
    const groups = groupMessageDebugEntries(entries);

    expect(groups.map((group) => [group.runId, group.items.length])).toEqual([
      ['run_1', 2],
      [null, 2],
      ['run_2', 1],
    ]);
    expect(groups[1].key).toContain('unassigned');
  });

  it('筛选标签带各类数量', () => {
    const tabs = messageDebugFilterTabs(entries);

    expect(tabs.map((tab) => [tab.key, tab.count])).toEqual([
      ['all', 5],
      ['human', 2],
      ['ai', 3],
      ['tool', 0],
      ['error', 0],
      ['system', 0],
    ]);
  });

  it('角色筛选与关键词搜索叠加，搜索覆盖摘要/模型/原始 JSON', () => {
    const scoped = filterMessageDebugEntries(entries, 'ai', '');
    expect(scoped.map((item) => item.id)).toEqual(['b', 'd', 'e']);

    const byContent = filterMessageDebugEntries(entries, 'all', '我在这里');
    expect(byContent.map((item) => item.id)).toEqual(['b', 'd', 'e']);

    const byRoleLabel = filterMessageDebugEntries(entries, 'all', 'user');
    expect(byRoleLabel.map((item) => item.id)).toEqual(['a', 'c']);

    // 搜索看的是原始载荷里的字段（分组用的 runId 是派生值，不参与匹配）
    const byRaw = filterMessageDebugEntries(entries, 'all', 'run_2');
    expect(byRaw.map((item) => item.id)).toEqual(['e']);
  });

  it('搜索不区分大小写，空查询返回全部', () => {
    expect(filterMessageDebugEntries(entries, 'all', '  ')).toHaveLength(5);
    expect(
      filterMessageDebugEntries(
        buildMessageDebugEntries([ai({ model: 'GPT-4O' })]),
        'all',
        'gpt-4o',
      ),
    ).toHaveLength(1);
  });
});

describe('tokens 与 run id', () => {
  it('tokens 摘要：上千转 k，没有用量给空串', () => {
    expect(formatDebugTokens({ total_tokens: 1200 })).toBe('1.2k tokens');
    expect(formatDebugTokens({ total: 340 })).toBe('340 tokens');
    expect(formatDebugTokens({})).toBe('');
    expect(formatDebugTokens(null)).toBe('');
  });

  it('tokens tooltip 三段都给', () => {
    expect(
      formatDebugTokenTooltip({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      }),
    ).toBe('输入: 10, 输出: 5, 总计: 15');
    expect(formatDebugTokenTooltip(null)).toBe('');
  });

  it('run id 超过 18 位才掐头去尾', () => {
    expect(formatRunId('run_1234')).toBe('run_1234');
    // 头 8 位 + 省略号 + 尾 6 位
    expect(formatRunId('run_1234567890abcdefghij')).toBe('run_1234…efghij');
  });
});

describe('Langfuse 链接', () => {
  it('只有 available 为真且是 http(s) 才给链接', () => {
    expect(
      resolveLangfuseRunUrl({ available: true, url: 'https://lf.example/t/1' }),
    ).toBe('https://lf.example/t/1');
    expect(
      resolveLangfuseRunUrl({ available: false, url: 'https://lf.example' }),
    ).toBeNull();
    expect(
      resolveLangfuseRunUrl({ available: true, url: 'javascript:alert(1)' }),
    ).toBeNull();
    expect(
      resolveLangfuseRunUrl({ available: true, url: 'not a url' }),
    ).toBeNull();
    expect(resolveLangfuseRunUrl(null)).toBeNull();
  });
});
