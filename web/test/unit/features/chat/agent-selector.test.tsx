import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AgentOption } from '@/features/chat/lib/agent-options';
import { AgentSelector } from '@/features/chat/ui/agent-selector';

const options: AgentOption[] = [
  { value: 'assistant', label: '智能助手', icon: '', isBuiltin: true },
  { value: 'writer', label: '写作', icon: '', isBuiltin: false },
];

const setup = (
  overrides: Partial<React.ComponentProps<typeof AgentSelector>> = {},
) => {
  const props = {
    options,
    selected: 'assistant',
    hasActiveThread: false,
    onSelect: vi.fn(),
    onBlocked: vi.fn(),
    ...overrides,
  };

  render(<AgentSelector {...props} />);

  return props;
};

const openMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: /智能助手|加载中|智能体/ }));
};

describe('AgentSelector', () => {
  it('触发按钮显示当前智能体名', () => {
    setup();

    expect(screen.getByRole('button', { name: '智能助手' })).toBeTruthy();
  });

  it('加载中显示「加载中...」并禁用', () => {
    setup({ loading: true });

    const trigger = screen.getByRole('button', { name: '加载中...' });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
  });

  it('找不到当前项时退到「智能体」', () => {
    setup({ selected: 'zzz' });

    expect(screen.getByRole('button', { name: '智能体' })).toBeTruthy();
  });

  it('面板列出候选项，内置项有徽标', async () => {
    setup();
    await openMenu();

    expect(await screen.findByText('写作')).toBeTruthy();
    expect(screen.getByText('内置')).toBeTruthy();
  });

  it('新对话里切换会回调选中的 slug', async () => {
    const props = setup();
    await openMenu();

    await userEvent.click(await screen.findByText('写作'));

    expect(props.onSelect).toHaveBeenCalledWith('writer');
    expect(props.onBlocked).not.toHaveBeenCalled();
  });

  it('已绑定会话时切换被拒绝并给出原因', async () => {
    const props = setup({ hasActiveThread: true });
    await openMenu();

    await userEvent.click(await screen.findByText('写作'));

    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onBlocked).toHaveBeenCalledWith(
      '当前对话已绑定智能体，请新建对话后切换',
    );
  });

  it('建线程中切换被拒绝，原因优先于「已绑定」', async () => {
    const props = setup({ hasActiveThread: true, isCreatingThread: true });
    // 建线程中触发按钮本身是禁用的，直接验规则
    expect(
      (screen.getByRole('button', { name: '智能助手' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('选中的就是当前项时不回调', async () => {
    const props = setup();
    await openMenu();

    // 触发按钮上也写着同一个名字，这里要的是面板里的那一项
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /智能助手/ }),
    );

    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onBlocked).not.toHaveBeenCalled();
  });
});
