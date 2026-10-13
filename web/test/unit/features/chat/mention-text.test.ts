import { describe, expect, it } from 'vitest';

import { formatMentionToken } from '@/features/chat/lib/mention-token';
import {
  buildMentionDisplayLabels,
  expandMentionDeletionRange,
  findActiveMentionQuery,
  getMentionDisplayLabel,
  parseMentionText,
  replaceRawRange,
} from '@/features/chat/lib/mention-text';

describe('formatMentionToken', () => {
  it('普通值不加引号', () => {
    expect(formatMentionToken('file', 'a.md')).toBe('@file:a.md');
  });

  it('含空白或引号反斜杠时加引号并转义', () => {
    expect(formatMentionToken('file', '我的 文件.md')).toBe(
      '@file:"我的 文件.md"',
    );
    expect(formatMentionToken('file', 'a"b')).toBe('@file:"a\\"b"');
    expect(formatMentionToken('file', 'a\\b')).toBe('@file:"a\\\\b"');
  });

  it('未登记的类型原样当前缀', () => {
    expect(formatMentionToken('weird', 'x')).toBe('@weird:x');
  });
});

describe('parseMentionText', () => {
  it('纯文本切成一段', () => {
    expect(parseMentionText('你好')).toEqual([
      { kind: 'text', text: '你好', start: 0, end: 2 },
    ]);
  });

  it('识别令牌并给出类型与值', () => {
    expect(parseMentionText('@file:a.md')).toEqual([
      {
        kind: 'mention',
        raw: '@file:a.md',
        type: 'file',
        value: 'a.md',
        start: 0,
        end: 10,
      },
    ]);
  });

  it('带引号的令牌去转义', () => {
    const [segment] = parseMentionText('@file:"我的 文件.md"');

    expect(segment).toMatchObject({
      kind: 'mention',
      type: 'file',
      value: '我的 文件.md',
    });
  });

  it('令牌前后的文本各自成段', () => {
    const segments = parseMentionText('看 @file:a.md 这个');

    expect(segments.map((segment) => segment.kind)).toEqual([
      'text',
      'mention',
      'text',
    ]);
    expect(segments[0]).toMatchObject({ text: '看 ' });
    expect(segments[2]).toMatchObject({ text: ' 这个' });
  });

  it('未登记的类型不算令牌', () => {
    expect(parseMentionText('@weird:x').map((s) => s.kind)).toEqual(['text']);
  });

  it('空文本返回空数组', () => {
    expect(parseMentionText('')).toEqual([]);
    expect(parseMentionText(null)).toEqual([]);
  });
});

describe('buildMentionDisplayLabels 与 getMentionDisplayLabel', () => {
  it('每个候选项的多个标识都登记到同一个展示名', () => {
    const labels = buildMentionDisplayLabels({
      knowledgeBases: [{ kb_id: 'kb-1', name: '产品文档' }],
      skills: [{ slug: 's-1', name: '检索技能' }],
    });

    expect(labels['knowledge:kb-1']).toBe('产品文档');
    expect(labels['knowledge:产品文档']).toBe('产品文档');
    expect(labels['skill:s-1']).toBe('检索技能');
  });

  it('查不到映射时，文件类型退到路径最后一段', () => {
    expect(getMentionDisplayLabel('file', '/a/b/c.md', {})).toBe('c.md');
    expect(getMentionDisplayLabel('file', '/a/b/', {})).toBe('b');
    expect(getMentionDisplayLabel('file', '', {})).toBe('文件');
  });

  it('查不到映射且不是文件时用值本身，空值用类型名', () => {
    expect(getMentionDisplayLabel('skill', 's-1', {})).toBe('s-1');
    expect(getMentionDisplayLabel('skill', '', {})).toBe('skill');
  });
});

describe('findActiveMentionQuery', () => {
  it('光标前的 @ 查询被识别', () => {
    expect(findActiveMentionQuery('@报表', 3)).toEqual({
      start: 0,
      end: 3,
      query: '报表',
    });
  });

  it('光标落在已有令牌内部时不算查询', () => {
    expect(findActiveMentionQuery('@file:a.md', 5)).toBeNull();
  });

  it('以最后一个 @ 为起点，冒号或空白时不算', () => {
    // 参照用 lastIndexOf，因此第二个 @ 会成为查询起点
    expect(findActiveMentionQuery('@a@b', 4)).toEqual({
      start: 2,
      end: 4,
      query: 'b',
    });
    expect(findActiveMentionQuery('@a:b', 4)).toBeNull();
    expect(findActiveMentionQuery('@a b', 4)).toBeNull();
  });

  it('没有 @ 时返回 null，越界光标被夹住', () => {
    expect(findActiveMentionQuery('你好', 2)).toBeNull();
    expect(findActiveMentionQuery('@a', 99)).toEqual({
      start: 0,
      end: 2,
      query: 'a',
    });
  });
});

describe('replaceRawRange', () => {
  it('替换区间，越界被夹到文本范围内', () => {
    expect(replaceRawRange('abcdef', 1, 3, 'X')).toBe('aXdef');
    expect(replaceRawRange('abc', -5, 99, 'X')).toBe('X');
    expect(replaceRawRange('abc', 2, 1, 'X')).toBe('abXc');
  });
});

describe('expandMentionDeletionRange', () => {
  const text = '看 @file:a.md 这个';

  it('退格落在令牌右边界时吃掉整个令牌', () => {
    expect(expandMentionDeletionRange(text, 12, 12, 'backward')).toEqual({
      start: 2,
      end: 12,
    });
  });

  it('已知区间命中时优先用它', () => {
    expect(
      expandMentionDeletionRange(text, 12, 12, 'backward', [
        { start: 0, end: 12 },
      ]),
    ).toEqual({ start: 0, end: 12 });
  });

  it('选区与令牌相交时扩到覆盖整个令牌', () => {
    expect(expandMentionDeletionRange(text, 5, 7, 'backward')).toEqual({
      start: 2,
      end: 12,
    });
  });

  it('选区不涉及令牌时返回 null', () => {
    expect(expandMentionDeletionRange(text, 0, 1, 'backward')).toBeNull();
  });

  it('向后删除时把紧跟的空格一起吃掉', () => {
    expect(expandMentionDeletionRange(text, 2, 2, 'forward')).toEqual({
      start: 2,
      end: 13,
    });
  });

  it('没有令牌时返回 null', () => {
    expect(expandMentionDeletionRange('普通文本', 1, 1, 'backward')).toBeNull();
    expect(expandMentionDeletionRange('普通文本', 1, 1, 'forward')).toBeNull();
  });
});
