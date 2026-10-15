import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PageHeader, PageHeaderTabs } from '@/shared/ui/page-header';

describe('PageHeader', () => {
  it('渲染标题，动作区在时渲染，不在时不渲染占位容器', () => {
    const { rerender } = render(
      <PageHeader title="智能体管理" actions={<span>4 个智能体</span>} />,
    );

    expect(screen.getByRole('heading', { name: '智能体管理' })).toBeTruthy();
    expect(screen.getByText('4 个智能体')).toBeTruthy();

    rerender(<PageHeader title="智能体管理" />);
    expect(screen.queryByText('4 个智能体')).toBeNull();
  });

  it('children 进标题右侧插槽', () => {
    render(
      <PageHeader title="智能体管理">
        <nav aria-label="插槽" />
      </PageHeader>,
    );

    expect(screen.getByRole('navigation', { name: '插槽' })).toBeTruthy();
  });
});

describe('PageHeaderTabs', () => {
  const TABS = [
    { key: 'a' as const, label: '甲' },
    { key: 'b' as const, label: '乙' },
  ];

  it('当前项带 aria-current=page，其余不带', () => {
    render(
      <PageHeaderTabs
        tabs={TABS}
        current="b"
        ariaLabel="视图切换"
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: '甲' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: '乙' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('点击项回调它的 key，容器带 aria-label', async () => {
    const onChange = vi.fn();
    render(
      <PageHeaderTabs
        tabs={TABS}
        current="a"
        ariaLabel="视图切换"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('navigation', { name: '视图切换' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '乙' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
