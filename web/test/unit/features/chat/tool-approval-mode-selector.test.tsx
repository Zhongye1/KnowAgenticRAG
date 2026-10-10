import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ToolApprovalModeSelector } from '@/features/chat/ui/tool-approval-mode-selector';

describe('工具审批模式选择器', () => {
  it('触发器显示当前模式', () => {
    render(
      <ToolApprovalModeSelector value="always_trust" onChange={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: '完全信任' })).toBeTruthy();
  });

  it('展开后两个选项互斥，当前项被标记为选中', async () => {
    render(
      <ToolApprovalModeSelector value="always_trust" onChange={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: '完全信任' }));

    const options = await screen.findAllByRole('menuitemradio');
    expect(options.map((option) => option.textContent)).toEqual([
      '请求审批',
      '完全信任',
    ]);
    expect(
      screen
        .getByRole('menuitemradio', { name: '完全信任' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen
        .getByRole('menuitemradio', { name: '请求审批' })
        .getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('选择另一个模式后回调收到它', async () => {
    const onChange = vi.fn();
    render(<ToolApprovalModeSelector value="default" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: '请求审批' }));
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: '完全信任' }),
    );

    expect(onChange).toHaveBeenCalledWith('always_trust');
  });

  it('展开与收起都通过触发器报告状态', async () => {
    render(<ToolApprovalModeSelector value="default" onChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: '请求审批' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(trigger);
    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
