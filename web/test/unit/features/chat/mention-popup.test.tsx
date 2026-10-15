import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { groupMentionItems } from '@/features/chat/lib/mention-query';
import type { MentionResourceItem } from '@/features/chat/lib/mention-resources';
import { MentionPopup } from '@/features/chat/ui/mention-popup';

const item = (
  type: MentionResourceItem['type'],
  label: string,
  extra: Partial<MentionResourceItem> = {},
): MentionResourceItem => ({
  value: label,
  label,
  type,
  tokenLabel: `@${type}:${label}`,
  description: '',
  ...extra,
});

const renderPopup = (
  items: MentionResourceItem[],
  overrides: Partial<React.ComponentProps<typeof MentionPopup>> = {},
) =>
  render(
    <MentionPopup
      groups={groupMentionItems(items)}
      activeIndex={0}
      query="a"
      onSelect={vi.fn()}
      onHoverIndex={vi.fn()}
      {...overrides}
    />,
  );

describe('MentionPopup', () => {
  it('按分组标题展示候选项', () => {
    renderPopup([
      item('file', 'a.md'),
      item('knowledge', '产品文档'),
      item('skill', '检索'),
    ]);

    expect(screen.getByText('文件')).toBeTruthy();
    expect(screen.getByText('知识库')).toBeTruthy();
    expect(screen.getByText('Skills')).toBeTruthy();
    // 文件行的名字被高亮 mark 与路径列拆开，用宽松匹配
    expect(screen.getByRole('option', { name: /a\s*\.?md/ })).toBeTruthy();
  });

  it('空分组不渲染标题', () => {
    renderPopup([item('skill', '检索')]);

    expect(screen.queryByText('文件')).toBeNull();
    expect(screen.queryByText('知识库')).toBeNull();
    expect(screen.queryByText('MCP')).toBeNull();
    expect(screen.queryByText('Subagents')).toBeNull();
  });

  it('活动项标为选中', () => {
    renderPopup([item('skill', '甲'), item('skill', '乙')], { activeIndex: 1 });

    const options = screen.getAllByRole('option');
    expect(options[0]!.getAttribute('aria-selected')).toBe('false');
    expect(options[1]!.getAttribute('aria-selected')).toBe('true');
  });

  it('点击候选项回调选中项', async () => {
    const onSelect = vi.fn();
    renderPopup([item('skill', '检索')], { onSelect });

    await userEvent.click(screen.getByRole('option', { name: /检索/ }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ label: '检索', type: 'skill' }),
    );
  });

  it('悬停回调整体下标', async () => {
    const onHoverIndex = vi.fn();
    renderPopup([item('skill', '甲'), item('skill', '乙')], { onHoverIndex });

    await userEvent.hover(screen.getAllByRole('option')[1]!);

    expect(onHoverIndex).toHaveBeenCalledWith(1);
  });

  it('文件组在空查询下只给搜索提示', () => {
    // 调用方（buildMentionGroups）在空查询下本就不会给文件项，这里按同一契约传空组
    renderPopup([], { query: '' });

    expect(screen.getByText('输入相关内容以搜索文件')).toBeTruthy();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});
