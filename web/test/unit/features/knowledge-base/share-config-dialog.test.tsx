import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

// antd 词汇由应用装配承载，测试同构挂上
import { AntdProvider } from '@/app/theme/antd-provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动 Radix 弹窗，全套件并行跑时会超过默认 5 秒预算；
 * 与 `knowledge-file-table` 等重交互文件同一口径，给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

const { api, notifications } = vi.hoisted(() => ({
  api: { update: vi.fn(), departments: vi.fn(), users: vi.fn() },
  notifications: { addNotification: vi.fn() },
}));

vi.mock('@/features/knowledge-base/api/knowledge-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/knowledge-api')
  >('@/features/knowledge-base/api/knowledge-api');
  return {
    ...actual,
    knowledgeApi: {
      ...actual.knowledgeApi,
      update: (...args: unknown[]) => api.update(...args),
      listDepartments: (...args: unknown[]) => api.departments(...args),
      listUserOptions: (...args: unknown[]) => api.users(...args),
    },
  };
});

vi.mock('@/shared/ui/notifications', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/ui/notifications')
  >('@/shared/ui/notifications');
  return { ...actual, useNotifications: () => notifications };
});

const { ShareConfigDialog } =
  await import('@/features/knowledge-base/ui/share-config-dialog');

const kb = (share: unknown = null) => ({
  kb_id: 'kb-1',
  name: '研发知识库',
  description: '内部资料',
  kb_type: 'milvus',
  can_manage: true,
  stats: {
    file_count: 0,
    folder_count: 0,
    row_count: 0,
    total_size: 0,
    chunk_count: 0,
    token_count: 0,
    pending_parse_count: 0,
    pending_index_count: 0,
    processing_count: 0,
  },
  share_config: share,
});

const renderDialog = (share: unknown = null) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const handlers = { onOpenChange: vi.fn() };
  render(
    <AntdProvider>
      <QueryClientProvider client={queryClient}>
        <ShareConfigDialog kb={kb(share) as never} {...handlers} />
      </QueryClientProvider>
    </AntdProvider>,
  );
  return handlers;
};

describe('共享设置弹窗', () => {
  beforeEach(() => {
    api.update.mockReset().mockResolvedValue(undefined);
    api.departments.mockReset().mockResolvedValue([
      { id: 3, name: '运营部' },
      { id: 2, name: '产品部' },
    ]);
    api.users
      .mockReset()
      .mockResolvedValue([
        { uid: 'zwj', username: '张文杰', department_name: '研发部' },
      ]);
    notifications.addNotification.mockReset();
  });

  it('默认全局共享，切到部门后列出部门并可勾选', async () => {
    renderDialog();

    await screen.findByRole('radio', { name: '部门共享' });
    await userEvent.click(screen.getByRole('radio', { name: '部门共享' }));
    await userEvent.click(
      await screen.findByRole('button', { name: '运营部' }),
    );

    expect(screen.getByRole('button', { name: '运营部' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('radio', { name: '部门共享' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('kb-1', {
        name: '研发知识库',
        description: '内部资料',
        share_config: {
          version: 2,
          read_scope: {
            access_level: 'department',
            department_ids: [3],
            user_uids: [],
          },
          manage_scope: null,
        },
      }),
    );
  });

  it('加了管理范围且越界时拦下并给说明', async () => {
    renderDialog({
      version: 2,
      read_scope: { access_level: 'user', user_uids: ['zwj'] },
      manage_scope: null,
    });

    await userEvent.click(
      await screen.findByRole('button', { name: '添加管理范围' }),
    );
    // 管理范围默认跟随读取级别（指定人），把读取范围换成部门造成越界
    await userEvent.click(withinSection('scope-read_scope', '部门共享'));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '管理范围必须落在读取范围内',
    );
    expect(api.update).not.toHaveBeenCalled();
  });

  it('按部门共享但一个部门都没选时拦下', async () => {
    renderDialog();
    await screen.findByRole('radio', { name: '部门共享' });

    await userEvent.click(screen.getByRole('radio', { name: '部门共享' }));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '至少要选一个部门',
    );
    expect(api.update).not.toHaveBeenCalled();
  });

  it('管理范围跟着读取级别但一个对象都没选时拦下，不发给后端', async () => {
    renderDialog({
      version: 2,
      read_scope: { access_level: 'user', user_uids: ['zwj'] },
      manage_scope: null,
    });

    await userEvent.click(
      await screen.findByRole('button', { name: '添加管理范围' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '管理范围指定人共享时至少要选一个用户',
    );
    expect(api.update).not.toHaveBeenCalled();
  });

  it('管理范围的小标题按「管理」口径，读起来不与读取范围混淆', async () => {
    renderDialog({
      version: 2,
      read_scope: { access_level: 'department', department_ids: [3] },
      manage_scope: { access_level: 'department', department_ids: [3] },
    });

    const manage = await screen.findByTestId('scope-manage_scope');
    expect(manage).toHaveTextContent('1 个部门可管理');
    expect(manage).not.toHaveTextContent('可访问');
    expect(screen.getByTestId('scope-read_scope')).toHaveTextContent(
      '1 个部门可访问',
    );
  });

  it('没有管理范围时不谎称所有用户都能管理', async () => {
    renderDialog();

    const manage = await screen.findByTestId('scope-manage_scope');
    expect(manage).toHaveTextContent('未单独授予管理权限');
    expect(manage).not.toHaveTextContent('所有用户都可以管理');
  });

  it('改选择后上一次的校验提示消失', async () => {
    renderDialog();
    await screen.findByRole('radio', { name: '部门共享' });

    await userEvent.click(screen.getByRole('radio', { name: '部门共享' }));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '至少要选一个部门',
    );

    await userEvent.click(
      await screen.findByRole('button', { name: '运营部' }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('保存成功后提示并关闭，失败时留在弹窗里给原因', async () => {
    api.update.mockRejectedValue(new Error('保存知识库失败。'));
    const handlers = renderDialog();

    await screen.findByRole('button', { name: '保存' });
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '保存知识库失败。',
    );
    expect(handlers.onOpenChange).not.toHaveBeenCalledWith(false);

    api.update.mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ message: '共享范围已保存。' }),
      ),
    );
    expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
  });
});

/** 在某个范围区块里按名字取按钮。 */
function withinSection(testId: string, name: string) {
  const section = screen.getByTestId(testId);
  const input = Array.from(
    section.querySelectorAll('input[type="radio"]'),
  ).find((item) => item.closest('label')?.textContent?.trim() === name);
  if (!input) throw new Error(`没有找到单选项：${name}`);
  return input;
}
