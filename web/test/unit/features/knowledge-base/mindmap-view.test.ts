/**
 * 知识导图纯逻辑：树 → Markdown、空态、增量入口与差异摘要。
 */
import { describe, expect, it } from 'vitest';

import {
  canIncrementalUpdate,
  hasMindmap,
  mindmapAddedCount,
  mindmapToMarkdown,
  summarizeMindmapDiff,
} from '@/features/knowledge-base/lib/mindmap-view';

describe('树 → Markdown', () => {
  it('层级决定标题级别，节点之间留空行', () => {
    const markdown = mindmapToMarkdown({
      content: '研发知识库',
      children: [
        {
          content: '主分类1',
          children: [{ content: '子分类1.1', children: [{ content: 'a.md' }] }],
        },
        { content: '主分类2' },
      ],
    });

    expect(markdown).toBe(
      '# 研发知识库\n\n## 主分类1\n\n### 子分类1.1\n\n#### a.md\n\n## 主分类2\n\n',
    );
  });

  it('没有子节点或子节点为空数组都只输出自己', () => {
    expect(mindmapToMarkdown({ content: '只有根' })).toBe('# 只有根\n\n');
    expect(mindmapToMarkdown({ content: '只有根', children: [] })).toBe(
      '# 只有根\n\n',
    );
  });

  it('空树与缺 content 的节点返回空串（不产出空标题）', () => {
    expect(mindmapToMarkdown(null)).toBe('');
    expect(mindmapToMarkdown(undefined)).toBe('');
    expect(mindmapToMarkdown({ content: '' })).toBe('');
  });
});

describe('空态判定', () => {
  it('后端给 null 或空 content 都算没有导图', () => {
    expect(hasMindmap(null)).toBe(false);
    expect(hasMindmap(undefined)).toBe(false);
    expect(hasMindmap({ content: '' })).toBe(false);
    expect(hasMindmap({ content: '研发知识库' })).toBe(true);
  });
});

describe('增量入口与差异摘要', () => {
  const diff = (extra: Record<string, unknown> = {}) => ({
    has_mindmap: true,
    tracked_files: [],
    current_files: [],
    added_files: [],
    removed_file_ids: [],
    unchanged_count: 0,
    needs_update: false,
    ...extra,
  });

  it('只有 needs_update 为真才给增量入口', () => {
    expect(canIncrementalUpdate(diff())).toBe(false);
    expect(canIncrementalUpdate(diff({ needs_update: true }))).toBe(true);
    expect(canIncrementalUpdate(null)).toBe(false);
  });

  it('角标是新增文件数，没有差异时为 0', () => {
    expect(mindmapAddedCount(diff())).toBe(0);
    expect(
      mindmapAddedCount(
        diff({
          added_files: [
            { file_id: 'f-1', filename: 'a.md' },
            { file_id: 'f-2', filename: 'b.md' },
          ],
        }),
      ),
    ).toBe(2);
  });

  it('摘要把新增与移除都说清楚；不需要更新时不显示', () => {
    expect(
      summarizeMindmapDiff(
        diff({
          needs_update: true,
          added_files: [{ file_id: 'f-1', filename: 'a.md' }],
          removed_file_ids: ['f-9'],
        }),
      ),
    ).toBe('新增 1 个文件，移除 1 个文件');
    expect(
      summarizeMindmapDiff(
        diff({ needs_update: true, removed_file_ids: ['f-9'] }),
      ),
    ).toBe('移除 1 个文件');
    expect(summarizeMindmapDiff(diff())).toBeNull();
  });

  it('只删不增时摘要不带「新增 0 个」', () => {
    expect(
      summarizeMindmapDiff(
        diff({ needs_update: true, removed_file_ids: ['a', 'b'] }),
      ),
    ).toBe('移除 2 个文件');
  });
});
