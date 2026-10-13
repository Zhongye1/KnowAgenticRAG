import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ChatModelGroup } from '@/features/chat/api/model-api';
import { ModelSelector } from '@/features/chat/ui/model-selector';

const groups: ChatModelGroup[] = [
  {
    providerId: 'siliconflow-cn',
    providerName: 'SiliconFlow',
    models: [
      { spec: 'siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5', label: 'MiniMax M2.5' },
      { spec: 'siliconflow-cn:qwen-max', label: 'Qwen Max' },
    ],
  },
];

const setup = (
  overrides: Partial<React.ComponentProps<typeof ModelSelector>> = {},
) => {
  const props = {
    groups,
    selected: '',
    placeholder: '选择模型',
    onSelect: vi.fn(),
    ...overrides,
  };

  render(<ModelSelector {...props} />);

  return props;
};

describe('ModelSelector', () => {
  it('触发按钮显示模型名的最后一段，悬浮说明是完整 spec', () => {
    setup({ selected: 'siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5' });

    const trigger = screen.getByRole('button', { name: '选择模型' });
    expect(trigger.textContent).toContain('MiniMax-M2.5');
    expect(trigger.getAttribute('title')).toBe(
      'siliconflow-cn:Pro/MiniMaxAI/MiniMax-M2.5',
    );
  });

  it('没有选择时显示占位文案', () => {
    setup();

    expect(screen.getByRole('button', { name: '选择模型' }).textContent).toContain(
      '选择模型',
    );
  });

  it('加载中显示「加载中...」并禁止展开', () => {
    setup({ loading: true });

    const trigger = screen.getByRole('button', { name: '选择模型' });
    expect(trigger.textContent).toContain('加载中...');
    // 列表还没回来时展开只会看到「默认」一条，点它等于清空选择
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
  });

  it('展开后按供应商分组列出模型，选中项打勾', async () => {
    setup({ selected: 'siliconflow-cn:qwen-max' });
    await userEvent.click(screen.getByRole('button', { name: '选择模型' }));

    expect(await screen.findByText('SiliconFlow')).toBeTruthy();
    // 只认打勾图标本身：触发器里也有 svg，用「有没有 svg」判断会假通过
    const selectedItem = screen.getByRole('menuitem', { name: /Qwen Max/ });
    expect(selectedItem.querySelector('svg.lucide-check')).toBeTruthy();
    expect(
      screen
        .getByRole('menuitem', { name: /MiniMax M2\.5/ })
        .querySelector('svg.lucide-check'),
    ).toBeNull();
  });

  it('点一个模型把 spec 交回调用方', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: '选择模型' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Qwen Max/ }));

    expect(props.onSelect).toHaveBeenCalledWith('siliconflow-cn:qwen-max');
  });

  it('点「默认」交回空串，用来清空选择', async () => {
    const props = setup({ selected: 'siliconflow-cn:qwen-max' });
    await userEvent.click(screen.getByRole('button', { name: '选择模型' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /默认/ }));

    expect(props.onSelect).toHaveBeenCalledWith('');
  });
});
