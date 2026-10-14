import { describe, expect, it } from 'vitest';

import type { ChatToolCall } from '@/features/chat/api/agent-api';
import { buildToolHeader } from '@/features/chat/lib/tool-header';

const call = (
  name: string,
  args: unknown,
  extra: Partial<ChatToolCall> = {},
): ChatToolCall => ({
  id: `call-${name}`,
  name,
  function: {
    name,
    arguments: typeof args === 'string' ? args : JSON.stringify(args),
  },
  status: 'success',
  ...extra,
});

const segmentTexts = (toolCall: ChatToolCall) =>
  buildToolHeader(toolCall)?.segments.map((segment) => segment.text) ?? [];

describe('buildToolHeader 的通用行为', () => {
  it('没有专用头部的工具返回 null，由调用方回落到通用文案', () => {
    expect(buildToolHeader(call('unknown_tool', {}))).toBeNull();
  });

  it('参数为空时不产生空片段，避免出现悬空的分隔符', () => {
    const header = buildToolHeader(call('bash', {}));

    expect(header?.note).toBe('执行命令');
    expect(header?.segments).toEqual([]);
  });

  it('参数是解析不了的字符串时按没有参数处理', () => {
    const header = buildToolHeader(call('bash', 'not json'));

    expect(header?.segments).toEqual([]);
  });
});

describe('文件与命令类工具的头部', () => {
  it('执行命令展示命令行', () => {
    expect(buildToolHeader(call('bash', { command: 'ls -la' }))).toEqual({
      note: '执行命令',
      segments: [{ text: 'ls -la', code: true }],
    });
  });

  it('列出目录优先 dir_path，且主体不再重复参数', () => {
    const header = buildToolHeader(
      call('list_directory', { dir_path: '/a', path: '/b' }),
    );

    expect(
      segmentTexts(call('list_directory', { dir_path: '/a', path: '/b' })),
    ).toEqual(['/a']);
    expect(header?.hideParams).toBe(true);
  });

  it('读取文件展示文件名并带上行范围', () => {
    expect(
      segmentTexts(
        call('read_file', {
          file_path: '/deep/dir/app.ts',
          offset: 10,
          limit: 5,
        }),
      ),
    ).toEqual(['app.ts', 'Lines 10-15']);
  });

  it('只给 limit 或只给 offset 时给单边范围', () => {
    expect(
      segmentTexts(call('read_file', { file_path: 'a.ts', limit: 5 })),
    ).toEqual(['a.ts', 'Lines 5']);
    expect(
      segmentTexts(call('read_file', { file_path: 'a.ts', offset: 3 })),
    ).toEqual(['a.ts', 'From 3']);
  });

  it('写入文件展示路径与新增行数', () => {
    expect(
      segmentTexts(
        call('write_file', { file_path: '/a/b.ts', content: '1\n2\n3' }),
      ),
    ).toEqual(['/a/b.ts', '+3']);
  });

  it('写入内容为空时不给行数片段', () => {
    expect(
      segmentTexts(call('write_file', { file_path: '/a/b.ts', content: '' })),
    ).toEqual(['/a/b.ts']);
  });

  it('搜索文件内容同时展示模式与目标路径', () => {
    expect(
      segmentTexts(call('grep', { pattern: 'TODO', dir_path: '/src' })),
    ).toEqual(['TODO', '/src']);
  });

  it('编辑文件只展示文件名，完整路径进 title', () => {
    const header = buildToolHeader(
      call('edit_file', { file_path: '/deep/app.ts' }),
    );

    expect(header?.segments).toEqual([
      { text: 'app.ts', code: true, title: '/deep/app.ts' },
    ]);
  });
});

describe('网络与数据类工具的头部', () => {
  it('网络搜索优先用结果里的 query', () => {
    const toolCall = call(
      'web_search',
      { query: '参数里的词' },
      {
        tool_call_result: { content: JSON.stringify({ query: '结果里的词' }) },
      },
    );

    expect(segmentTexts(toolCall)).toEqual(['结果里的词']);
    expect(buildToolHeader(toolCall)?.hideParams).toBe(true);
  });

  it('结果里没有 query 时退到参数', () => {
    expect(segmentTexts(call('web_search', { q: '兜底词' }))).toEqual([
      '兜底词',
    ]);
  });

  it('SQL 超长时截断到 50 字符', () => {
    const sql = `SELECT ${'x'.repeat(80)}`;
    const [text] = segmentTexts(call('mysql_query', { sql }));

    expect(text).toHaveLength(51);
    expect(text.endsWith('…')).toBe(true);
  });

  it('SQL 不超长时原样展示', () => {
    expect(segmentTexts(call('mysql_query', { sql: 'SELECT 1' }))).toEqual([
      'SELECT 1',
    ]);
  });

  it('查看表结构展示表名', () => {
    expect(
      segmentTexts(call('mysql_describe_table', { table_name: 'users' })),
    ).toEqual(['users']);
  });

  it('计算器与图表只有主文案', () => {
    expect(buildToolHeader(call('calculator', { expression: '1+1' }))).toEqual({
      note: '计算器',
      segments: [],
    });
    expect(buildToolHeader(call('chart', { type: 'bar' }))).toEqual({
      note: '生成图表',
      segments: [],
    });
  });
});

describe('记忆与提问的头部', () => {
  it('更新记忆展示内容预览，按 Unicode 切分不截断代理对', () => {
    const content = '🙂'.repeat(70);
    const [text] = segmentTexts(call('remember_memory', { content }));

    // 60 个字符 + 省略号
    expect(Array.from(text)).toHaveLength(61);
    // 不含落单的代理项（参照用 String.slice 会截出半个字符）
    expect(text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('提问优先取结果里第一条问题的题干', () => {
    const toolCall = call(
      'ask_user_question',
      {},
      {
        tool_call_result: {
          content: JSON.stringify({ questions: [{ question: '要继续吗' }] }),
        },
      },
    );

    expect(segmentTexts(toolCall)).toEqual(['要继续吗']);
  });

  it('结果里没有问题题干时退到参数', () => {
    expect(
      segmentTexts(call('ask_user_question', { question: '选哪个' })),
    ).toEqual(['选哪个']);
  });
});

describe('知识库类工具的头部', () => {
  it('搜索知识库：知识库名取参数，带上查询词与结果摘要', () => {
    // 调用状态是 success，结果为空，因此摘要为「未找到结果」
    expect(
      segmentTexts(
        call('query_kb', { kb_name: '产品文档', query_text: '退款' }),
      ),
    ).toEqual(['知识库: 产品文档', '退款', '未找到结果']);
  });

  it('搜索知识库：参数没有名称时按 kb_id 交给调用方解析', () => {
    const header = buildToolHeader(call('query_kb', { kb_id: 'kb-1' }), {
      resolveKbName: (id) => (id === 'kb-1' ? '产品文档' : ''),
    });

    expect(header?.segments).toEqual([
      { text: '知识库: 产品文档' },
      { text: '未找到结果' },
    ]);
  });

  it('搜索知识库：解析不出名称时不渲染半截标签', () => {
    const header = buildToolHeader(call('query_kb', { kb_id: 'kb-1' }));

    // 只剩结果摘要；原始 kb_id 不出现在任何片段里
    expect(header?.segments.map((segment) => segment.text)).toEqual([
      '未找到结果',
    ]);
    expect(
      header?.segments.some((segment) => segment.text.includes('kb-1')),
    ).toBe(false);
  });

  it('查找知识库文档：知识库与文件两段', () => {
    const header = buildToolHeader(
      call('find_kb_document', { kb_id: 'kb-2', file_id: 'f-9' }),
      { resolveKbName: () => '运维手册' },
    );

    expect(header?.segments).toEqual([
      { text: '知识库: 运维手册' },
      { text: '文件: f-9' },
    ]);
  });

  it('打开知识库文档：line 优先于 offset', () => {
    expect(
      segmentTexts(
        call('open_kb_document', { kb_name: 'A', file_id: 'f-1', line: 12 }),
      ),
    ).toEqual(['知识库: A', '文件: f-1', 'Line 12']);
    expect(
      segmentTexts(
        call('open_kb_document', { kb_name: 'A', file_id: 'f-1', offset: 3 }),
      ),
    ).toEqual(['知识库: A', '文件: f-1', 'Offset 3']);
  });

  it('查看知识库列表：三个以内列全，超过三个折成等 N 个', () => {
    const result = (names: string[]) =>
      call(
        'list_kbs',
        {},
        {
          tool_call_result: {
            content: JSON.stringify(names.map((name) => ({ name }))),
          },
        },
      );

    expect(segmentTexts(result(['a', 'b']))).toEqual(['2个知识库：a，b']);
    expect(segmentTexts(result(['a', 'b', 'c', 'd', 'e']))).toEqual([
      '5个知识库：a，b，c 等2个',
    ]);
    expect(segmentTexts(result([]))).toEqual(['暂无知识库']);
  });

  it('获取思维导图：只展示知识库名', () => {
    expect(segmentTexts(call('get_mindmap', { kb_name: '图谱库' }))).toEqual([
      '知识库: 图谱库',
    ]);
  });
});

describe('MySQL 类工具不在主体里重复参数', () => {
  it('列出数据库表与查看表结构都隐藏参数', () => {
    expect(
      buildToolHeader(call('mysql_list_tables', { host: 'x' }))?.hideParams,
    ).toBe(true);
    expect(
      buildToolHeader(call('mysql_describe_table', { table_name: 'users' }))
        ?.hideParams,
    ).toBe(true);
  });
});
