import { describe, expect, it } from 'vitest';

import type { ChatToolCall } from '@/features/chat/api/agent-api';
import {
  groupChunksByFile,
  kbChunkSummary,
  kbQuerySummary,
  parseKbQueryResult,
  previewText,
} from '@/features/chat/lib/kb-query-result';
import { buildToolResultView } from '@/features/chat/lib/tool-result';

const call = (content: unknown, status = 'success'): ChatToolCall => ({
  id: 'call-1',
  name: 'query_kb',
  function: { name: 'query_kb', arguments: '{}' },
  status,
  ...(content === undefined ? {} : { tool_call_result: { content } }),
});

describe('previewText', () => {
  it('超长截断并加省略号，短文本原样', () => {
    expect(previewText('abc', 10)).toBe('abc');
    expect(previewText('x'.repeat(11), 10)).toBe(`${'x'.repeat(10)}...`);
    expect(previewText(null)).toBe('');
  });
});

describe('parseKbQueryResult', () => {
  it('片段同时接受 results 与 chunks 两种字段名', () => {
    expect(
      parseKbQueryResult({ results: [{ content: 'A' }] }).chunks,
    ).toHaveLength(1);
    expect(parseKbQueryResult({ chunks: [{ content: 'A' }] }).chunks).toHaveLength(
      1,
    );
  });

  it('丢掉没有内容的片段，并读出元数据', () => {
    const [chunk] = parseKbQueryResult({
      results: [
        { score: 0.9 },
        { content: 'A', score: 0.5, metadata: { source: 's.md', file_id: 'f-1' } },
      ],
    }).chunks;

    expect(chunk).toEqual({
      content: 'A',
      score: 0.5,
      source: 's.md',
      fileId: 'f-1',
      chunkId: '',
      kbId: '',
    });
  });

  it('实体与关系取两种字段名，缺省值明确', () => {
    const result = parseKbQueryResult({
      entities: [{ name: '实体A' }, { entity_name: '实体B', entity_type: '人' }],
      relationships: [{}],
    });

    expect(result.entities[0]).toEqual({
      name: '实体A',
      type: '未分类',
      description: '',
    });
    expect(result.entities[1]).toEqual({
      name: '实体B',
      type: '人',
      description: '',
    });
    expect(result.relationships[0]).toEqual({
      srcId: '-',
      tgtId: '-',
      keywords: '关联',
    });
  });

  it('引用标签是「编号: 地址」，缺字段有兜底', () => {
    expect(
      parseKbQueryResult({ references: [{ file_path: '/a.md' }] }).references[0],
    ).toEqual({ url: '/a.md', label: '#1: /a.md' });
    expect(parseKbQueryResult({ references: [{}] }).references[0]).toEqual({
      url: '#',
      label: '#1: #',
    });
  });

  it('形状不符时返回空结果且 hasGraphData 为 false', () => {
    expect(parseKbQueryResult('not json')).toEqual({
      chunks: [],
      entities: [],
      relationships: [],
      references: [],
      hasGraphData: false,
    });
    expect(parseKbQueryResult([1, 2]).hasGraphData).toBe(false);
  });

  it('三块图谱数据任意一块非空就算有图谱', () => {
    expect(parseKbQueryResult({ references: [{ url: 'x' }] }).hasGraphData).toBe(
      true,
    );
    expect(parseKbQueryResult({ chunks: [{ content: 'A' }] }).hasGraphData).toBe(
      false,
    );
  });
});

describe('kbQuerySummary', () => {
  it('片段与图谱都有时并报', () => {
    expect(
      kbQuerySummary(
        call({ results: [{ content: 'A' }], entities: [{ name: 'E' }] }),
      ),
    ).toBe('1 条片段，1 个实体');
  });

  it('只有片段或只有图谱时各自报数', () => {
    expect(kbQuerySummary(call({ results: [{ content: 'A' }] }))).toBe('1 个结果');
    expect(
      kbQuerySummary(call({ entities: [{ name: 'E' }], relationships: [{}] })),
    ).toBe('1 个实体，1 条关系');
  });

  it('请求成功但两块都空时报未找到结果', () => {
    expect(kbQuerySummary(call({}))).toBe('未找到结果');
  });

  it('还没结束且没有内容时不给摘要', () => {
    expect(kbQuerySummary(call(undefined, 'running'))).toBe('');
  });
});

describe('片段分组与摘要', () => {
  it('按来源分组，保留首次出现的顺序', () => {
    const groups = groupChunksByFile([
      { content: 'A', score: null, source: 'b.md', fileId: 'f-2', chunkId: '', kbId: '' },
      { content: 'B', score: null, source: 'a.md', fileId: 'f-1', chunkId: '', kbId: '' },
      { content: 'C', score: null, source: 'b.md', fileId: 'f-2', chunkId: '', kbId: '' },
    ]);

    expect(groups.map((group) => group.filename)).toEqual(['b.md', 'a.md']);
    expect(groups[0]!.chunks).toHaveLength(2);
  });

  it('有 file_id 时按 file_id 归组，同文件不同来源名不会拆开', () => {
    const groups = groupChunksByFile([
      { content: 'A', score: null, source: 'x.md', fileId: 'f-1', chunkId: '', kbId: '' },
      { content: 'B', score: null, source: 'y.md', fileId: 'f-1', chunkId: '', kbId: '' },
    ]);

    expect(groups).toHaveLength(1);
  });

  it('摘要给出片段数与文件数', () => {
    const chunks = [
      { content: 'A', score: null, source: 'b.md', fileId: 'f-2', chunkId: '', kbId: '' },
      { content: 'B', score: null, source: 'a.md', fileId: 'f-1', chunkId: '', kbId: '' },
    ];

    expect(kbChunkSummary(chunks)).toBe('找到 2 个相关文档片段，来自 2 个文件');
    expect(kbChunkSummary([])).toBe('');
  });

  it('来源全缺时归到「未知来源」而不是空串', () => {
    const [chunk] = parseKbQueryResult({ results: [{ content: 'A' }] }).chunks;

    expect(chunk!.source).toBe('未知来源');
  });

  it('分数可以从 metadata 里读', () => {
    const [chunk] = parseKbQueryResult({
      results: [{ content: 'A', metadata: { score: 0.42 } }],
    }).chunks;

    expect(chunk!.score).toBe(0.42);
  });
});

describe('知识库检索的结果视图', () => {
  it('有结果时接管渲染', () => {
    expect(buildToolResultView(call({ results: [{ content: 'A' }] }))?.kind).toBe(
      'kb-query',
    );
  });

  it('还没有结果时不接管', () => {
    expect(buildToolResultView(call(undefined))).toBeNull();
  });
});
