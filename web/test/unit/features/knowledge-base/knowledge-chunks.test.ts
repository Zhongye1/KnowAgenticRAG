import { describe, expect, it } from 'vitest';

import {
  findOverlap,
  mergeChunks,
} from '@/features/knowledge-base/lib/knowledge-chunks';

const chunk = (index: number, content: string) => ({
  id: `c-${index}`,
  content,
  chunk_order_index: index,
});

describe('分块重叠查找', () => {
  it('找出尾部与头部相同的片段', () => {
    const shared = '公共的重叠片段内容在这里';
    expect(findOverlap(`前文${shared}`, `${shared}后文`)).toBe(shared);
  });

  it('重叠至少要 11 个字符才算重复（上游同）', () => {
    // 10 个字符：低于阈值
    expect(findOverlap('0123456789', '0123456789')).toBe('');
    // 11 个字符：够
    expect(findOverlap('01234567890', '01234567890')).toBe('01234567890');
  });

  it('空值返回空串', () => {
    expect(findOverlap('', 'abc')).toBe('');
    expect(findOverlap('abc', '')).toBe('');
  });
});

describe('分块合并', () => {
  it('按序号排序后合并，重叠部分只留一份', () => {
    const shared = '公共的重叠片段内容在这里';
    const result = mergeChunks([
      chunk(1, `${shared}第二段`),
      chunk(0, `第一段${shared}`),
    ]);

    expect(result.content).toBe(`第一段${shared}第二段`);
    expect(result.chunks.map((item) => item.id)).toEqual(['c-0', 'c-1']);
    expect(result.chunks[1]).toMatchObject({
      startOffset: `第一段${shared}`.length,
      endOffset: `第一段${shared}第二段`.length,
    });
  });

  it('没有重叠的分块之间补换行', () => {
    const result = mergeChunks([chunk(0, '第一段'), chunk(1, '第二段')]);

    expect(result.content).toBe('第一段\n第二段');
    expect(result.chunks).toHaveLength(2);
  });

  it('被前面完全覆盖的分块不再列出', () => {
    const result = mergeChunks([
      chunk(0, 'hello world this is the first chunk'),
      chunk(1, 'first chunk'),
    ]);

    expect(result.content).toBe('hello world this is the first chunk');
    expect(result.chunks.map((item) => item.id)).toEqual(['c-0']);
  });

  it('空列表给出空结果', () => {
    expect(mergeChunks([])).toEqual({ content: '', chunks: [] });
    expect(mergeChunks(null)).toEqual({ content: '', chunks: [] });
  });
});
