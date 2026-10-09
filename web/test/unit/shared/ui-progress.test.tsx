/**
 * 进度条：数值夹取、无障碍属性与文案。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Progress } from '@/shared/ui/progress';

describe('进度条', () => {
  it('把数值夹到 0..100 并四舍五入', () => {
    const { rerender } = render(<Progress value={42.6} label="进度" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '43',
    );

    rerender(<Progress value={-5} label="进度" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    );

    rerender(<Progress value={420} label="进度" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
  });

  it('没有值时按 0 处理，不显示 NaN', () => {
    render(<Progress value={null} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-label',
      '进度',
    );
  });

  it('给了文案就渲染出来，并作为无障碍名', () => {
    render(<Progress value={10} label="图谱构建进度" />);

    expect(screen.getByText('图谱构建进度')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: '图谱构建进度' }),
    ).toBeTruthy();
  });
});
