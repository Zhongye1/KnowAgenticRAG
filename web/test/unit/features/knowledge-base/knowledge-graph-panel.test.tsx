/**
 * 图谱分区组装：空态动作、搜索落到查询参数、详情面板、只读时的入口收窄。
 *
 * 画布与 G6 由 `graph-canvas` 自己的用例负责，这里换成替身，验的是接线与动作。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动 Radix 弹窗，全套件并行跑时会超过默认 5 秒预算；
 * 这里给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

import type { GraphBuildStatus } from '@/features/knowledge-base/api/graph-api';

const { api, notifications, canvas } = vi.hoisted(() => ({
  api: {
    subgraph: vi.fn(),
    status: vi.fn(),
    index: vi.fn(),
    configure: vi.fn(),
    reset: vi.fn(),
    reconcile: vi.fn(),
    failedChunks: vi.fn(),
  },
  notifications: { addNotification: vi.fn() },
  canvas: { onNodeClick: null as null | ((node: unknown) => void) },
}));

vi.mock('@/features/knowledge-base/api/graph-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/graph-api')
  >('@/features/knowledge-base/api/graph-api');
  return {
    ...actual,
    graphApi: {
      ...actual.graphApi,
      getSubgraph: (...args: unknown[]) => api.subgraph(...args),
      getGraphBuildStatus: (...args: unknown[]) => api.status(...args),
      indexGraphBuild: (...args: unknown[]) => api.index(...args),
      configureGraphBuild: (...args: unknown[]) => api.configure(...args),
      resetGraphBuild: (...args: unknown[]) => api.reset(...args),
      reconcileGraphBuild: (...args: unknown[]) => api.reconcile(...args),
      getGraphBuildFailedChunks: (...args: unknown[]) =>
        api.failedChunks(...args),
    },
  };
});

vi.mock('@/features/knowledge-base/ui/graph-canvas', () => ({
  GraphCanvas: ({
    view,
    onNodeClick,
  }: {
    view: { nodes: Array<{ id: string; original: unknown }> };
    onNodeClick: (node: unknown) => void;
  }) => {
    canvas.onNodeClick = onNodeClick;
    return <div data-testid="graph-canvas-stub">{view.nodes.length}</div>;
  },
}));

vi.mock('@/shared/ui/notifications', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/ui/notifications')
  >('@/shared/ui/notifications');
  return { ...actual, useNotifications: () => notifications };
});

const { KnowledgeGraphPanel } =
  await import('@/features/knowledge-base/ui/knowledge-graph-panel');

const status = (extra: Partial<GraphBuildStatus> = {}): GraphBuildStatus => ({
  kb_id: 'kb-1',
  kb_type: 'milvus',
  configured: false,
  locked: false,
  config: null,
  total_chunks: 10,
  pending_chunks: 4,
  indexed_chunks: 0,
  structured_chunks: 0,
  extraction_counts: { pending: 0, succeeded: 0, failed: 0 },
  vector_counts: { pending: 0, processing: 0, indexed: 0, failed: 0 },
  entity_count: 0,
  relationship_count: 0,
  build_task_status: null,
  build_task_progress: 0,
  ...extra,
});

const node = {
  id: 'n-1',
  name: '张三',
  original_id: 'n-1',
  type: 'Person',
  labels: ['Person'],
  properties: { age: 30 },
  normalized: { name: '张三', type: 'Person', source: 'milvus' },
  graph_type: 'milvus',
};

const renderPanel = (readOnly = false) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeGraphPanel kbId="kb-1" readOnly={readOnly} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  notifications.addNotification.mockReset();
  canvas.onNodeClick = null;
  api.subgraph.mockResolvedValue({ nodes: [], edges: [] });
  api.status.mockResolvedValue(status());
  api.failedChunks.mockResolvedValue([]);
});

describe('图谱分区', () => {
  it('未锁定时空态引导去配置抽取器', async () => {
    renderPanel();

    expect(
      await screen.findByText('配置抽取器后，才能从当前知识库构建实体与关系。'),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /配置抽取器/ }));

    expect(await screen.findByText('配置图谱抽取器')).toBeTruthy();
  });

  it('只读知识库不给索引管理与配置入口', async () => {
    renderPanel(true);

    await screen.findByText(/图谱尚未构建/);

    expect(screen.queryByRole('button', { name: '索引管理' })).toBeNull();
    expect(screen.queryByRole('button', { name: /配置抽取器/ })).toBeNull();
  });

  it('已锁定且有待构建 Chunk 时，空态给「开始索引」并提交任务', async () => {
    api.status.mockResolvedValue(status({ locked: true, configured: true }));
    api.index.mockResolvedValue({
      message: '图谱构建任务已提交',
      status: 'queued',
    });
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /开始索引/ }),
    );

    await waitFor(() => expect(api.index).toHaveBeenCalledWith('kb-1'));
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        message: '图谱构建任务已提交',
      }),
    );
  });

  it('搜索框回车把关键词落到查询参数上，清空后回到 *', async () => {
    api.status.mockResolvedValue(status({ locked: true }));
    renderPanel();
    await waitFor(() => expect(api.subgraph).toHaveBeenCalled());

    await userEvent.type(screen.getByLabelText('搜索实体'), '张三{Enter}');

    await waitFor(() =>
      expect(api.subgraph).toHaveBeenLastCalledWith('kb-1', {
        nodeLabel: '张三',
        maxDepth: 2,
        maxNodes: 100,
        excludeChunk: true,
      }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: /清空搜索/ }),
    );
    await waitFor(() =>
      expect(api.subgraph).toHaveBeenLastCalledWith('kb-1', {
        nodeLabel: '*',
        maxDepth: 2,
        maxNodes: 100,
        excludeChunk: true,
      }),
    );
  });

  it('点画布上的实体打开详情面板，关闭后消失', async () => {
    api.status.mockResolvedValue(status({ locked: true }));
    api.subgraph.mockResolvedValue({
      nodes: [node],
      edges: [],
    });
    renderPanel();

    await screen.findByTestId('graph-canvas-stub');
    canvas.onNodeClick?.(node);

    expect(await screen.findByLabelText('节点详情')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '关闭详情' }));
    expect(screen.queryByLabelText('节点详情')).toBeNull();
  });

  it('索引管理按钮显示待构建数量并切换面板', async () => {
    api.status.mockResolvedValue(status({ locked: true, pending_chunks: 4 }));
    renderPanel();

    const button = await screen.findByRole('button', { name: '索引管理' });
    // 状态是异步到的，计数要等它落下来
    await waitFor(() => expect(button).toHaveTextContent('4 待索引'));

    await userEvent.click(button);
    expect(await screen.findByText('索引管理')).toBeTruthy();
  });
});
