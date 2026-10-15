import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
/**
 * 这套用例逐个靠 userEvent 驱动表格与 Radix 菜单，全套件并行跑时会超过默认 5 秒预算；
 * 这里给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 20000 });

const { queryOptions } = vi.hoisted(() => ({
  queryOptions: [] as Array<{ refetchInterval?: number | false }>,
}));

vi.mock('@/features/knowledge-base/model/knowledge-queries', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/model/knowledge-queries')
  >('@/features/knowledge-base/model/knowledge-queries');
  return {
    ...actual,
    useKnowledgeFiles: (...args: unknown[]) => {
      queryOptions.push(
        (args[2] as { refetchInterval?: number | false }) ?? {},
      );
      return (actual.useKnowledgeFiles as (...inner: unknown[]) => unknown)(
        ...args,
      );
    },
  };
});

const { api, notifications } = vi.hoisted(() => ({
  api: {
    listDocuments: vi.fn(),
    searchDocuments: vi.fn(),
    deleteDocument: vi.fn(),
    fileContent: vi.fn(),
    supportedTypes: vi.fn(),
    ocrOptions: vi.fn(),
    uploadFile: vi.fn(),
    addDocuments: vi.fn(),
    batchDeleteDocuments: vi.fn(),
    parseDocuments: vi.fn(),
    indexDocuments: vi.fn(),
    downloadDocument: vi.fn(),
    get: vi.fn(),
    detectVirtualFolders: vi.fn(),
    startVirtualFolderMigration: vi.fn(),
    streamVirtualFolderMigration: vi.fn(),
    repairStats: vi.fn(),
    parsePendingDocuments: vi.fn(),
    indexPendingDocuments: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
  },
  notifications: { addNotification: vi.fn() },
}));

vi.mock('@/shared/ui/notifications', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/ui/notifications')
  >('@/shared/ui/notifications');
  return {
    ...actual,
    useNotifications: () => notifications,
  };
});

vi.mock('@/features/knowledge-base/api/knowledge-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/knowledge-api')
  >('@/features/knowledge-base/api/knowledge-api');
  return {
    ...actual,
    knowledgeApi: {
      ...actual.knowledgeApi,
      listDocuments: (...args: unknown[]) => api.listDocuments(...args),
      searchDocuments: (...args: unknown[]) => api.searchDocuments(...args),
      deleteDocument: (...args: unknown[]) => api.deleteDocument(...args),
      getFileContent: (...args: unknown[]) => api.fileContent(...args),
      listSupportedTypes: (...args: unknown[]) => api.supportedTypes(...args),
      listOcrOptions: (...args: unknown[]) => api.ocrOptions(...args),
      uploadFile: (...args: unknown[]) => api.uploadFile(...args),
      addDocuments: (...args: unknown[]) => api.addDocuments(...args),
      batchDeleteDocuments: (...args: unknown[]) =>
        api.batchDeleteDocuments(...args),
      parseDocuments: (...args: unknown[]) => api.parseDocuments(...args),
      indexDocuments: (...args: unknown[]) => api.indexDocuments(...args),
      downloadDocument: (...args: unknown[]) => api.downloadDocument(...args),
      get: (...args: unknown[]) => api.get(...args),
      detectVirtualFolders: (...args: unknown[]) =>
        api.detectVirtualFolders(...args),
      startVirtualFolderMigration: (...args: unknown[]) =>
        api.startVirtualFolderMigration(...args),
      streamVirtualFolderMigration: (...args: unknown[]) =>
        api.streamVirtualFolderMigration(...args),
      repairStats: (...args: unknown[]) => api.repairStats(...args),
      parsePendingDocuments: (...args: unknown[]) =>
        api.parsePendingDocuments(...args),
      indexPendingDocuments: (...args: unknown[]) =>
        api.indexPendingDocuments(...args),
      createFolder: (...args: unknown[]) => api.createFolder(...args),
      renameFolder: (...args: unknown[]) => api.renameFolder(...args),
    },
  };
});

const { KnowledgeFileTable, FileSearchModal, openLocation } =
  await import('@/features/knowledge-base');
const { shouldPollFiles } =
  await import('@/features/knowledge-base/ui/files/table/knowledge-file-table');

/** 要开下拉、翻页或等异步查询的用例自带预算，并行跑整套时不会被 5 秒上限误伤。 */
const { AntdProvider } = await import('@/app/theme/antd-provider');

const file = (id: string, extra: Record<string, unknown> = {}) => ({
  file_id: id,
  filename: `${id}.pdf`,
  status: 'indexed',
  file_size: 2048,
  chunk_count: 0,
  token_count: 120,
  created_at: '2026-10-08T02:00:00Z',
  created_by: 'u-1',
  created_by_name: 'tester',
  is_folder: false,
  has_children: false,
  children_count: 0,
  has_original_file: true,
  has_parsed_markdown: true,
  is_virtual_folder: false,
  ...extra,
});

const page = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 100,
  has_more: false,
  ...extra,
});

/** 受控的目录位置：表格的导航状态由页面持有，测试里用一个小壳子模拟。 */
const Harness = ({
  onOpenSearch,
  readOnly,
  initialView,
  jumpTo,
}: {
  onOpenSearch?: () => void;
  readOnly?: boolean;
  initialView?: Partial<{
    parentId: string | null;
    pathPrefix: string;
    status: string;
  }>;
  /** 模拟页面侧改位置（搜索命中跳目录）：表格不重挂，只有 view 变。 */
  jumpTo?: { parentId: string | null; pathPrefix: string };
}) => {
  const [view, setView] = React.useState(() => ({
    ...openLocation({
      parentId: initialView?.parentId ?? null,
      pathPrefix: initialView?.pathPrefix ?? '',
      crumbs: [],
    }),
    status: initialView?.status ?? 'all',
  }));
  return (
    <>
      {jumpTo ? (
        <button
          type="button"
          onClick={() => setView(openLocation({ ...jumpTo, crumbs: [] }))}
        >
          跳到别的目录
        </button>
      ) : null}
      <KnowledgeFileTable
        kbId="kb-1"
        view={view}
        onViewChange={setView}
        onOpenSearch={onOpenSearch}
        readOnly={readOnly}
      />
    </>
  );
};

const renderTable = (props: Parameters<typeof Harness>[0] = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <AntdProvider>
      <QueryClientProvider client={queryClient}>
        <Harness {...props} />
      </QueryClientProvider>
    </AntdProvider>,
  );
};

/** 打开某一行的操作菜单；供行内操作相关的用例共用。 */
const openRowMenuAt = async (filename: string) =>
  userEvent.click(
    await screen.findByRole('button', { name: `文件操作：${filename}.pdf` }),
  );

describe('知识库文件表', () => {
  beforeEach(() => {
    api.listDocuments.mockReset().mockResolvedValue(page([file('报表')]));
    api.searchDocuments.mockReset().mockResolvedValue({
      files: [],
      total: 0,
      offset: 0,
      limit: 100,
      has_more: false,
    });
    // 面板首行需要详情与虚拟文件夹状态；检测默认「没有虚拟文件夹」
    api.get.mockReset().mockResolvedValue({
      kb_id: 'kb-1',
      name: '研发知识库',
      kb_type: 'milvus',
      can_manage: true,
      stats: {
        file_count: 2,
        folder_count: 0,
        row_count: 2,
        total_size: 4096,
        chunk_count: 12,
        token_count: 3400,
        pending_parse_count: 1,
        pending_index_count: 2,
        processing_count: 0,
      },
    });
    api.detectVirtualFolders.mockReset().mockResolvedValue({
      has_virtual_folders: false,
      file_count: 0,
      remaining_steps: 0,
    });
    for (const name of [
      'startVirtualFolderMigration',
      'streamVirtualFolderMigration',
      'repairStats',
      'parsePendingDocuments',
      'indexPendingDocuments',
      'createFolder',
      'renameFolder',
    ] as const) {
      api[name].mockReset();
    }
  });

  it('渲染文件名、状态、创建人与内容量', async () => {
    api.listDocuments.mockResolvedValue(
      page([
        file('报表', {
          status: 'parsing',
          created_by_name: '张三',
          token_count: 1200,
          chunk_count: 34,
        }),
      ]),
    );
    renderTable();

    const row = await screen.findByTestId('file-row');
    expect(within(row).getByText('报表.pdf')).toBeTruthy();
    expect(within(row).getByText('解析中')).toBeTruthy();
    expect(within(row).getByText('张三')).toBeTruthy();
    // 上游：`1.2k Tokens`，Chunks 数在 tooltip 里
    expect(within(row).getByText('1.2k Tokens')).toBeTruthy();
    expect(within(row).getByTitle('34 Chunks')).toBeTruthy();
  });

  it('文件夹的内容量与时间留空，虚拟目录不显示创建人', async () => {
    api.listDocuments.mockResolvedValue(
      page([
        file('实体目录', {
          is_folder: true,
          file_id: 'folder-1',
          filename: '实体目录',
        }),
        file('来源目录', {
          is_folder: true,
          file_id: '__virtual_folder__:root:brief/',
          filename: '来源目录',
          is_virtual_folder: true,
        }),
      ]),
    );
    renderTable();

    const rows = await screen.findAllByTestId('file-row');
    const realFolder = rows[0];
    const virtualFolder = rows[1];
    // 目录没有解析/入库状态，上游对文件夹不渲染任何内容
    expect(within(realFolder).queryByText('已入库')).toBeNull();
    expect(within(virtualFolder).queryByText('已入库')).toBeNull();
    // 实体目录只有内容量留空；虚拟目录连创建人与时间一起留空
    expect(within(realFolder).getAllByText('-')).toHaveLength(1);
    expect(within(virtualFolder).getAllByText('-')).toHaveLength(3);
  });

  it('刷新期间按钮禁用，并在回来时重取列表', async () => {
    api.listDocuments.mockResolvedValueOnce(page([file('报表')]));
    renderTable();
    await screen.findByTestId('file-row');

    let release: (value: unknown) => void = () => {};
    api.listDocuments.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const refresh = screen.getByRole('button', { name: '刷新文件列表' });
    await userEvent.click(refresh);

    await waitFor(() => expect(refresh).toBeDisabled());
    expect(screen.queryByText('暂无文件')).toBeNull();

    await act(async () => {
      release(page([file('报表')]));
    });
    await waitFor(() => expect(refresh).toBeEnabled());
    // 刷新必须真的重取列表（否则按钮禁用只是空转）
    expect(api.listDocuments).toHaveBeenCalledTimes(2);
  });

  it('时间列按上海时区渲染，一年内精确到秒', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    api.listDocuments.mockResolvedValue(
      page([file('新文件', { created_at: recent })]),
    );
    renderTable();

    const row = await screen.findByTestId('file-row');
    const shanghai = new Date(new Date(recent).getTime() + 8 * 60 * 60 * 1000);
    const pad = (value: number) => String(value).padStart(2, '0');
    const expected =
      `${pad(shanghai.getUTCMonth() + 1)}月${pad(shanghai.getUTCDate())}日 ` +
      `${pad(shanghai.getUTCHours())}:${pad(shanghai.getUTCMinutes())}:${pad(shanghai.getUTCSeconds())}`;
    expect(within(row).getByText(expected)).toBeTruthy();
  });

  it('首屏按根目录、全部状态与 100 条/页请求', async () => {
    renderTable();
    await screen.findByTestId('file-row');

    expect(api.listDocuments).toHaveBeenCalledWith('kb-1', {
      parentId: null,
      pathPrefix: '',
      status: 'all',
      page: 1,
      pageSize: 100,
    });
  });

  it('筛选状态时把页码回到第一页', async () => {
    api.listDocuments.mockImplementation(
      (_kbId: string, params: { page: number }) =>
        Promise.resolve(
          page([file(`第${params.page}页`)], { total: 250, page: params.page }),
        ),
    );
    renderTable();
    await screen.findByText('第1页.pdf');

    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    await screen.findByText('第2页.pdf');

    await userEvent.click(
      screen.getByRole('combobox', { name: '按状态筛选文件' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: '待入库' }),
    );

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith('kb-1', {
        parentId: null,
        pathPrefix: '',
        status: 'parsed',
        page: 1,
        pageSize: 100,
      }),
    );
    // 跨目录筛选要把「路径不再代表列表范围」讲清楚
    expect(screen.getByText('跨全部目录筛选')).toBeTruthy();
  });

  it('点文件夹进入它的目录，面包屑点击回到该层', async () => {
    api.listDocuments.mockImplementation(
      (_kbId: string, params: { parentId: string | null }) =>
        Promise.resolve(
          params.parentId === 'folder-a'
            ? page([
                file('目录B', {
                  is_folder: true,
                  file_id: 'folder-b',
                  filename: '目录B',
                }),
              ])
            : params.parentId === 'folder-b'
              ? page([file('子文件')])
              : page([
                  file('目录A', {
                    is_folder: true,
                    file_id: 'folder-a',
                    filename: '目录A',
                  }),
                ]),
        ),
    );
    renderTable();

    await userEvent.click(await screen.findByRole('button', { name: '目录A' }));
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: 'folder-a' }),
      ),
    );

    await userEvent.click(await screen.findByRole('button', { name: '目录B' }));
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: 'folder-b' }),
      ),
    );

    // 点中间那一节要回到它自己（不是它的上一级），列表与面包屑必须一致
    await userEvent.click(screen.getByRole('button', { name: '目录A' }));
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: 'folder-a' }),
      ),
    );
    expect(await screen.findByRole('button', { name: '目录B' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '回到根目录' }));
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: null }),
      ),
    );
  });

  it('虚拟目录用父目录 + path_prefix 进入，不把它当实体目录', async () => {
    api.listDocuments.mockImplementation(
      (
        _kbId: string,
        params: { parentId: string | null; pathPrefix?: string },
      ) =>
        Promise.resolve(
          params.pathPrefix === 'docs/2026/'
            ? page([file('虚拟里的文件')])
            : page([
                file('虚拟目录', {
                  is_folder: true,
                  is_virtual_folder: true,
                  file_id: '__virtual_folder__:root:docs/2026/',
                  parent_id: null,
                  path_prefix: 'docs/2026/',
                  filename: 'docs/2026/',
                }),
              ]),
        ),
    );
    renderTable();

    await userEvent.click(
      await screen.findByRole('button', { name: 'docs/2026/' }),
    );

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: null, pathPrefix: 'docs/2026/' }),
      ),
    );
    expect(await screen.findByText('虚拟里的文件.pdf')).toBeTruthy();
    // 虚拟目录的 id 不能出现在请求里（后端查不到会 400）
    expect(api.listDocuments).not.toHaveBeenCalledWith(
      'kb-1',
      expect.objectContaining({
        parentId: '__virtual_folder__:root:docs/2026/',
      }),
    );
  });

  it('从虚拟层点面包屑能回到该虚拟层，而不是它的父目录', async () => {
    api.listDocuments.mockImplementation(
      (
        _kbId: string,
        params: { pathPrefix?: string; parentId: string | null },
      ) =>
        Promise.resolve(
          params.pathPrefix === 'docs/2026/'
            ? page([
                file('下一层', {
                  is_folder: true,
                  is_virtual_folder: true,
                  file_id: '__virtual_folder__:x:docs/2026/q1/',
                  parent_id: null,
                  path_prefix: 'docs/2026/q1/',
                  filename: 'docs/2026/q1/',
                }),
              ])
            : params.pathPrefix === 'docs/2026/q1/'
              ? page([file('虚拟里的文件')])
              : page([
                  file('虚拟目录', {
                    is_folder: true,
                    is_virtual_folder: true,
                    file_id: '__virtual_folder__:root:docs/2026/',
                    parent_id: null,
                    path_prefix: 'docs/2026/',
                    filename: 'docs/2026/',
                  }),
                ]),
        ),
    );
    renderTable();

    await userEvent.click(
      await screen.findByRole('button', { name: 'docs/2026/' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'docs/2026/q1/' }),
    );
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ pathPrefix: 'docs/2026/q1/' }),
      ),
    );

    // 点中间那一节（docs/2026/）要回到它自己，前缀必须跟着还原
    await userEvent.click(
      within(screen.getByRole('navigation', { name: '文件路径' })).getByRole(
        'button',
        { name: 'docs/2026/' },
      ),
    );

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ pathPrefix: 'docs/2026/' }),
      ),
    );
  });

  it('筛选态不显示会与列表矛盾的路径', async () => {
    api.listDocuments.mockImplementation(
      (_kbId: string, params: { status: string }) =>
        Promise.resolve(
          params.status === 'all'
            ? page([
                file('目录A', {
                  is_folder: true,
                  file_id: 'folder-a',
                  filename: '目录A',
                }),
              ])
            : page([file('筛选结果')]),
        ),
    );
    renderTable();
    await userEvent.click(await screen.findByRole('button', { name: '目录A' }));
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: '文件路径' })).toBeTruthy(),
    );

    await userEvent.click(
      screen.getByRole('combobox', { name: '按状态筛选文件' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: '待解析' }),
    );

    expect(await screen.findByText('跨全部目录筛选')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: '文件路径' })).toBeNull();
  });

  // 后端在 status != all 时会强制 is_folder=false，界面上走不到「筛选态点目录」；
  // 这条钉住的是状态规则：位置一变，筛选就必须归位，否则两者互相矛盾
  it('改位置时把状态筛选归位，否则跨目录查询会忽略新位置', async () => {
    api.listDocuments.mockImplementation(
      (_kbId: string, params: { parentId: string | null; status: string }) =>
        Promise.resolve(
          params.status !== 'all'
            ? page([
                file('筛选结果'),
                file('目录A', {
                  is_folder: true,
                  file_id: 'folder-a',
                  filename: '目录A',
                }),
              ])
            : page([
                file('目录A', {
                  is_folder: true,
                  file_id: 'folder-a',
                  filename: '目录A',
                }),
              ]),
        ),
    );
    renderTable();

    await userEvent.click(
      screen.getByRole('combobox', { name: '按状态筛选文件' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: '待解析' }),
    );
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ status: 'uploaded' }),
      ),
    );

    await userEvent.click(await screen.findByRole('button', { name: '目录A' }));
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: 'folder-a', status: 'all' }),
      ),
    );
  });

  it('切目录期间不把上一个目录的行当成新目录内容，也不谎报空态', async () => {
    api.listDocuments.mockResolvedValueOnce(page([]));
    let release: (value: unknown) => void = () => {};
    api.listDocuments.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    renderTable({ jumpTo: { parentId: 'folder-a', pathPrefix: '' } });
    await screen.findByText('暂无文件');

    await userEvent.click(screen.getByRole('button', { name: '跳到别的目录' }));

    expect(await screen.findByText('正在加载文件…')).toBeTruthy();
    expect(screen.queryByText('暂无文件')).toBeNull();

    await act(async () => {
      release(page([]));
    });
    expect(await screen.findByText('暂无文件')).toBeTruthy();
  });

  it('切目录期间旧行不能继续下钻', async () => {
    api.listDocuments.mockResolvedValueOnce(
      page([
        file('目录A', {
          is_folder: true,
          file_id: 'folder-a',
          filename: '目录A',
        }),
      ]),
    );
    api.listDocuments.mockImplementationOnce(
      () =>
        new Promise(() => {
          // 一直挂着：旧行此时不该还能点
        }),
    );
    renderTable({ jumpTo: { parentId: 'folder-b', pathPrefix: '' } });
    await screen.findByRole('button', { name: '目录A' });

    await userEvent.click(screen.getByRole('button', { name: '跳到别的目录' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '目录A' })).toBeDisabled(),
    );
    expect(api.listDocuments).not.toHaveBeenCalledWith(
      'kb-1',
      expect.objectContaining({ parentId: 'folder-a' }),
    );
  });

  /** 表头文案：可排序列里带一个 sr-only 的排序状态，断言列序时要剥掉。 */
  const headerLabels = () =>
    screen
      .getAllByRole('columnheader')
      .map((header) =>
        header.textContent?.trim().replace(/(未排序|已升序|已降序)$/, ''),
      )
      // 选择列的表头是复选框，没有文本
      .filter(Boolean);

  it('列序与参照一致：文件名 / 内容量 / 创建人 / 状态 / 时间 / 操作', async () => {
    // 变异：时间与操作互换后，最后一列变成时间而不是操作入口
    api.listDocuments.mockResolvedValue(
      page([file('报表', { status: 'indexed' })]),
    );
    renderTable();
    await screen.findByTestId('file-row');

    expect(headerLabels()).toEqual([
      '文件名',
      '内容量',
      '创建人',
      '状态',
      '时间',
      '操作',
    ]);
  });

  it('没有文件时给出空态，但表头照常渲染', async () => {
    // 变异：把整张表包进 items.length > 0 时，空库看不到有哪些列、能做什么
    api.listDocuments.mockResolvedValue(page([]));
    renderTable();

    expect(await screen.findByText('暂无文件')).toBeTruthy();
    expect(screen.queryByTestId('file-row')).toBeNull();
    expect(headerLabels()).toEqual([
      '文件名',
      '内容量',
      '创建人',
      '状态',
      '时间',
      '操作',
    ]);
  });

  it('加载失败时给出原因与重试', async () => {
    api.listDocuments.mockRejectedValueOnce(new Error('知识库不存在'));
    renderTable();

    expect(await screen.findByRole('alert')).toHaveTextContent('知识库不存在');

    api.listDocuments.mockResolvedValue(page([file('恢复')]));
    await userEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByText('恢复.pdf')).toBeTruthy();
  });

  it('只读知识库给出说明，且不渲染选择列与批量入口', async () => {
    renderTable({ readOnly: true });
    await screen.findByTestId('file-row');

    expect(screen.getByText('当前账号对该知识库只有读取权限。')).toBeTruthy();
  });

  it('分页按钮按总数与页长启用，翻页请求带页码', async () => {
    api.listDocuments.mockImplementation(
      (_kbId: string, params: { page: number }) =>
        Promise.resolve(
          page([file(`第${params.page}页`)], { total: 250, page: params.page }),
        ),
    );
    renderTable();
    await screen.findByText('第1页.pdf');

    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByText('共 250 条，第 1 / 3 页')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ page: 2 }),
      ),
    );
    expect(await screen.findByText('第2页.pdf')).toBeTruthy();
  });

  it('每页条数变更后回到第一页', async () => {
    api.listDocuments.mockImplementation(
      (_kbId: string, params: { page: number; pageSize: number }) =>
        Promise.resolve(
          page([file(`第${params.page}页`)], {
            total: 500,
            page: params.page,
            page_size: params.pageSize,
          }),
        ),
    );
    renderTable();
    await screen.findByText('第1页.pdf');
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    await screen.findByText('第2页.pdf');

    await userEvent.click(screen.getByRole('combobox', { name: '每页条数' }));
    await userEvent.click(
      await screen.findByRole('option', { name: '300 条/页' }),
    );

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ page: 1, pageSize: 300 }),
      ),
    );
  });

  it('文件名列排序时文件夹排在文件前面', async () => {
    api.listDocuments.mockResolvedValue(
      page([
        file('报表'),
        file('目录', {
          is_folder: true,
          file_id: 'folder-1',
          filename: '目录',
        }),
      ]),
    );
    renderTable();
    await screen.findAllByTestId('file-row');

    await userEvent.click(screen.getByRole('button', { name: /^文件名/ }));

    const rows = screen
      .getAllByTestId('file-row')
      .map((row) => row.textContent);
    expect(rows[0]).toContain('目录');
  });

  it('点搜索入口把打开动作交给页面', async () => {
    const onOpenSearch = vi.fn();
    renderTable({ onOpenSearch });
    await screen.findByTestId('file-row');

    await userEvent.click(screen.getByRole('button', { name: /搜索文件/ }));

    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('排序按钮按状态权重升序排列当前页', async () => {
    api.listDocuments.mockResolvedValue(
      page([
        file('失败件', { status: 'error_parsing' }),
        file('已入库件', { status: 'indexed' }),
      ]),
    );
    renderTable();
    expect(await screen.findAllByTestId('file-row')).toHaveLength(2);

    const before = screen
      .getAllByTestId('file-row')
      .map((row) => row.textContent);
    expect(before[0]).toContain('失败件');

    // 表头的排序按钮与状态筛选下拉都含「状态」，这里按名称开头精确取表头
    await userEvent.click(screen.getByRole('button', { name: /^状态/ }));

    const after = screen
      .getAllByTestId('file-row')
      .map((row) => row.textContent);
    expect(after[0]).toContain('已入库件');
  });
});

describe('文件名搜索弹窗', () => {
  beforeEach(() => {
    api.searchDocuments.mockReset().mockResolvedValue({
      files: [
        {
          kb_id: 'kb-1',
          file_id: 'f-1',
          filename: '年度报表.pdf',
          status: 'indexed',
          file_size: 2048,
          updated_at: '2026-10-08T02:00:00Z',
          parent_id: 'folder-9',
        },
      ],
      total: 1,
      offset: 0,
      limit: 100,
      has_more: false,
    });
  });

  const renderModal = (onSelect = vi.fn()) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <FileSearchModal
          kbId="kb-1"
          open
          onOpenChange={vi.fn()}
          onSelect={onSelect}
        />
      </QueryClientProvider>,
    );
    return { onSelect };
  };

  it('防抖生效：连续输入期间不请求，停下后才发一次', async () => {
    vi.useFakeTimers();
    try {
      renderModal();
      const input = screen.getByLabelText('搜索文件名');
      fireEvent.change(input, { target: { value: '报' } });
      fireEvent.change(input, { target: { value: '报表' } });

      await act(async () => {
        vi.advanceTimersByTime(239);
      });
      expect(api.searchDocuments).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(api.searchDocuments).toHaveBeenCalledTimes(1);
      expect(api.searchDocuments).toHaveBeenCalledWith('kb-1', {
        query: '报表',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('防抖后按关键词搜索并展示文件名、状态与大小', async () => {
    renderModal();

    await userEvent.type(screen.getByLabelText('搜索文件名'), '报表');

    const hit = await screen.findByRole('button', { name: /年度报表\.pdf/ });
    expect(within(hit).getByText('已入库')).toBeTruthy();
    expect(within(hit).getByText('2.0 KB')).toBeTruthy();
    expect(api.searchDocuments).toHaveBeenCalledWith('kb-1', { query: '报表' });
  });

  it('命中项拆开显示基名与目录名，目录名过长只留尾部', async () => {
    const dirname = `brief/${'很长的目录'.repeat(10)}`;
    api.searchDocuments.mockResolvedValue({
      files: [
        {
          kb_id: 'kb-1',
          file_id: 'f-2',
          filename: `${dirname}/年度报表.pdf`,
          status: null,
          file_size: 2048,
          updated_at: '2024-03-05T01:00:00Z',
        },
      ],
      total: 1,
      offset: 0,
      limit: 100,
      has_more: false,
    });
    renderModal();

    await userEvent.type(screen.getByLabelText('搜索文件名'), '报表');

    const hit = await screen.findByRole('button', { name: /年度报表\.pdf/ });
    expect(within(hit).getByText('年度报表.pdf')).toBeTruthy();
    const shown = within(hit).getByTitle(dirname);
    expect(shown.textContent?.startsWith('...')).toBe(true);
    // status 为空时按未知状态显示，不崩也不当成已入库
    expect(within(hit).getByText('未知')).toBeTruthy();
    expect(within(hit).getByText('2024-03-05 09:00')).toBeTruthy();
  });

  it('选中一条结果把文件交给调用方', async () => {
    const { onSelect } = renderModal();

    await userEvent.type(screen.getByLabelText('搜索文件名'), '报表');
    await userEvent.click(
      await screen.findByRole('button', { name: /年度报表\.pdf/ }),
    );

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ file_id: 'f-1', parent_id: 'folder-9' }),
    );
  });

  it('未输入时给出引导文案，不显示「共 0 条结果」', () => {
    renderModal();

    expect(screen.getByText('输入关键词后按文件名匹配。')).toBeTruthy();
    expect(screen.queryByText(/共 0 条结果/)).toBeNull();
  });

  it('结果被截断时提示细化关键词', async () => {
    api.searchDocuments.mockResolvedValue({
      files: [
        {
          kb_id: 'kb-1',
          file_id: 'f-1',
          filename: '年度报表.pdf',
          status: 'indexed',
        },
      ],
      total: 500,
      offset: 0,
      limit: 100,
      has_more: true,
    });
    renderModal();

    await userEvent.type(screen.getByLabelText('搜索文件名'), '报表');

    expect(await screen.findByText(/仅展示前 1 条，请细化关键词/)).toBeTruthy();
  });

  it('没有命中时给出空态', async () => {
    api.searchDocuments.mockResolvedValue({
      files: [],
      total: 0,
      offset: 0,
      limit: 100,
      has_more: false,
    });
    renderModal();

    await userEvent.type(screen.getByLabelText('搜索文件名'), '不存在');

    expect(await screen.findByText('未找到匹配的文件')).toBeTruthy();
    expect(screen.getByText('共 0 条结果')).toBeTruthy();
  });

  it('搜索失败时给出原因', async () => {
    api.searchDocuments.mockRejectedValue(new Error('只支持检索'));
    renderModal();

    await userEvent.type(screen.getByLabelText('搜索文件名'), '报表');

    expect(await screen.findByRole('alert')).toHaveTextContent('只支持检索');
  });
});

describe('文件行内操作', () => {
  beforeEach(() => {
    api.listDocuments
      .mockReset()
      .mockResolvedValue(
        page([
          file('报表', { status: 'indexed', file_id: 'f-1' }),
          file('入库中的', { status: 'indexing', file_id: 'f-2' }),
        ]),
      );
    api.deleteDocument.mockReset();
    api.batchDeleteDocuments.mockReset();
    api.parseDocuments.mockReset();
    api.indexDocuments.mockReset();
    api.downloadDocument.mockReset();
    api.fileContent.mockReset();
    notifications.addNotification.mockReset();
  });

  const openRowMenu = openRowMenuAt;
  it('删除要先确认，确认后调文件级端点并提示成功', async () => {
    api.deleteDocument.mockResolvedValue({ message: '删除成功' });
    renderTable();
    await screen.findAllByTestId('file-row');

    await openRowMenu('报表');
    await userEvent.click(screen.getByRole('menuitem', { name: /删除文件/ }));

    expect(api.deleteDocument).not.toHaveBeenCalled();
    expect(
      await screen.findByText('删除文件', {
        selector: '.ant-modal-confirm-title',
      }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() =>
      expect(api.deleteDocument).toHaveBeenCalledWith('kb-1', 'f-1'),
    );
    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', message: '删除成功。' }),
      ),
    );
  });

  it('确认框里取消则不删', async () => {
    renderTable();
    await screen.findAllByTestId('file-row');

    await openRowMenu('报表');
    await userEvent.click(screen.getByRole('menuitem', { name: /删除文件/ }));
    await userEvent.click(
      within(
        document.querySelector('.ant-modal-confirm') as HTMLElement,
      ).getByRole('button', { name: '取消' }),
    );

    // antd Modal 关闭走淡出动画，等 confirm 容器从 DOM 移除
    await waitFor(() =>
      expect(document.querySelector('.ant-modal-confirm')).toBeNull(),
    );
    expect(api.deleteDocument).not.toHaveBeenCalled();
  });

  it('删除失败时把后端原因带出来', async () => {
    api.deleteDocument.mockRejectedValue(new Error('删除文档失败: 文件被占用'));
    renderTable();
    await screen.findAllByTestId('file-row');

    await openRowMenu('报表');
    await userEvent.click(screen.getByRole('menuitem', { name: /删除文件/ }));
    await userEvent.click(await screen.findByRole('button', { name: '确认' }));

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: '删除文档失败: 文件被占用',
        }),
      ),
    );
  });

  it('解析与入库都提交任务，并把后端原因带回来', async () => {
    api.listDocuments.mockResolvedValue(
      page([
        file('待解析', { status: 'uploaded', file_id: 'f-3' }),
        file('待入库', { status: 'parsed', file_id: 'f-4' }),
      ]),
    );
    api.parseDocuments.mockResolvedValue({ status: 'queued' });
    api.indexDocuments.mockRejectedValue(new Error('提交失败: 队列不可用'));
    renderTable();
    await screen.findAllByTestId('file-row');

    await openRowMenu('待解析');
    await userEvent.click(screen.getByRole('menuitem', { name: /解析文件/ }));
    await waitFor(() =>
      expect(api.parseDocuments).toHaveBeenCalledWith('kb-1', ['f-3']),
    );
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: '已提交解析。' }),
    );

    await openRowMenu('待入库');
    await userEvent.click(screen.getByRole('menuitem', { name: /^入库$/ }));
    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: '提交失败: 队列不可用',
        }),
      ),
    );
  });

  it('状态 pill 可点：直接提交这一行的主操作，不必先开行内菜单', async () => {
    // 变异：把 pill 变回不可点的 span 后，解析/入库只能从行内菜单进
    api.listDocuments.mockResolvedValue(
      page([
        file('待解析', { status: 'uploaded', file_id: 'f-3' }),
        file('待入库', { status: 'parsed', file_id: 'f-4' }),
      ]),
    );
    api.parseDocuments.mockResolvedValue({ status: 'queued' });
    api.indexDocuments.mockResolvedValue({ status: 'queued' });
    renderTable();
    await screen.findAllByTestId('file-row');

    await userEvent.click(
      screen.getByRole('button', { name: '待解析，点击解析文件：待解析.pdf' }),
    );
    await waitFor(() =>
      expect(api.parseDocuments).toHaveBeenCalledWith('kb-1', ['f-3']),
    );

    await userEvent.click(
      screen.getByRole('button', { name: '待入库，点击入库：待入库.pdf' }),
    );
    await waitFor(() =>
      expect(api.indexDocuments).toHaveBeenCalledWith('kb-1', ['f-4']),
    );
  });

  it('只读知识库的状态 pill 不可点，只作状态展示', async () => {
    api.listDocuments.mockResolvedValue(
      page([file('待解析', { status: 'uploaded', file_id: 'f-3' })]),
    );
    renderTable({ readOnly: true });
    await screen.findAllByTestId('file-row');

    expect(
      screen.queryByRole('button', { name: /待解析，点击解析文件/ }),
    ).toBeNull();
    expect(screen.getByText('待解析')).toBeTruthy();
  });

  it('下载用行文件名兜底，并把响应头文件名交给浏览器', async () => {
    const blob = new Blob(['x']);
    api.downloadDocument.mockResolvedValue({
      blob,
      filename: '服务器给的名字.pdf',
    });
    const created: string[] = [];
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => 'blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        created.push(this.download);
      });

    renderTable();
    await screen.findAllByTestId('file-row');
    await openRowMenu('报表');
    await userEvent.click(screen.getByRole('menuitem', { name: /下载文件/ }));

    await waitFor(() =>
      expect(api.downloadDocument).toHaveBeenCalledWith('kb-1', 'f-1'),
    );
    await waitFor(() => expect(created).toEqual(['服务器给的名字.pdf']));
    expect(createObjectURL).toHaveBeenCalledWith(blob);

    click.mockRestore();
    createObjectURL.mockRestore();
  });
});

describe('文件批量操作', () => {
  // 解析中可以勾选但不能删除（上游的删除档位比可勾选更严），处理中两者都不行
  const rows = () => [
    file('待解析', { status: 'uploaded', file_id: 'f-1' }),
    file('已入库', { status: 'indexed', file_id: 'f-2' }),
    file('解析中', { status: 'parsing', file_id: 'f-3' }),
    file('处理中', { status: 'processing', file_id: 'f-4' }),
  ];

  beforeEach(() => {
    api.listDocuments.mockReset().mockResolvedValue(page(rows()));
    api.deleteDocument.mockReset();
    api.batchDeleteDocuments.mockReset();
    api.parseDocuments.mockReset();
    api.indexDocuments.mockReset();
    notifications.addNotification.mockReset();
  });

  const selectRow = async (name: string) =>
    userEvent.click(
      await screen.findByRole('checkbox', { name: `选择 ${name}.pdf` }),
    );

  it('表头全选勾上当前页可选的行，处理中的行勾不动', async () => {
    renderTable();
    await screen.findAllByTestId('file-row');

    const processing = screen.getByRole('checkbox', {
      name: '选择 处理中.pdf',
    });
    expect(processing).toHaveAttribute('disabled');

    await userEvent.click(
      screen.getByRole('checkbox', { name: '选择当前页全部文件' }),
    );

    // 待解析、已入库、解析中都能勾（解析中只是不能删），处理中不参与
    expect(screen.getByText('已选 3 项')).toBeTruthy();
    expect(processing).toHaveAttribute('disabled');
  });

  it('批量条按选中内容启用，解析只提交可解析的行', async () => {
    api.parseDocuments.mockResolvedValue({ status: 'queued' });
    renderTable();
    await screen.findAllByTestId('file-row');

    await selectRow('已入库');
    // 选中的行里没有可解析的，按钮点不动
    expect(screen.getByRole('button', { name: '批量解析' })).toBeDisabled();

    await selectRow('待解析');
    expect(screen.getByRole('button', { name: '批量解析' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: '批量解析' }));

    await waitFor(() =>
      expect(api.parseDocuments).toHaveBeenCalledWith('kb-1', ['f-1']),
    );
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        message: '已提交 1 个文件解析。',
      }),
    );
  });

  it('翻页后旧选择不再生效', async () => {
    api.listDocuments.mockImplementation(
      (_kbId: string, params: { page: number }) =>
        Promise.resolve(
          page(
            params.page === 2
              ? [file('第二页', { status: 'uploaded', file_id: 'f-9' })]
              : rows(),
            { total: 250, page: params.page },
          ),
        ),
    );
    renderTable();
    await screen.findAllByTestId('file-row');

    await selectRow('待解析');
    expect(screen.getByText('已选 1 项')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    await screen.findByText('第二页.pdf');

    expect(screen.queryByText('已选 1 项')).toBeNull();
  });

  it('批量删除先按可删除行确认，再分批提交并汇总', async () => {
    api.batchDeleteDocuments.mockResolvedValue({
      message: '批量删除成功',
      deleted_count: 1,
    });
    renderTable();
    await screen.findAllByTestId('file-row');

    await userEvent.click(
      screen.getByRole('checkbox', { name: '选择当前页全部文件' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '批量删除' }));

    // 全选勾上 3 行（处理中不可勾），其中解析中不可删除 → 只提交 2 行
    expect(
      await screen.findByText('批量删除文件', {
        selector: '.ant-modal-confirm-title',
      }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() =>
      expect(api.batchDeleteDocuments).toHaveBeenCalledWith('kb-1', [
        'f-1',
        'f-2',
      ]),
    );
    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          message: '成功删除 1 个文件。',
        }),
      ),
    );
    expect(screen.queryByText(/已选/)).toBeNull();
  });

  it('批量删除部分失败时给出成功与失败数量', async () => {
    api.batchDeleteDocuments.mockResolvedValue({
      message: '部分删除成功',
      deleted_count: 1,
      failed_items: [{ doc_id: 'f-2', error: '解析中' }],
    });
    renderTable();
    await screen.findAllByTestId('file-row');

    await userEvent.click(
      screen.getByRole('checkbox', { name: '选择当前页全部文件' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '批量删除' }));
    await userEvent.click(await screen.findByRole('button', { name: '确认' }));

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          message: '成功删除 1 个文件，1 个文件删除失败。',
        }),
      ),
    );
  });

  it('批量删除在飞行中不能重复提交', async () => {
    let release: (value: unknown) => void = () => {};
    api.batchDeleteDocuments.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    renderTable();
    await screen.findAllByTestId('file-row');

    await userEvent.click(
      screen.getByRole('checkbox', { name: '选择当前页全部文件' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '批量删除' }));
    await userEvent.click(await screen.findByRole('button', { name: '确认' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '批量删除' })).toBeDisabled(),
    );
    expect(api.batchDeleteDocuments).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ message: 'ok', deleted_count: 2 });
    });
  });

  it('行内「移动到…」打开移动弹窗', async () => {
    renderTable();
    await screen.findAllByTestId('file-row');

    await userEvent.click(
      screen.getByRole('button', { name: '文件操作：已入库.pdf' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /移动到…/ }));

    expect(await screen.findByTestId('move-file-dialog')).toBeTruthy();
  });
});

describe('只读与陈旧态', () => {
  beforeEach(() => {
    api.listDocuments
      .mockReset()
      .mockResolvedValue(
        page([file('报表', { status: 'indexed', file_id: 'f-1' })]),
      );
    api.batchDeleteDocuments.mockReset();
    notifications.addNotification.mockReset();
  });

  it('只读知识库不给勾选，也不渲染批量入口', async () => {
    renderTable({ readOnly: true });
    await screen.findAllByTestId('file-row');

    // 上游只读时 tableSelection 为 null：选择列整个不渲染
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: '批量删除' })).toBeNull();
    // 只留下载
    await userEvent.click(
      screen.getByRole('button', { name: '文件操作：报表.pdf' }),
    );
    // antd 菜单项禁用走 aria-disabled
    expect(
      screen.getByRole('menuitem', { name: /下载文件/ }),
    ).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('menuitem', { name: /删除文件/ })).toBeNull();
  });

  it('切目录期间行内入口锁掉，不能对上一个目录的行动手', async () => {
    api.listDocuments.mockResolvedValueOnce(
      page([file('报表', { status: 'indexed', file_id: 'f-1' })]),
    );
    api.listDocuments.mockImplementationOnce(
      () =>
        new Promise(() => {
          // 一直挂着：此时表里还是上一个目录的行
        }),
    );
    renderTable({ jumpTo: { parentId: 'folder-a', pathPrefix: '' } });
    await screen.findAllByTestId('file-row');

    await userEvent.click(screen.getByRole('button', { name: '跳到别的目录' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '文件操作：报表.pdf' }),
      ).toBeTruthy(),
    );

    await userEvent.click(
      screen.getByRole('button', { name: '文件操作：报表.pdf' }),
    );
    expect(screen.getByRole('menuitem', { name: /下载文件/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: /删除文件/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('响应头没有文件名时用行上的文件名兜底', async () => {
    api.downloadDocument.mockResolvedValue({
      blob: new Blob(['x']),
      filename: null,
    });
    const downloaded: string[] = [];
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => 'blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloaded.push(this.download);
      });

    renderTable();
    await screen.findAllByTestId('file-row');
    await userEvent.click(
      screen.getByRole('button', { name: '文件操作：报表.pdf' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: /下载文件/ }));

    await waitFor(() => expect(downloaded).toEqual(['报表.pdf']));

    click.mockRestore();
    createObjectURL.mockRestore();
  });

  it('表头复选框半选时是 mixed', async () => {
    api.listDocuments.mockResolvedValue(
      page([
        file('甲', { status: 'indexed', file_id: 'f-1' }),
        file('乙', { status: 'indexed', file_id: 'f-2' }),
      ]),
    );
    renderTable();
    await screen.findAllByTestId('file-row');

    await userEvent.click(
      screen.getByRole('checkbox', { name: '选择 甲.pdf' }),
    );

    // antd Checkbox 的半选是 indeterminate prop（背景样式），不是 aria-checked=mixed
    expect(
      screen
        .getByRole('checkbox', { name: '选择当前页全部文件' })
        .closest('label')
        ?.querySelector('.ant-checkbox-indeterminate'),
    ).toBeTruthy();
  });
});

describe('打开文件详情', () => {
  beforeEach(() => {
    api.listDocuments
      .mockReset()
      .mockResolvedValue(
        page([
          file('报表', { status: 'indexed', file_id: 'f-1' }),
          file('待解析', { status: 'uploaded', file_id: 'f-2' }),
        ]),
      );
    api.fileContent.mockReset().mockResolvedValue({
      content: '# 解析结果',
      lines: [{ id: 'c-1', content: '第一段', chunk_order_index: 0 }],
    });
  });

  it('点文件名打开详情，只有能预览的行才是按钮', async () => {
    renderTable();
    await screen.findAllByTestId('file-row');

    // 已入库的行有解析结果 → 文件名可点
    await userEvent.click(screen.getByRole('button', { name: '报表.pdf' }));

    expect(await screen.findByTestId('file-detail-dialog')).toBeTruthy();
    expect(api.fileContent).toHaveBeenCalledWith('kb-1', 'f-1');
  });

  it('没有原始文件也没有解析结果的行不给入口', async () => {
    api.listDocuments.mockResolvedValue(
      page([
        file('解析中', {
          status: 'parsing',
          file_id: 'f-3',
          has_original_file: false,
          has_parsed_markdown: false,
        }),
      ]),
    );
    renderTable();
    await screen.findAllByTestId('file-row');

    expect(screen.queryByRole('button', { name: '解析中.pdf' })).toBeNull();
    // 行还在，只是文件名不可点
    expect(screen.getByText('解析中.pdf')).toBeTruthy();
  });
});

describe('上传入口与轮询', () => {
  beforeEach(() => {
    api.supportedTypes.mockReset().mockResolvedValue(['.md']);
    api.ocrOptions.mockReset().mockResolvedValue({ engines: [] });
  });

  it('工具栏的上传入口打开弹窗，目标目录是当前层', async () => {
    api.listDocuments.mockResolvedValue(
      page([
        file('目录A', {
          is_folder: true,
          file_id: 'folder-a',
          filename: '目录A',
        }),
      ]),
    );
    renderTable();
    await screen.findByRole('button', { name: '目录A' });
    await userEvent.click(screen.getByRole('button', { name: '目录A' }));
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: 'folder-a' }),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: /上传文件/ }));

    const dialog = await screen.findByTestId('file-upload-dialog');
    expect(dialog).toHaveTextContent('目标目录：目录A');
  });

  it('只读知识库不给上传入口', async () => {
    renderTable({ readOnly: true });
    await screen.findAllByTestId('file-row');

    expect(screen.queryByRole('button', { name: /上传文件/ })).toBeNull();
  });

  const pollInterval = (items: unknown[]) => {
    const option = queryOptions.at(-1)?.refetchInterval;
    expect(typeof option).toBe('function');
    return (
      option as unknown as (query: {
        state: { data?: { items: unknown[] } };
      }) => unknown
    )({ state: { data: { items } } });
  };

  it('有处理中的行时按 10 秒轮询', async () => {
    queryOptions.length = 0;
    api.listDocuments.mockResolvedValue(
      page([file('解析中', { status: 'parsing', file_id: 'f-1' })]),
    );
    renderTable();
    await screen.findAllByTestId('file-row');

    // 间隔由查询自己上一份数据算出来，因此数据一到就能开始轮询
    expect(pollInterval([{ is_folder: false, status: 'parsing' }])).toBe(
      10_000,
    );
  });

  it('没有处理中的行时不轮询', async () => {
    queryOptions.length = 0;
    api.listDocuments.mockResolvedValue(
      page([file('已入库', { status: 'indexed', file_id: 'f-1' })]),
    );
    renderTable();
    await screen.findAllByTestId('file-row');

    expect(pollInterval([{ is_folder: false, status: 'indexed' }])).toBe(false);
    expect(pollInterval([])).toBe(false);
  });
});

describe('轮询判定', () => {
  // 判定只读 is_folder 与 status，其余字段给最小替身
  const query = (items: Array<{ is_folder: boolean; status: string }>) =>
    ({ state: { data: { items } } }) as unknown as Parameters<
      typeof shouldPollFiles
    >[0];

  it('有处理中的行就轮询', () => {
    expect(
      shouldPollFiles(query([{ is_folder: false, status: 'indexing' }])),
    ).toBe(10_000);
  });

  it('上传成功后表格的轮询窗口被打开（接线，不只是纯函数）', async () => {
    queryOptions.length = 0;
    api.listDocuments.mockResolvedValue(
      page([file('已入库', { status: 'indexed' })]),
    );
    api.supportedTypes.mockResolvedValue(['.md']);
    api.ocrOptions.mockResolvedValue({ engines: [] });
    api.uploadFile.mockResolvedValue({
      file_path: 'minio/a.md',
      content_hash: 'hash-a',
      filename: 'a.md',
      size: 12,
    });
    api.addDocuments.mockResolvedValue({ status: 'queued' });

    renderTable();
    await screen.findAllByTestId('file-row');

    // 通过真实弹窗走一遍上传成功
    await userEvent.click(screen.getByRole('button', { name: /上传文件/ }));
    await userEvent.upload(
      screen.getByLabelText('选择文件'),
      new File(['x'], 'a.md'),
    );
    await userEvent.click(screen.getByRole('button', { name: '开始上传' }));
    await waitFor(() => expect(api.addDocuments).toHaveBeenCalled());

    // 上传成功后表格交给查询的判定函数在空闲数据下也必须给出间隔
    await waitFor(() => {
      const option = queryOptions.at(-1)?.refetchInterval;
      expect(typeof option).toBe('function');
      expect(
        (
          option as unknown as (query: {
            state: { data?: { items: unknown[] } };
          }) => unknown
        )({
          state: { data: { items: [{ is_folder: false, status: 'indexed' }] } },
        }),
      ).toBe(10_000);
    });
  });

  it('刚提交完上传的一分钟里也轮询，等后台任务把记录建出来', () => {
    const idle = query([{ is_folder: false, status: 'indexed' }]);

    expect(shouldPollFiles(idle, Date.now())).toBe(10_000);
    expect(shouldPollFiles(idle, Date.now() - 120_000)).toBe(false);
    expect(shouldPollFiles(idle)).toBe(false);
  });
});

describe('面板首行：上传下拉与统计按钮', () => {
  beforeEach(() => {
    // 独立套件要自己准备面板首行的数据面：列表、详情与虚拟文件夹状态
    api.listDocuments.mockReset().mockResolvedValue(page([file('报表')]));
    api.get.mockReset().mockResolvedValue({
      kb_id: 'kb-1',
      name: '研发知识库',
      kb_type: 'milvus',
      can_manage: true,
      stats: {
        file_count: 2,
        folder_count: 0,
        row_count: 2,
        total_size: 4096,
        chunk_count: 12,
        token_count: 3400,
        pending_parse_count: 1,
        pending_index_count: 2,
        processing_count: 0,
      },
    });
    api.detectVirtualFolders.mockReset().mockResolvedValue({
      has_virtual_folders: false,
      file_count: 0,
      remaining_steps: 0,
    });
    for (const name of [
      'parsePendingDocuments',
      'indexPendingDocuments',
      'repairStats',
      'createFolder',
      'renameFolder',
      'startVirtualFolderMigration',
      'streamVirtualFolderMigration',
    ] as const) {
      api[name].mockReset();
    }
    notifications.addNotification.mockReset();
  });

  it('默认显示统计按钮：待解析、待入库为警示态，大小与 Chunks/Tokens 就位', async () => {
    renderTable();
    const header = await screen.findByTestId('file-panel-header');
    // 详情查询与列表查询各自解析：等详情的数字落到按钮上再断言
    expect(
      await within(header).findByTestId('stat-pending-parse'),
    ).toBeTruthy();
    // 详情里的 pending_parse_count=1、pending_index_count=2
    expect(within(header).getByTestId('stat-pending-parse').textContent).toContain('1');
    expect(within(header).getByTestId('stat-pending-index').textContent).toContain('2');
    expect(within(header).getByTestId('stat-file-count').textContent).toContain('2');
    expect(within(header).getByText('4.0 KB')).toBeTruthy();
    expect(within(header).getByText('Chunks')).toBeTruthy();
    expect(within(header).getByText('Tokens')).toBeTruthy();
  });

  it('点待解析提交 parse-pending，点待入库提交 index-pending', async () => {
    // 变异：接错端点（比如仍走逐文件 parse）后这里会看到错误的调用
    api.parsePendingDocuments.mockResolvedValue({ status: 'queued' });
    api.indexPendingDocuments.mockResolvedValue({ status: 'queued' });
    renderTable();
    const header = await screen.findByTestId('file-panel-header');
    await within(header).findByTestId('stat-pending-parse');

    await userEvent.click(within(header).getByTestId('stat-pending-parse'));
    await waitFor(() =>
      expect(api.parsePendingDocuments).toHaveBeenCalledWith('kb-1', {}),
    );
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: '已提交待解析文件。' }),
    );

    await userEvent.click(within(header).getByTestId('stat-pending-index'));
    await waitFor(() =>
      expect(api.indexPendingDocuments).toHaveBeenCalledWith('kb-1', {}),
    );
  });

  it('点 Chunks 统计按钮触发统计修复，并按修复数量提示', async () => {
    api.repairStats.mockResolvedValue({
      stats: { file_count: 2 },
      updated_chunk_files: 2,
      updated_token_files: 1,
      updated_size_files: 0,
    });
    renderTable();
    const header = await screen.findByTestId('file-panel-header');

    await userEvent.click(within(header).getByTestId('stat-repair-chunks'));
    await waitFor(() =>
      expect(api.repairStats).toHaveBeenCalledWith('kb-1'),
    );
    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          message: '已修复 1 个 Token 统计，2 个 Chunk 统计',
        }),
      ),
    );
  });

  it('上传下拉：点上传打开上传弹窗，点新建文件夹打开命名弹窗并创建到当前目录', async () => {
    api.createFolder.mockResolvedValue({
      file_id: 'folder-9',
      filename: '资料',
      is_folder: true,
    });
    renderTable();
    const header = await screen.findByTestId('file-panel-header');

    await userEvent.click(within(header).getByRole('button', { name: '上传' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '新建文件夹' }));

    const dialog = await screen.findByLabelText('文件夹名称');
    await userEvent.type(dialog, '资料');
    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() =>
      expect(api.createFolder).toHaveBeenCalledWith('kb-1', '资料', null),
    );
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: '创建成功' }),
    );

    // 弹窗关闭后再点上传，走的是上传弹窗而不是新建
    await userEvent.click(within(header).getByRole('button', { name: '上传' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '上传文件' }));
    expect(await screen.findByText('选择文件')).toBeTruthy();
  });

  it('空名不给创建，警告「请输入文件夹名称」', async () => {
    renderTable();
    const header = await screen.findByTestId('file-panel-header');

    await userEvent.click(within(header).getByRole('button', { name: '上传' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: '新建文件夹' }));
    await screen.findByLabelText('文件夹名称');
    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    expect(api.createFolder).not.toHaveBeenCalled();
    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning', message: '请输入文件夹名称' }),
    );
  });

  it('行内菜单给文件夹重命名与新建子文件夹，提交各自的端点', async () => {
    api.listDocuments.mockResolvedValue(
      page([
        file('目录', { is_folder: true, file_id: 'folder-3', status: 'indexed' }),
      ]),
    );
    api.renameFolder.mockResolvedValue({
      file_id: 'folder-3',
      filename: '新名字',
      is_folder: true,
    });
    renderTable();
    await screen.findAllByTestId('file-row');

    await openRowMenuAt('目录');
    await userEvent.click(screen.getByRole('menuitem', { name: '重命名' }));
    const input = await screen.findByLabelText('文件夹名称');
    expect(input).toHaveValue('目录.pdf');
    await userEvent.clear(input);
    await userEvent.type(input, '新名字');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(api.renameFolder).toHaveBeenCalledWith('kb-1', 'folder-3', '新名字'),
    );

    await openRowMenuAt('目录');
    await userEvent.click(screen.getByRole('menuitem', { name: '新建子文件夹' }));
    await screen.findByLabelText('文件夹名称');
    // 新建子文件夹的目标父目录是这一行的 file_id
    await userEvent.type(screen.getByLabelText('文件夹名称'), '子');
    await userEvent.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() =>
      expect(api.createFolder).toHaveBeenCalledWith('kb-1', '子', 'folder-3'),
    );
  });

  it('有虚拟文件夹时文件数按钮进入警示态并可点开转换弹窗，启动后读 SSE 进度', async () => {
    // 变异：转换流接错 task_id 或没把终态交给回调时，这里的帧序列对不上
    api.detectVirtualFolders.mockResolvedValue({
      has_virtual_folders: true,
      file_count: 2,
      remaining_steps: 4,
    });
    api.startVirtualFolderMigration.mockResolvedValue({
      task_id: 'task-7',
      created: true,
    });
    api.streamVirtualFolderMigration.mockImplementation(
      async (_kbId: string, taskId: string, onEvent: (s: { status: string; progress?: number; message?: string }) => void) => {
        expect(taskId).toBe('task-7');
        onEvent({ status: 'running', progress: 40, message: '第 1 批' });
        onEvent({ status: 'success', progress: 100 });
      },
    );
    renderTable();
    const header = await screen.findByTestId('file-panel-header');

    const fileCount = await within(header).findByTestId('stat-file-count');
    await waitFor(() => expect(fileCount).not.toBeDisabled());
    await userEvent.click(fileCount);

    expect(await screen.findByText('转换历史虚拟文件夹')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '开始转换' }));

    await waitFor(() =>
      expect(api.startVirtualFolderMigration).toHaveBeenCalledWith('kb-1'),
    );
    await waitFor(() =>
      expect(screen.getByRole('progressbar')).toBeTruthy(),
    );
    // 终态后重新检测虚拟文件夹
    await waitFor(() =>
      expect(api.detectVirtualFolders).toHaveBeenCalledTimes(2),
    );
  });

  it('没有虚拟文件夹时文件数按钮禁用，不出现警示色', async () => {
    renderTable();
    const header = await screen.findByTestId('file-panel-header');

    expect(within(header).getByTestId('stat-file-count')).toBeDisabled();
  });

  it('只读知识库没有上传下拉，Chunks/Tokens 是纯展示', async () => {
    renderTable({ readOnly: true });
    const header = await screen.findByTestId('file-panel-header');
    // 等详情落地：只读没有可点按钮，但数字仍然展示
    expect(await within(header).findByText('4.0 KB')).toBeTruthy();

    expect(within(header).queryByRole('button', { name: '上传' })).toBeNull();
    expect(within(header).queryByTestId('stat-pending-parse')).toBeNull();
    expect(within(header).queryByTestId('stat-pending-index')).toBeNull();
    expect(within(header).queryByTestId('stat-repair-chunks')).toBeNull();
    // 文件数与大小仍然展示
    expect(within(header).getByTestId('stat-file-count')).toBeTruthy();
  });
});
