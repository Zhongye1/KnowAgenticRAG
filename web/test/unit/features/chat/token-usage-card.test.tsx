import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TokenUsageCard } from '@/features/chat/ui/token-usage-card';

const usage = {
  llm_input_tokens: 2048,
  system_tokens: 512,
  tools_tokens: 256,
  tool_count: 3,
  llm_messages_tokens: 1024,
  llm_content_message_tokens: 1024,
  llm_content_message_count: 4,
  llm_message_count: 4,
  summary_active: false,
  summary_message_tokens: 0,
  context_window: 8192,
  summary_trigger_tokens: 4096,
  thread: {
    total: { total_tokens: 12345 },
    models: {
      bucket: {
        model_call_count: 3,
        cache_observed_call_count: 0,
        cache_read_input_tokens: 0,
        model: { configured_model_spec: 'gpt-4o' },
        usage: { input_tokens: 2048, output_tokens: 512 },
      },
    },
  },
};

describe('上下文用量卡片', () => {
  it('没有用量快照时整段不渲染', () => {
    render(<TokenUsageCard usage={null} />);

    expect(screen.queryByTestId('token-usage')).toBeNull();
  });

  it('展示占比、已用上限与对话累计', () => {
    render(<TokenUsageCard usage={usage} />);

    const card = screen.getByTestId('token-usage');
    expect(card.textContent).toContain('上下文占用 50%');
    expect(card.textContent).toContain('2K / 4K');
    expect(card.textContent).toContain('12.1K');
  });

  it('进度条带上占比与无障碍文案，未知上限时停在 0 不做不确定态动画', () => {
    const { unmount } = render(<TokenUsageCard usage={usage} />);
    const progress = screen.getByTestId('token-usage-progress');
    expect(progress.getAttribute('value')).toBe('50');
    expect(progress.getAttribute('aria-valuetext')).toBe('上下文占用 50%');
    unmount();

    render(<TokenUsageCard usage={{ llm_input_tokens: 1000 }} />);
    const unknown = screen.getByTestId('token-usage-progress');
    expect(unknown.getAttribute('value')).toBe('0');
    expect(unknown.getAttribute('aria-valuetext')).toBe(
      '上下文上限未知，当前估算 1000',
    );
  });

  it('高风险占比用危险色', () => {
    render(
      <TokenUsageCard
        usage={{ llm_input_tokens: 950, summary_trigger_tokens: 1000 }}
      />,
    );

    expect(
      screen.getByTestId('token-usage-progress').className,
    ).toContain('accent-danger-6');
  });

  it('默认收起明细，展开后显示构成分段与模型统计', async () => {
    render(<TokenUsageCard usage={usage} />);

    expect(screen.queryByText('系统提示')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /上下文占用/ }));

    expect(screen.getByText('系统提示')).toBeTruthy();
    expect(screen.getByText('工具定义 (3)')).toBeTruthy();
    // 构成条用相对上限的堆叠分段，不含被压缩部分
    expect(screen.getByRole('button', { name: /上下文占用/ }).getAttribute('aria-controls')).toBe(
      'token-usage-details',
    );
    expect(screen.queryByText(/已压缩/)).toBeNull();
    expect(screen.getByText('gpt-4o')).toBeTruthy();
    expect(screen.getByText('3 次调用')).toBeTruthy();
    expect(screen.getByText('2K / 512')).toBeTruthy();
  });

  it('展开后没有可展示明细时给出说明', async () => {
    render(<TokenUsageCard usage={{ llm_input_tokens: 0 }} />);

    await userEvent.click(screen.getByRole('button', { name: /上下文占用/ }));

    expect(screen.getByText('本次运行没有可展示的用量明细。')).toBeTruthy();
  });
});
