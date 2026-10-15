import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FilterGroup } from '@/shared/ui/filter-group';

const OPTIONS = [
  { value: 'all' as const, label: '全部' },
  { value: 'milvus' as const, label: 'ARS' },
  { value: 'dify' as const, label: 'Dify' },
];

describe('FilterGroup', () => {
  it('选中项带 aria-pressed=true，其余为 false', () => {
    render(
      <FilterGroup
        label="按类型筛选知识库"
        value="milvus"
        options={OPTIONS}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'ARS' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: '全部' }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: 'Dify' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('筛选语义用 aria-pressed，不用导航的 aria-current', () => {
    render(
      <FilterGroup
        label="按类型筛选知识库"
        value="all"
        options={OPTIONS}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(
      screen.getByRole('button', { name: '全部' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('容器用 role=group 承载无障碍名', () => {
    render(
      <FilterGroup
        label="按类型筛选知识库"
        value="all"
        options={OPTIONS}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('group', { name: '按类型筛选知识库' }),
    ).toBeTruthy();
  });

  it('点击非选中项回调它的值', async () => {
    const onChange = vi.fn();
    render(
      <FilterGroup
        label="按类型筛选知识库"
        value="all"
        options={OPTIONS}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Dify' }));

    expect(onChange).toHaveBeenCalledWith('dify');
  });

  it('每个选项都是可聚焦的按钮，键盘可达', () => {
    render(
      <FilterGroup
        label="按类型筛选知识库"
        value="all"
        options={OPTIONS}
        onChange={vi.fn()}
      />,
    );

    for (const option of OPTIONS) {
      const button = screen.getByRole('button', { name: option.label });
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
    }
  });
});
