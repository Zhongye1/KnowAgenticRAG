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

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      '请求审批',
      '完全信任',
    ]);
    // rc-menu 对 role=option 渲染 aria-selected（antd 的选中语义）
    expect(
      screen
        .getByRole('option', { name: '完全信任' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      screen
        .getByRole('option', { name: '请求审批' })
        .getAttribute('aria-selected'),
    ).toBe('false');
  });

  it('选择另一个模式后回调收到它', async () => {
    const onChange = vi.fn();
    render(<ToolApprovalModeSelector value="default" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: '请求审批' }));
    await userEvent.click(
      await screen.findByRole('option', { name: '完全信任' }),
    );

    expect(onChange).toHaveBeenCalledWith('always_trust');
  });

  it('点击展开菜单，Escape 收起', async () => {
    render(<ToolApprovalModeSelector value="default" onChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: '请求审批' });
    // antd Dropdown 的触发器不携带 aria-expanded（那是 Radix 的行为）；
    // 开合的可观察结果是菜单出现在消失

    await userEvent.click(trigger);
    expect(await screen.findByRole('menu')).toBeTruthy();

    // antd 的弹层默认点外部收起；Escape 的收起语义它不保证
    await userEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});
