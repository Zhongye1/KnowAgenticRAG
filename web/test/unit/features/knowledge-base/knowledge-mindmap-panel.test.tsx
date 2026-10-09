/**
 * 知识导图分区：加载/失败/空态/生成中/有数据五态、工具栏按钮、markmap 生命周期。
 * 真实 SVG 由 markmap 自己负责，这里换成替身，验的是接线与状态机。
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动 Radix 弹窗，全套件并行跑时会超过默认 5 秒预算；
 * 这里给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

const { api, notifications, markmap } = vi.hoisted(() => ({
  api: { get: vi.fn(), generate: vi.fn(), diff: vi.fn() },
  notifications: { addNotification: vi.fn() },
  markmap: { instances: [] as Array<Record<string, ReturnType<typeof vi.fn>>> },
}));

vi.mock('@/features/knowledge-base/api/mindmap-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/mindmap-api')
  >('@/features/knowledge-base/api/mindmap-api');
  return {
    ...actual,
    mindmapApi: {
      getDocument: (...args: unknown[]) => api.get(...args),
      generate: (...args: unknown[]) => api.generate(...args),
      getDiff: (...args: unknown[]) => api.diff(...args),
    },
  };
});

vi.mock('markmap-view', () => ({
  Markmap: {
    create: vi.fn(() => {
      const instance = {
        setData: vi.fn(() => Promise.resolve()),
        fit: vi.fn(() => Promise.resolve()),
        destroy: vi.fn(),
      };
      markmap.instances.push(instance);
      return instance;
    }),
  },
}));

vi.mock('markmap-lib', () => ({
  Transformer: class {
    transform(markdown: string) {
      return { root: { content: markdown, children: [] } };
    }
  },
}));

vi.mock('@/shared/ui/notifications', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/ui/notifications')
  >('@/shared/ui/notifications');
  return { ...actual, useNotifications: () => notifications };
});

const { KnowledgeMindmapPanel } =
  await import('@/features/knowledge-base/ui/knowledge-mindmap-panel');

const MINDMAP = {
  content: '研发知识库',
  children: [{ content: '主分类', children: [{ content: 'a.md' }] }],
};

const DIFF = (extra: Record<string, unknown> = {}) => ({
  has_mindmap: true,
  tracked_files: ['f-1'],
  current_files: ['f-1'],
  added_files: [],
  removed_file_ids: [],
  unchanged_count: 1,
  needs_update: false,
  ...extra,
});

const renderPanel = (readOnly = false) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeMindmapPanel kbId="kb-1" readOnly={readOnly} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  notifications.addNotification.mockReset();
  markmap.instances.length = 0;
  api.get.mockResolvedValue({ mindmap: null, kb_id: 'kb-1' });
  api.diff.mockResolvedValue(DIFF());
  api.generate.mockResolvedValue({ mindmap: MINDMAP });
});

describe('知识导图分区', () => {
  it('没有导图时给出空态与生成入口，点击提交非增量生成', async () => {
    renderPanel();

    expect(await screen.findByText('暂无思维导图')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /生成思维导图/ }));

    await waitFor(() =>
      expect(api.generate).toHaveBeenCalledWith('kb-1', {
        incremental: false,
        userPrompt: undefined,
      }),
    );
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: '思维导图生成成功。' }),
    );
  });

  it('后端给了空 content 的导图时仍然按空态处理', async () => {
    api.get.mockResolvedValue({ mindmap: { content: '' }, kb_id: 'kb-1' });
    renderPanel();

    expect(await screen.findByText('暂无思维导图')).toBeTruthy();
    expect(screen.queryByTestId('mindmap-svg')).toBeNull();
  });

  it('只读知识库不给生成入口，但说明为什么看不到', async () => {
    renderPanel(true);

    expect(
      await screen.findByText(
        '思维导图尚未生成，请等待知识库管理员生成后查看。',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /生成思维导图/ })).toBeNull();
  });

  it('加载失败时给出后端原因与重试，不伪装成空态', async () => {
    api.get.mockRejectedValue(new Error('知识库 kb-1 不存在'));
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '加载思维导图失败：知识库 kb-1 不存在',
    );
    expect(screen.queryByText('暂无思维导图')).toBeNull();
  });

  it('有导图时渲染 markmap 并给出工具栏', async () => {
    api.get.mockResolvedValue({ mindmap: MINDMAP, kb_id: 'kb-1' });
    renderPanel();

    await screen.findByTestId('mindmap-svg');
    await waitFor(() => expect(markmap.instances).toHaveLength(1));
    expect(markmap.instances[0].setData).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('# 研发知识库'),
      }),
    );
    expect(screen.getByRole('button', { name: /重新生成/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /适应视图/ })).toBeTruthy();
    // 文本替代要给出整棵树，而不是只有根节点
    expect(screen.getByText('知识导图结构：')).toBeTruthy();
    for (const text of ['研发知识库', '主分类', 'a.md']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('主题接线：svg 上的 --markmap-* 变量指向 tokens.css 的 Token', async () => {
    api.get.mockResolvedValue({ mindmap: MINDMAP, kb_id: 'kb-1' });
    renderPanel();

    const svg = await screen.findByTestId('mindmap-svg');
    await waitFor(() => expect(markmap.instances).toHaveLength(1));

    expect(svg.style.getPropertyValue('--markmap-text-color')).toBe(
      'rgb(var(--color-text-1))',
    );
    expect(svg.style.getPropertyValue('--markmap-code-bg')).toBe(
      'rgb(var(--color-fill-2))',
    );
  });

  it('生成失败后回到导图：新的 svg 上重建实例，不留空白', async () => {
    api.get.mockResolvedValue({ mindmap: MINDMAP, kb_id: 'kb-1' });
    let rejectGenerate: (error: unknown) => void = () => {};
    api.generate.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectGenerate = reject;
      }),
    );
    renderPanel();

    await screen.findByTestId('mindmap-svg');
    await waitFor(() => expect(markmap.instances).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: /重新生成/ }));
    // 生成中分支会把 <svg> 整块卸载
    expect(await screen.findByText('AI 正在生成思维导图…')).toBeTruthy();

    await act(async () => {
      rejectGenerate(new Error('知识库中没有文件'));
      await Promise.resolve();
    });

    // 回到数据分支时 React 挂的是新元素：必须在新元素上重建实例，旧实例要销毁
    await screen.findByTestId('mindmap-svg');
    await waitFor(() => expect(markmap.instances).toHaveLength(2));
    expect(markmap.instances[0].destroy).toHaveBeenCalled();
    expect(markmap.instances[1].setData).toHaveBeenCalled();
  });

  it('生成成功但回来内容不变时也不会空白', async () => {
    api.get.mockResolvedValue({ mindmap: MINDMAP, kb_id: 'kb-1' });
    let resolveGenerate: (value: unknown) => void = () => {};
    // 用受控 promise 让「生成中」这一屏真的渲染出来（否则 React 可能一次批处理掉，
    // 元素不会重建，也就测不到这条路径）
    api.generate.mockReturnValue(
      new Promise((resolve) => {
        resolveGenerate = resolve;
      }),
    );
    renderPanel();

    await screen.findByTestId('mindmap-svg');
    await waitFor(() => expect(markmap.instances).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: /重新生成/ }));
    expect(await screen.findByText('AI 正在生成思维导图…')).toBeTruthy();

    await act(async () => {
      resolveGenerate({ mindmap: MINDMAP });
      await Promise.resolve();
    });

    await screen.findByTestId('mindmap-svg');
    await waitFor(() => expect(markmap.instances).toHaveLength(2));
    expect(markmap.instances[1].setData).toHaveBeenCalled();
  });

  it('差异检测说需要更新时才出现增量入口，并带新增数量角标', async () => {
    api.get.mockResolvedValue({ mindmap: MINDMAP, kb_id: 'kb-1' });
    api.diff.mockResolvedValue(
      DIFF({
        needs_update: true,
        added_files: [
          { file_id: 'f-2', filename: 'b.md' },
          { file_id: 'f-3', filename: 'c.md' },
        ],
      }),
    );
    renderPanel();

    const incremental = await screen.findByRole('button', { name: /增量更新/ });
    expect(incremental).toHaveTextContent('2');
    expect(screen.getByText('与上次生成相比：新增 2 个文件')).toBeTruthy();

    await userEvent.click(incremental);
    await waitFor(() =>
      expect(api.generate).toHaveBeenCalledWith('kb-1', {
        incremental: true,
        userPrompt: undefined,
      }),
    );
  });

  it('不需要更新时不出现增量入口（等差异回来看过再说）', async () => {
    api.get.mockResolvedValue({ mindmap: MINDMAP, kb_id: 'kb-1' });
    api.diff.mockResolvedValue(DIFF());
    renderPanel();

    await screen.findByTestId('mindmap-svg');
    await waitFor(() => expect(api.diff).toHaveBeenCalledWith('kb-1'));
    // 差异回来后仍然不该出现增量入口，也不该出现差异摘要
    await waitFor(() =>
      expect(screen.queryByText(/与上次生成相比/)).toBeNull(),
    );
    expect(screen.queryByRole('button', { name: /增量更新/ })).toBeNull();
  });

  it('生成中显示 AI 状态，并且不再渲染导图容器', async () => {
    api.get.mockResolvedValue({ mindmap: MINDMAP, kb_id: 'kb-1' });
    api.generate.mockReturnValue(new Promise(() => {}));
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /重新生成/ }),
    );

    expect(await screen.findByText('AI 正在生成思维导图…')).toBeTruthy();
  });

  it('增量更新且后端没调 AI 时给对应的提示', async () => {
    api.get.mockResolvedValue({ mindmap: MINDMAP, kb_id: 'kb-1' });
    api.diff.mockResolvedValue(
      DIFF({ needs_update: true, removed_file_ids: ['f-9'] }),
    );
    api.generate.mockResolvedValue({ mindmap: MINDMAP, no_ai_needed: true });
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /增量更新/ }),
    );

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '思维导图已更新（自动清理已删除文件）。',
        }),
      ),
    );
  });

  it('生成失败时提示后端原因', async () => {
    api.get.mockResolvedValue({ mindmap: null, kb_id: 'kb-1' });
    api.generate.mockRejectedValue(new Error('知识库中还没有文件'));
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /生成思维导图/ }),
    );

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: '知识库中还没有文件',
        }),
      ),
    );
  });

  it('适应视图调用 markmap 自己的 fit', async () => {
    api.get.mockResolvedValue({ mindmap: MINDMAP, kb_id: 'kb-1' });
    renderPanel();

    await screen.findByTestId('mindmap-svg');
    await userEvent.click(screen.getByRole('button', { name: /适应视图/ }));

    await waitFor(() =>
      expect(markmap.instances[0].fit).toHaveBeenCalledTimes(1),
    );
  });

  it('卸载时销毁 markmap 实例', async () => {
    api.get.mockResolvedValue({ mindmap: MINDMAP, kb_id: 'kb-1' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <KnowledgeMindmapPanel kbId="kb-1" readOnly={false} />
      </QueryClientProvider>,
    );

    await screen.findByTestId('mindmap-svg');
    await waitFor(() => expect(markmap.instances).toHaveLength(1));

    unmount();

    expect(markmap.instances[0].destroy).toHaveBeenCalledTimes(1);
  });
});
