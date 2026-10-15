import { describe, expect, it } from 'vitest';

import type { ChatMessage, ChatToolCall } from '@/features/chat/api/agent-api';
import { extractSources, hasSources } from '@/features/chat/lib/sources';

const toolCall = (
  name: string,
  content: unknown,
  args?: unknown,
): ChatToolCall => ({
  id: `call-${name}`,
  name,
  function: {
    name,
    arguments: JSON.stringify(args ?? {}),
  },
  status: 'success',
  tool_call_result: { content: JSON.stringify(content) },
});

const aiMessage = (toolCalls: ChatToolCall[]): ChatMessage => ({
  id: 1,
  type: 'ai',
  content: '回答',
  tool_calls: toolCalls,
});

describe('extractSources 的知识库来源', () => {
  it('按 query_kb 的检索结果提取，并解析知识库名', () => {
    const sources = extractSources(
      [
        aiMessage([
          toolCall('query_kb', {
            kb_id: 'kb-1',
            results: [
              {
                id: 'c-1',
                kb_id: 'kb-1',
                file_id: 'f-1',
                content: '片段正文',
                metadata: { source: 'a.md', score: 0.8 },
              },
            ],
          }),
        ]),
      ],
      { resolveKbName: (kbId) => (kbId === 'kb-1' ? '产品文档' : '') },
    );

    expect(sources.knowledgeChunks).toEqual([
      {
        kbId: 'kb-1',
        kbName: '产品文档',
        content: '片段正文',
        score: 0.8,
        source: 'a.md',
        fileId: 'f-1',
        chunkId: 'c-1',
      },
    ]);
  });

  it('结果条目没带 kb_id 时退到参数里的 kb_id', () => {
    const sources = extractSources([
      aiMessage([
        toolCall(
          'query_kb',
          { results: [{ content: 'A' }] },
          { kb_id: 'kb-9' },
        ),
      ]),
    ]);

    expect(sources.knowledgeChunks[0]!.kbId).toBe('kb-9');
  });

  it('解析不出知识库名时条目仍保留，名称为空', () => {
    const sources = extractSources([
      aiMessage([toolCall('query_kb', { results: [{ content: 'A' }] })]),
    ]);

    expect(sources.knowledgeChunks).toHaveLength(1);
    expect(sources.knowledgeChunks[0]!.kbName).toBe('');
  });

  it('按「知识库 + 片段 id」去重，id 缺失时退回内容', () => {
    const chunk = { content: 'A', kb_id: 'kb-1' };
    const sources = extractSources([
      aiMessage([toolCall('query_kb', { results: [chunk, { ...chunk }] })]),
    ]);

    expect(sources.knowledgeChunks).toHaveLength(1);
  });

  it('同一个片段 id 出现在不同知识库时不去重', () => {
    const sources = extractSources([
      aiMessage([
        toolCall('query_kb', {
          results: [
            { id: 'c-1', kb_id: 'kb-1', content: 'A' },
            { id: 'c-1', kb_id: 'kb-2', content: 'A' },
          ],
        }),
      ]),
    ]);

    expect(sources.knowledgeChunks).toHaveLength(2);
  });

  it('分数降序，没分数的排在后面但不丢', () => {
    const sources = extractSources([
      aiMessage([
        toolCall('query_kb', {
          results: [
            { id: 'c-1', content: '低', metadata: { score: 0.2 } },
            { id: 'c-2', content: '高', metadata: { score: 0.9 } },
            { id: 'c-3', content: '无分' },
          ],
        }),
      ]),
    ]);

    expect(sources.knowledgeChunks.map((chunk) => chunk.content)).toEqual([
      '高',
      '低',
      '无分',
    ]);
  });

  it('拿工具名当知识库名的旧口径不再生效', () => {
    // 按知识库名匹配会丢掉这条；本仓按 query_kb 正常提取
    const sources = extractSources([
      aiMessage([toolCall('query_kb', { results: [{ content: 'A' }] })]),
    ]);

    expect(sources.knowledgeChunks).toHaveLength(1);
  });
});

describe('extractSources 的网络来源', () => {
  it('三个搜索工具都提取，并带上工具名', () => {
    const sources = extractSources([
      aiMessage([
        toolCall('web_search', { results: [{ title: 'A', url: 'https://a' }] }),
        toolCall('tavily_search', {
          results: [{ title: 'B', url: 'https://b' }],
        }),
        toolCall('doubao_search', {
          results: [{ title: 'C', url: 'https://c' }],
        }),
      ]),
    ]);

    expect(sources.webSources.map((source) => source.toolName)).toEqual([
      'web_search',
      'tavily_search',
      'doubao_search',
    ]);
  });

  it('按链接去重，分数降序', () => {
    const sources = extractSources([
      aiMessage([
        toolCall('web_search', {
          results: [
            { title: 'A', url: 'https://a', score: 0.3 },
            { title: 'A 重复', url: 'https://a', score: 0.9 },
            { title: 'B', url: 'https://b', score: 0.7 },
          ],
        }),
      ]),
    ]);

    expect(sources.webSources.map((source) => source.title)).toEqual([
      'B',
      'A',
    ]);
  });
});

describe('extractSources 的边界', () => {
  it('非 ai 消息、没有工具调用、空输入都返回空来源', () => {
    expect(extractSources([{ id: 1, type: 'human', content: '问题' }])).toEqual(
      { knowledgeChunks: [], webSources: [] },
    );
    expect(extractSources([aiMessage([])])).toEqual({
      knowledgeChunks: [],
      webSources: [],
    });
    expect(extractSources(null)).toEqual({
      knowledgeChunks: [],
      webSources: [],
    });
  });

  it('不认识的工具不提取', () => {
    const sources = extractSources([
      aiMessage([toolCall('bash', { results: [{ content: 'A' }] })]),
    ]);

    expect(hasSources(sources)).toBe(false);
  });

  it('参数解析不了时不影响结果提取', () => {
    const broken: ChatToolCall = {
      id: 'call-1',
      name: 'query_kb',
      function: { name: 'query_kb', arguments: 'not json' },
      status: 'success',
      tool_call_result: {
        content: JSON.stringify({ results: [{ content: 'A' }] }),
      },
    };

    expect(extractSources([aiMessage([broken])]).knowledgeChunks).toHaveLength(
      1,
    );
  });
});

describe('hasSources', () => {
  it('两类任一非空即为有来源', () => {
    expect(hasSources({ knowledgeChunks: [], webSources: [] })).toBe(false);
    expect(
      hasSources({
        knowledgeChunks: [
          {
            kbId: '',
            kbName: '',
            content: 'A',
            score: null,
            source: '',
            fileId: '',
            chunkId: '',
          },
        ],
        webSources: [],
      }),
    ).toBe(true);
  });
});
