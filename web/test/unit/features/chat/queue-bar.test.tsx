import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { QueueBar } from '@/features/chat/ui/queue-bar';

const view = {
  visible: true,
  pendingCount: 1,
  paused: false,
  pausedReason: null,
  canContinue: false,
};

const rowContext = {
  isStreaming: true,
  activeRunSteerable: true,
  hasPendingSteer: false,
  queueStatus: 'running',
};

const request = {
  request_id: 'req-1',
  status: 'queued',
  queue_policy: 'enqueue',
  source: 'chat',
  content: '第二条问题',
  queue_position: 2,
};

const renderBar = (
  props: Partial<React.ComponentProps<typeof QueueBar>> = {},
) =>
  render(
    <QueueBar
      view={view}
      requests={[request]}
      rowContext={rowContext}
      waitingForUserAction={false}
      continuing={false}
      onSteer={vi.fn()}
      onCancel={vi.fn()}
      onContinue={vi.fn()}
      {...props}
    />,
  );

describe('QueueBar', () => {
  it('可见时展示位次与内容，并在可引导时给出引导与取消按钮', async () => {
    const onSteer = vi.fn();
    const onCancel = vi.fn();
    renderBar({ onSteer, onCancel });

    expect(screen.getByText(/2\. 第二条问题/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '引导' }));
    await userEvent.click(
      screen.getByRole('button', { name: '删除排队请求：第二条问题' }),
    );

    expect(onSteer).toHaveBeenCalledWith('req-1');
    expect(onCancel).toHaveBeenCalledWith('req-1');
  });

  it('不可见时什么都不渲染', () => {
    const { container } = renderBar({ view: { ...view, visible: false } });

    expect(container.textContent).toBe('');
  });

  it('引导请求显示「引导 · 下一条执行」且不提供引导按钮', () => {
    renderBar({
      requests: [{ ...request, queue_policy: 'steer' }],
      rowContext: { ...rowContext, hasPendingSteer: true },
    });

    expect(screen.getByText('引导 · 下一条执行')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '引导' })).toBeNull();
  });

  it('等待用户回答或审批时给出说明，且不阻塞队列展示', () => {
    renderBar({ waitingForUserAction: true });

    expect(
      screen.getByText(
        '当前任务正在等待回答或审批，完成后将继续处理后续请求。',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/第二条问题/)).toBeTruthy();
  });

  it('暂停时展示原因，并提供继续队列按钮', async () => {
    const onContinue = vi.fn();
    renderBar({
      view: {
        ...view,
        paused: true,
        pausedReason: '上一次运行失败',
        canContinue: true,
      },
      onContinue,
    });

    expect(screen.getByText(/已暂停：上一次运行失败/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '继续队列' }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('内容缺失时用兜底文案，不向用户展示 request_id', () => {
    renderBar({ requests: [{ ...request, content: null }] });

    expect(screen.getByText(/排队请求/)).toBeTruthy();
    expect(screen.queryByText(/req-1/)).toBeNull();
  });
});
