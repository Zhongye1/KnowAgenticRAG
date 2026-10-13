import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PanelSection } from '@/features/chat/lib/panel-sections';
import { AgentPanel } from '@/features/chat/ui/agent-panel';

const sections: PanelSection[] = [
  { key: 'file-tree', type: 'file-tree', title: '文件' },
  { key: 'message-debug', type: 'message-debug', title: '调试' },
];

const setup = (
  overrides: Partial<React.ComponentProps<typeof AgentPanel>> = {},
) => {
  const props = {
    sections,
    activeSectionKey: 'file-tree',
    width: 480,
    onActivateSection: vi.fn(),
    onCloseSection: vi.fn(),
    onToggleMaximize: vi.fn(),
    onClose: vi.fn(),
    onResize: vi.fn(),
    ...overrides,
  };

  render(<AgentPanel {...props}>内容</AgentPanel>);

  return props;
};

describe('AgentPanel', () => {
  it('渲染分区标签并标记当前分区', () => {
    setup();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['文件', '调试']);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false');
  });

  it('点击标签回调激活', async () => {
    const props = setup();

    await userEvent.click(screen.getByRole('tab', { name: '调试' }));

    expect(props.onActivateSection).toHaveBeenCalledWith('message-debug');
  });

  it('文件树不给关闭入口，其余分区可以关闭', async () => {
    const props = setup();

    expect(screen.queryByRole('button', { name: '关闭 文件' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '关闭 调试' }));

    expect(props.onCloseSection).toHaveBeenCalledWith('message-debug');
  });

  it('最大化与隐藏各有回调，标题随状态变', async () => {
    const props = setup();

    await userEvent.click(screen.getByRole('button', { name: '最大化面板' }));
    expect(props.onToggleMaximize).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '隐藏侧边栏' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('最大化时不渲染拖拽把手', () => {
    setup({ maximized: true });

    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByRole('button', { name: '还原面板' })).toBeTruthy();
  });

  it('丢掉缺字段的分区', () => {
    setup({
      sections: [
        { key: '', type: 'file-tree', title: 'x' } as unknown as PanelSection,
        ...sections,
      ],
    });

    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });
});
