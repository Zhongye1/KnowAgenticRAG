import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TokenUsage } from '@/features/chat/lib/token-usage';
import { ContextUsageRing } from '@/features/chat/ui/context-usage-ring';

/** 用已用 / 上限构造用量；`llm_input_tokens` 是总量，`summary_trigger_tokens` 是上限。 */
const usage = (used: number, limit: number): TokenUsage => ({
  llm_input_tokens: used,
  summary_trigger_tokens: limit,
});

const ring = () => screen.getByRole('button', { name: '上下文使用情况' });
const progressArc = (container: HTMLElement) =>
  container.querySelectorAll('circle')[1] ?? null;

/** 悬浮说明由 antd Tooltip 渲染，需要真的悬停才会出现。 */
const hoverTooltipText = async (): Promise<string> => {
  await userEvent.hover(ring());
  return (await screen.findByRole('tooltip')).textContent ?? '';
};

describe('ContextUsageRing', () => {
  it('按比例画进度弧', () => {
    const { container } = render(<ContextUsageRing usage={usage(500, 1000)} />);

    const arc = progressArc(container);
    expect(arc).not.toBeNull();
    // 周长 2πr ≈ 37.7，一半占比时偏移也是周长的一半
    expect(Number(arc!.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      2 * Math.PI * 6 * 0.5,
      3,
    );
  });

  it('上限未知时只画底环，不画进度弧', () => {
    const { container } = render(
      <ContextUsageRing usage={{ llm_input_tokens: 500 }} />,
    );

    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(progressArc(container)).toBeNull();
  });

  it('用量为 0 时也不画进度弧', () => {
    const { container } = render(<ContextUsageRing usage={usage(0, 1000)} />);

    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });

  it('没有用量时按未知处理，且不弹说明', async () => {
    const { container } = render(<ContextUsageRing usage={null} />);

    expect(container.querySelectorAll('circle')).toHaveLength(1);
    await userEvent.hover(ring());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('档位按 75% 与 90% 分界', () => {
    const toneOf = (used: number) => {
      const { container, unmount } = render(
        <ContextUsageRing usage={usage(used, 1000)} />,
      );
      const className = container.querySelector('button')!.className;
      unmount();

      return className;
    };

    expect(toneOf(700)).toContain('text-[var(--main-color)]');
    expect(toneOf(750)).toContain('text-[var(--color-warning-500)]');
    expect(toneOf(900)).toContain('text-[var(--color-error-500)]');
  });

  it('说明给出占比与已用 / 上限', async () => {
    render(<ContextUsageRing usage={usage(900, 1000)} />);

    expect(await hoverTooltipText()).toBe('90% · 900 / 1000 上下文已使用');
  });

  it('上限未知时说明只报已用', async () => {
    render(<ContextUsageRing usage={{ llm_input_tokens: 500 }} />);

    expect(await hoverTooltipText()).toBe('500 上下文已使用');
  });

  it('点击回调，禁用时不回调', async () => {
    const onClick = vi.fn();
    const { unmount } = render(
      <ContextUsageRing usage={usage(500, 1000)} onClick={onClick} />,
    );

    await userEvent.click(ring());
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();

    const disabledClick = vi.fn();
    render(
      <ContextUsageRing
        usage={usage(500, 1000)}
        disabled
        onClick={disabledClick}
      />,
    );
    await userEvent.click(ring());
    expect(disabledClick).not.toHaveBeenCalled();
  });
});
