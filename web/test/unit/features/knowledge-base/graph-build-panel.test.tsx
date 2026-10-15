/**
 * 索引管理面板：状态、进度、统计格的可点性、按钮分支与禁用条件。
 * 判定规则的正确答案在 `lib/graph-build.test.ts`，这里验的是「面板有没有照它渲染」。
 */
import { render, screen } from '@testing-library/react';

// antd 词汇由应用装配承载，测试同构挂上
import { AntdProvider } from '@/app/theme/antd-provider';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动 Radix 弹窗，全套件并行跑时会超过默认 5 秒预算；
 * 这里给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

import type { GraphBuildStatus } from '@/features/knowledge-base/api/graph-api';

const { GraphBuildPanel } =
  await import('@/features/knowledge-base/ui/graph/graph-build-panel');

const status = (extra: Partial<GraphBuildStatus> = {}): GraphBuildStatus => ({
  kb_id: 'kb-1',
  kb_type: 'milvus',
  configured: true,
  locked: true,
  config: null,
  total_chunks: 10,
  pending_chunks: 4,
  indexed_chunks: 6,
  structured_chunks: 5,
  extraction_counts: { pending: 0, succeeded: 6, failed: 0 },
  vector_counts: { pending: 1, processing: 2, indexed: 3, failed: 0 },
  entity_count: 12,
  relationship_count: 7,
  build_task_status: null,
  build_task_progress: 0,
  ...extra,
});

const renderPanel = (
  props: Partial<React.ComponentProps<typeof GraphBuildPanel>> = {},
) => {
  const handlers = {
    onRefresh: vi.fn(),
    onConfigure: vi.fn(),
    onIndex: vi.fn(),
    onRetryVectors: vi.fn(),
    onReset: vi.fn(),
    onOpenFailedChunks: vi.fn(),
  };
  render(
    <AntdProvider>
      <GraphBuildPanel status={status()} {...handlers} {...props} />
    </AntdProvider>,
  );
  return handlers;
};

describe('图谱索引管理面板', () => {
  it('渲染状态、九个统计格与开始索引', () => {
    renderPanel();

    expect(screen.getByText('索引管理')).toBeTruthy();
    expect(screen.getByTestId('graph-build-state').textContent).toBe('已配置');
    expect(
      screen.getByText('总 Chunk').previousElementSibling?.textContent,
    ).toBe('10');
    // 向量待处理 = pending + processing
    expect(
      screen.getByText('向量待处理').previousElementSibling?.textContent,
    ).toBe('3');
    expect(screen.getByRole('button', { name: /开始索引/ })).toBeEnabled();
    // 没有状态时进度条不存在
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('没有状态时统计格显示 - 而不是空白', () => {
    renderPanel({ status: undefined });

    expect(
      screen.getByText('总 Chunk').previousElementSibling?.textContent,
    ).toBe('-');
    expect(screen.getByTestId('graph-build-state').textContent).toBe('未配置');
    expect(screen.getByRole('button', { name: /配置抽取器/ })).toBeEnabled();
  });

  it('构建中显示进度条与百分比，主按钮点不动', () => {
    const handlers = renderPanel({
      status: status({
        build_task_status: 'running',
        build_task_progress: 42.6,
      }),
    });

    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '43',
    );
    expect(screen.getByRole('button', { name: /构建中 43%/ })).toBeDisabled();
    expect(handlers.onIndex).not.toHaveBeenCalled();
  });

  it('未锁定配置时点主按钮开配置弹窗', async () => {
    const handlers = renderPanel({ status: status({ locked: false }) });

    await userEvent.click(screen.getByRole('button', { name: /配置抽取器/ }));

    expect(handlers.onConfigure).toHaveBeenCalledTimes(1);
    expect(handlers.onIndex).not.toHaveBeenCalled();
  });

  it('有失败向量时点主按钮重试向量', async () => {
    const handlers = renderPanel({
      status: status({
        build_task_status: 'failed',
        vector_counts: { pending: 0, processing: 0, indexed: 1, failed: 2 },
      }),
    });

    await userEvent.click(screen.getByRole('button', { name: /重试失败向量/ }));

    expect(handlers.onRetryVectors).toHaveBeenCalledTimes(1);
  });

  it('有待构建 Chunk 为 0 时索引入口禁用', () => {
    renderPanel({ status: status({ pending_chunks: 0 }) });

    expect(screen.getByRole('button', { name: /开始索引/ })).toBeDisabled();
  });

  it('写操作在飞行中时按钮全禁用', () => {
    renderPanel({ busy: true });

    expect(screen.getByRole('button', { name: /开始索引/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '修改配置' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重置' })).toBeDisabled();
  });

  it('只有抽取失败可点开样例：向量失败没有对应的样例接口，不给错入口', async () => {
    const handlers = renderPanel({
      status: status({
        extraction_counts: { pending: 0, succeeded: 5, failed: 3 },
        vector_counts: { pending: 0, processing: 0, indexed: 1, failed: 4 },
      }),
    });

    await userEvent.click(screen.getByText('抽取失败').closest('button')!);

    expect(handlers.onOpenFailedChunks).toHaveBeenCalledTimes(1);
    expect(screen.getByText('向量失败').closest('button')).toBeNull();
  });

  it('失败数为 0 时统计格不是按钮', () => {
    renderPanel();

    expect(screen.getByText('抽取失败').closest('button')).toBeNull();
    expect(screen.getByText('向量失败').closest('button')).toBeNull();
  });

  it('已锁定且不在构建时给修改配置与重置', async () => {
    const handlers = renderPanel();

    await userEvent.click(screen.getByRole('button', { name: '修改配置' }));
    await userEvent.click(screen.getByRole('button', { name: '重置' }));

    expect(handlers.onConfigure).toHaveBeenCalledTimes(1);
    expect(handlers.onReset).toHaveBeenCalledTimes(1);
  });

  it('构建中不出现修改配置与重置', () => {
    renderPanel({ status: status({ build_task_status: 'running' }) });

    expect(screen.queryByRole('button', { name: '修改配置' })).toBeNull();
    expect(screen.queryByRole('button', { name: '重置' })).toBeNull();
  });

  it('刷新按钮在加载中禁用，点击交给调用方', async () => {
    const handlers = renderPanel();

    await userEvent.click(
      screen.getByRole('button', { name: '刷新图谱构建状态' }),
    );
    expect(handlers.onRefresh).toHaveBeenCalledTimes(1);

    renderPanel({ loading: true });
    const buttons = screen.getAllByRole('button', { name: '刷新图谱构建状态' });
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });
});
