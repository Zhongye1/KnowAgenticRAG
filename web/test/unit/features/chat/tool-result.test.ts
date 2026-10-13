import { describe, expect, it } from 'vitest';

import type { ChatToolCall } from '@/features/chat/api/agent-api';
import { buildToolResultView } from '@/features/chat/lib/tool-result';

const call = (name: string, content: unknown): ChatToolCall => ({
  id: `call-${name}`,
  name,
  function: { name, arguments: '{}' },
  status: 'success',
  tool_call_result: { content },
});

describe('buildToolResultView', () => {
  it('生成图片：结果是 http 链接时画图', () => {
    expect(
      buildToolResultView(call('text_to_img_qwen_image', 'https://a/b.png')),
    ).toEqual({ kind: 'image', url: 'https://a/b.png' });
  });

  it('生成图片：结果不是链接时不画图，交给通用文本渲染', () => {
    expect(
      buildToolResultView(call('text_to_img_qwen_image', '生成失败：额度不足')),
    ).toBeNull();
    expect(buildToolResultView(call('text_to_img_qwen_image', null))).toBeNull();
  });

  it('生成图表：取数组第一项的 text', () => {
    expect(
      buildToolResultView(
        call('chart', [{ type: 'text', text: 'https://a/c.png' }]),
      ),
    ).toEqual({ kind: 'image', url: 'https://a/c.png' });
  });

  it('生成图表：形状不符时不画图', () => {
    expect(buildToolResultView(call('chart', []))).toBeNull();
    expect(buildToolResultView(call('chart', [{ type: 'image' }]))).toBeNull();
    expect(buildToolResultView(call('chart', 'https://a/c.png'))).toBeNull();
  });

  it('其余工具没有专门视图，沿用通用结果渲染', () => {
    expect(buildToolResultView(call('bash', '文件列表'))).toBeNull();
  });
});

describe('网络搜索的结果视图', () => {
  it('结构化结果交给结果列表渲染', () => {
    const view = buildToolResultView(
      call('web_search', {
        results: [{ title: '标题', url: 'https://a', score: 0.87, content: '摘要' }],
      }),
    );

    expect(view).toEqual({
      kind: 'web-search',
      results: [{ title: '标题', url: 'https://a', score: 0.87, content: '摘要' }],
      rawText: '',
    });
  });

  it('结果不是 JSON 时保留原文兜底', () => {
    const view = buildToolResultView(call('tavily_search', '搜索服务不可用'));

    expect(view).toEqual({
      kind: 'web-search',
      results: [],
      rawText: '搜索服务不可用',
    });
  });

  it('既没有结果也没有原文时不接管，交给通用渲染', () => {
    expect(buildToolResultView(call('doubao_search', { results: [] }))).toBeNull();
    expect(buildToolResultView(call('web_search', null))).toBeNull();
  });

  it('丢掉标题与链接都没有的条目', () => {
    const view = buildToolResultView(
      call('web_search', { results: [{}, { url: 'https://a' }] }),
    );

    expect(view?.kind).toBe('web-search');
    expect(
      view?.kind === 'web-search' ? view.results : [],
    ).toEqual([{ title: 'https://a', url: 'https://a', score: null, content: '' }]);
  });
});

describe('计算器的结果视图', () => {
  it('数字按中文习惯加千分位', () => {
    const view = buildToolResultView(call('calculator', 1234567.891));

    expect(view).toEqual({ kind: 'text', text: '1,234,567.891' });
  });

  it('结果是 JSON 字符串时先解析', () => {
    expect(buildToolResultView(call('calculator', '42'))).toEqual({
      kind: 'text',
      text: '42',
    });
  });

  it('特殊值用符号表示', () => {
    const text = (content: unknown) =>
      buildToolResultView(call('calculator', content));

    expect(text(Number.POSITIVE_INFINITY)).toEqual({ kind: 'text', text: '∞' });
    expect(text(Number.NEGATIVE_INFINITY)).toEqual({ kind: 'text', text: '-∞' });
    expect(text(Number.NaN)).toEqual({ kind: 'text', text: 'NaN' });
  });

  it('非数字原样展示，空结果不接管', () => {
    expect(buildToolResultView(call('calculator', '表达式无效'))).toEqual({
      kind: 'text',
      text: '表达式无效',
    });
    expect(buildToolResultView(call('calculator', null))).toBeNull();
    expect(buildToolResultView(call('calculator', ''))).toBeNull();
  });
});

describe('任务清单的结果视图', () => {
  it('有结果时接管渲染', () => {
    const view = buildToolResultView(
      call('write_todos', { todos: [{ content: 'A', status: 'pending' }] }),
    );

    expect(view?.kind).toBe('todo');
    expect(view?.kind === 'todo' ? view.items[0]!.label : '').toBe('A');
  });

  it('结果为空清单时也接管，由组件给空态', () => {
    expect(buildToolResultView(call('write_todos', []))).toEqual({
      kind: 'todo',
      items: [],
    });
  });

  it('还没有结果时不接管', () => {
    expect(buildToolResultView(call('write_todos', null))).toBeNull();
    expect(buildToolResultView(call('write_todos', ''))).toBeNull();
  });
});
