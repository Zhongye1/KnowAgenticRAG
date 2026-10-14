import { render, within, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动 Radix 弹窗，全套件并行跑时会超过默认 5 秒预算；
 * 与 `knowledge-file-table` 等重交互文件同一口径，给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

const { api, notifications } = vi.hoisted(() => ({
  api: {
    list: vi.fn(),
    remove: vi.fn(),
    listTypes: vi.fn(),
  },
  notifications: { addNotification: vi.fn() },
}));

vi.mock('@/features/knowledge-base/api/knowledge-api', () => ({
  knowledgeApi: {
    list: (...args: unknown[]) => api.list(...args),
    remove: (...args: unknown[]) => api.remove(...args),
    listTypes: (...args: unknown[]) => api.listTypes(...args),
  },
}));

vi.mock('@/shared/ui/notifications', () => ({
  useNotifications: () => notifications,
}));

const { KnowledgeList } =
  await import('@/features/knowledge-base/ui/knowledge-list');
const { AntdProvider } = await import('@/app/theme/antd-provider');

const database = (id: string, extra: Record<string, unknown> = {}) => ({
  kb_id: id,
  name: `库-${id}`,
  description: `描述-${id}`,
  kb_type: 'milvus',
  can_manage: true,
  stats: {
    file_count: 3,
    folder_count: 0,
    row_count: 0,
    total_size: 2048,
    chunk_count: 12000,
    token_count: 0,
    pending_parse_count: 0,
    pending_index_count: 0,
    processing_count: 0,
  },
  ...extra,
});

const renderList = (onOpen = vi.fn()) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <AntdProvider>
      <QueryClientProvider client={queryClient}>
        <KnowledgeList onOpen={onOpen} />
        {/* 删除走命令式确认框，测试里挂上它的渲染出口 */}
      </QueryClientProvider>
    </AntdProvider>,
  );
  return { onOpen };
};

describe('知识库列表', () => {
  beforeEach(() => {
    api.list.mockReset().mockResolvedValue([database('a'), database('b')]);
    api.remove.mockReset().mockResolvedValue(undefined);
    api.listTypes.mockReset().mockResolvedValue({ milvus: { name: 'ARS' } });
    notifications.addNotification.mockReset();
  });

  it('渲染卡片与统计摘要', async () => {
    renderList();

    expect(await screen.findByText('库-a')).toBeTruthy();
    expect(screen.getByText('库-b')).toBeTruthy();
    // 统计：3 个文件、1.2 万分块、2.0 KB
    const card = screen.getAllByTestId('knowledge-card')[0]!;
    expect(card.textContent).toContain('3');
    expect(card.textContent).toContain('1.2 万');
    expect(card.textContent).toContain('2.0 KB');
  });

  it('搜索按名称与描述过滤', async () => {
    renderList();
    await screen.findByText('库-a');

    await userEvent.type(screen.getByLabelText('搜索知识库'), '描述-b');
    await waitFor(() => expect(screen.queryByText('库-a')).toBeNull());
    expect(screen.getByText('库-b')).toBeTruthy();

    // 名称命中也必须能搜到（只留描述分支时这条会红）
    await userEvent.clear(screen.getByLabelText('搜索知识库'));
    await userEvent.type(screen.getByLabelText('搜索知识库'), '库-a');
    await waitFor(() => expect(screen.getByText('库-a')).toBeTruthy());
    expect(screen.queryByText('库-b')).toBeNull();
  });

  it('大小写不敏感', async () => {
    api.list.mockResolvedValue([database('a', { name: 'MyKB' })]);
    renderList();
    await screen.findByText('MyKB');

    await userEvent.type(screen.getByLabelText('搜索知识库'), 'mykb');

    expect(screen.getByText('MyKB')).toBeTruthy();
  });

  it('没有匹配时给出可继续操作的提示', async () => {
    renderList();
    await screen.findByText('库-a');

    await userEvent.type(screen.getByLabelText('搜索知识库'), '不存在的词');

    expect(await screen.findByText(/没有匹配的知识库/)).toBeTruthy();
  });

  it('一个知识库都没有时给新建入口', async () => {
    api.list.mockResolvedValue([]);
    renderList();

    expect(
      await screen.findByText('还没有知识库。新建一个后即可上传文档。'),
    ).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: /新建知识库/ }).length,
    ).toBeGreaterThan(0);
  });

  it('加载失败时给出原因与重试', async () => {
    api.list.mockRejectedValueOnce(new Error('500'));
    renderList();

    expect(await screen.findByRole('alert')).toBeTruthy();
    api.list.mockResolvedValue([database('a')]);
    await userEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByText('库-a')).toBeTruthy();
  });

  it('点卡片进入详情', async () => {
    const { onOpen } = renderList();
    await screen.findByText('库-a');

    await userEvent.click(screen.getByText('库-a'));

    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ kb_id: 'a' }),
    );
  });

  it('删除要先确认，确认后才调用接口并提示', async () => {
    renderList();
    await screen.findByText('库-a');

    await userEvent.click(
      screen.getByRole('button', { name: '知识库操作：库-a' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: '删除' }),
    );
    expect(api.remove).not.toHaveBeenCalled();

    expect(
      await screen.findByText('删除知识库「库-a」？', {
        selector: '.ant-modal-confirm-title',
      }),
    ).toBeTruthy();
    await userEvent.click(
      within(
        document.querySelector('.ant-modal-confirm') as HTMLElement,
      ).getByRole('button', { name: '删除' }),
    );

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('a'));
    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          message: '已删除「库-a」。',
        }),
      ),
    );
  });

  it('确认框里取消则不删', async () => {
    renderList();
    await screen.findByText('库-a');

    await userEvent.click(
      screen.getByRole('button', { name: '知识库操作：库-a' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: '删除' }),
    );
    await userEvent.click(
      within(
        document.querySelector('.ant-modal-confirm') as HTMLElement,
      ).getByRole('button', { name: '取消' }),
    );

    expect(api.remove).not.toHaveBeenCalled();
  });

  it('删除失败时把后端原因显示出来', async () => {
    api.remove.mockRejectedValue(new Error('知识库正在被任务使用'));
    renderList();
    await screen.findByText('库-a');

    await userEvent.click(
      screen.getByRole('button', { name: '知识库操作：库-a' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: '删除' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: '删除' }));

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: '知识库正在被任务使用',
        }),
      ),
    );
  });

  it('只读知识库不给编辑与删除，但可以复制 ID', async () => {
    api.list.mockResolvedValue([database('a', { can_manage: false })]);
    renderList();
    await screen.findByText('库-a');
    expect(screen.getByText('只读')).toBeTruthy();

    await userEvent.click(
      screen.getByRole('button', { name: '知识库操作：库-a' }),
    );

    expect(
      await screen.findByRole('menuitem', { name: '复制 ID' }),
    ).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: '编辑' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: '删除' })).toBeNull();
  });

  it('复制失败时给出失败提示，不谎报成功', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    renderList();
    await screen.findByText('库-a');

    await userEvent.click(
      screen.getByRole('button', { name: '知识库操作：库-a' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: '复制 ID' }),
    );

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' }),
      ),
    );
  });

  it('类型表没就绪时不让开新建，避免点开一个没有选项的表单', async () => {
    api.listTypes.mockResolvedValue({});
    renderList();
    await screen.findByText('库-a');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /新建知识库/ })).toBeDisabled(),
    );
  });

  it('加载失败时显示后端给的原因', async () => {
    api.list.mockRejectedValueOnce(new Error('没有权限'));
    renderList();

    expect(await screen.findByRole('alert')).toHaveTextContent('没有权限');
  });

  it('复制 ID 成功后提示', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderList();
    await screen.findByText('库-a');

    await userEvent.click(
      screen.getByRole('button', { name: '知识库操作：库-a' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: '复制 ID' }),
    );

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('a'));
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: 'ID 已复制。' }),
    );
  });

  it('按类型筛选只留下该类型的知识库', async () => {
    api.listTypes.mockResolvedValue({
      milvus: { name: 'ARS' },
      dify: { name: 'Dify' },
    });
    api.list.mockResolvedValue([
      database('a'),
      database('b', { kb_type: 'dify', name: '库-b' }),
    ]);
    renderList();
    await screen.findByText('库-a');

    await userEvent.click(await screen.findByRole('button', { name: 'Dify' }));

    await waitFor(() => expect(screen.queryByText('库-a')).toBeNull());
    expect(screen.getByText('库-b')).toBeTruthy();
  });

  it('编辑入口打开表单对话框并带上当前知识库', async () => {
    renderList();
    await screen.findByText('库-a');

    await userEvent.click(
      screen.getByRole('button', { name: '知识库操作：库-a' }),
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: '编辑' }),
    );

    expect(await screen.findByTestId('knowledge-form-dialog')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('知识库名称').value).toBe(
      '库-a',
    );
  });
});
