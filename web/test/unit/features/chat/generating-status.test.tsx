import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { GeneratingStatus } from '@/features/chat/ui/generating-status';

describe('GeneratingStatus', () => {
  it('渲染文案并作为状态区可被读屏感知', () => {
    render(<GeneratingStatus text="正在生成回复..." elapsedSeconds={0} />);
    expect(screen.getByText('正在生成回复...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('耗时为 0 时不显示，超过 0 显示', () => {
    const { rerender } = render(
      <GeneratingStatus text="正在生成回复..." elapsedSeconds={0} />,
    );
    expect(screen.queryByText('45s')).not.toBeInTheDocument();
    rerender(<GeneratingStatus text="正在生成回复..." elapsedSeconds={45} />);
    expect(screen.getByText('45s')).toBeInTheDocument();
  });

  it('超过一分钟按分秒显示', () => {
    render(<GeneratingStatus text="正在生成回复..." elapsedSeconds={125} />);
    expect(screen.getByText('2分5s')).toBeInTheDocument();
  });
});
