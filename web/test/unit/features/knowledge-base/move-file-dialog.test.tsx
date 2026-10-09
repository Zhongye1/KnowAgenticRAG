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

/** 这组用例靠 userEvent 驱动 Radix Dialog，并行跑套件时会超过默认 5 秒预算。 */
const itSlow = (name: string, fn: () => Promise<void>) => it(name, fn, 15000);

const { api } = vi.hoisted(() => ({
  api: { listDocuments: vi.fn(), moveDocument: vi.fn() },
}));

vi.mock('@/features/knowledge-base/api/knowledge-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/knowledge-api')
  >('@/features/knowledge-base/api/knowledge-api');
  return {
    ...actual,
    knowledgeApi: {
      ...actual.knowledgeApi,
      listDocuments: (...args: unknown[]) => api.listDocuments(...args),
      moveDocument: (...args: unknown[]) => api.moveDocument(...args),
    },
  };
});

const { MoveFileDialog } =
  await import('@/features/knowledge-base/ui/move-file-dialog');

const folder = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  file_id: id,
  filename: name,
  file_type: 'folder',
  status: 'done',
  file_size: 0,
  chunk_count: 0,
  token_count: 0,
  is_folder: true,
  has_children: false,
  children_count: 0,
  has_original_file: false,
  has_parsed_markdown: false,
  is_virtual_folder: false,
  ...extra,
});

const movedFile = {
  file_id: 'f-1',
  filename: '报表.pdf',
  status: 'indexed',
  file_size: 1024,
  chunk_count: 0,
  token_count: 0,
  is_folder: false,
  has_children: false,
  children_count: 0,
  has_original_file: true,
  has_parsed_markdown: true,
  is_virtual_folder: false,
};

const page = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 100,
  has_more: false,
});

const renderDialog = (props: Record<string, unknown> = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const handlers = {
    onOpenChange: vi.fn(),
    onMoved: vi.fn(),
    onError: vi.fn(),
  };
  render(
    <QueryClientProvider client={queryClient}>
      <MoveFileDialog kbId="kb-1" file={movedFile} {...handlers} {...props} />
    </QueryClientProvider>,
  );
  return handlers;
};

describe('移动文件弹窗', () => {
  beforeEach(() => {
    api.listDocuments.mockReset();
    api.moveDocument.mockReset();
    api.listDocuments.mockImplementation(
      (_kbId: string, params: { parentId: string | null }) =>
        Promise.resolve(
          page(
            params.parentId === 'folder-a'
              ? [folder('folder-b', '子目录B')]
              : [
                  folder('folder-a', '目录A'),
                  // 被移动的目录自己不该出现在候选里
                  folder('f-1', '报表.pdf'),
                  // 虚拟目录没有实体记录，不能作为移动目标
                  folder('__virtual_folder__:root:brief/', 'brief', {
                    is_virtual_folder: true,
                    path_prefix: 'brief/',
                  }),
                ],
          ),
        ),
    );
  });

  it('列出当前层目录，点进去后换一层', async () => {
    renderDialog();

    expect(await screen.findByRole('button', { name: /目录A/ })).toBeTruthy();
    // 被移动的对象从候选里排除
    expect(screen.queryByRole('button', { name: /报表\.pdf/ })).toBeNull();
    // 虚拟目录也排除：移动写的是 parent_id，选它等于移到它的父目录
    expect(screen.queryByRole('button', { name: /brief/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /目录A/ }));

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: 'folder-a' }),
      ),
    );
    expect(await screen.findByRole('button', { name: /子目录B/ })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /移动到「目录A」/ }),
    ).toBeTruthy();
  });

  it('面包屑能回到根目录；文件本来就在根目录时不给确认', async () => {
    renderDialog();
    await userEvent.click(await screen.findByRole('button', { name: /目录A/ }));
    await screen.findByRole('button', { name: /子目录B/ });

    await userEvent.click(screen.getByRole('button', { name: '回到根目录' }));

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: null }),
      ),
    );
    // 目标与当前位置相同：后端会返回成功但什么都没变，所以不给提交
    const confirm = screen.getByRole('button', { name: '已经在这个目录下' });
    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(api.moveDocument).not.toHaveBeenCalled();
  });

  it('文件在子目录时，选回它所在的目录同样不给确认', async () => {
    renderDialog({
      file: {
        file_id: 'f-1',
        filename: '报表.pdf',
        status: 'indexed',
        file_size: 1024,
        chunk_count: 0,
        token_count: 0,
        parent_id: 'folder-a',
        is_folder: false,
        has_children: false,
        children_count: 0,
        has_original_file: true,
        has_parsed_markdown: true,
        is_virtual_folder: false,
      },
    });

    // 根目录不是它的当前位置，可以移动
    expect(
      await screen.findByRole('button', { name: /移动到「根目录」/ }),
    ).toBeEnabled();

    await userEvent.click(await screen.findByRole('button', { name: /目录A/ }));
    await screen.findByRole('button', { name: /子目录B/ });

    expect(
      screen.getByRole('button', { name: '已经在这个目录下' }),
    ).toBeDisabled();
  });

  it('确认后提交新父目录并关闭', async () => {
    api.moveDocument.mockResolvedValue({ message: '移动成功' });
    const handlers = renderDialog();

    await userEvent.click(await screen.findByRole('button', { name: /目录A/ }));
    await userEvent.click(
      await screen.findByRole('button', { name: /移动到「目录A」/ }),
    );

    await waitFor(() =>
      expect(api.moveDocument).toHaveBeenCalledWith('kb-1', 'f-1', 'folder-a'),
    );
    expect(handlers.onMoved).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('失败时把后端原因交给调用方，弹窗不关', async () => {
    api.moveDocument.mockRejectedValue(new Error('不能移动到自己的子目录'));
    const handlers = renderDialog();

    await userEvent.click(await screen.findByRole('button', { name: /目录A/ }));
    await userEvent.click(
      await screen.findByRole('button', { name: /移动到「目录A」/ }),
    );

    await waitFor(() =>
      expect(handlers.onError).toHaveBeenCalledWith('不能移动到自己的子目录'),
    );
    expect(handlers.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByTestId('move-file-dialog')).toBeTruthy();
  });

  it('没有子目录时给出空态', async () => {
    api.listDocuments.mockResolvedValue(page([]));
    renderDialog();

    expect(await screen.findByText('这个目录下没有子目录')).toBeTruthy();
  });
});
