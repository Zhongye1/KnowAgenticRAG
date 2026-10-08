import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    listDocuments: vi.fn(),
    searchDocuments: vi.fn(),
    queryParams: vi.fn(),
    sampleQuestions: vi.fn(),
    departments: vi.fn(),
    users: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/features/knowledge-base/api/knowledge-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/knowledge-api')
  >('@/features/knowledge-base/api/knowledge-api');
  return {
    ...actual,
    knowledgeApi: {
      ...actual.knowledgeApi,
      get: (...args: unknown[]) => api.get(...args),
      listDocuments: (...args: unknown[]) => api.listDocuments(...args),
      searchDocuments: (...args: unknown[]) => api.searchDocuments(...args),
      getQueryParams: (...args: unknown[]) => api.queryParams(...args),
      listSampleQuestions: (...args: unknown[]) => api.sampleQuestions(...args),
      listDepartments: (...args: unknown[]) => api.departments(...args),
      listUserOptions: (...args: unknown[]) => api.users(...args),
      update: (...args: unknown[]) => api.update(...args),
    },
  };
});

const { KnowledgeBasePage } = await import('@/pages/knowledge-base');

const database = (extra: Record<string, unknown> = {}) => ({
  kb_id: 'kb-1',
  name: '研发知识库',
  description: '内部资料',
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
    pending_index_count: 0,
    processing_count: 0,
  },
  ...extra,
});

const filePage = (items: unknown[] = []) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 100,
  has_more: false,
});

/**
 * 要等防抖查询或渲染整张表加下拉的用例，并行跑整套时单例会长到数秒：
 * 它们自带预算，不依赖全局 `testTimeout`。
 */
const itSlow = (name: string, fn: () => Promise<void>) => it(name, fn, 15000);

const LocationProbe = () => (
  <span data-testid="path">{useLocation().pathname}</span>
);

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/extensions/knowledgebase/kb-1']}>
        <Routes>
          <Route
            path="/extensions/knowledgebase/:kbId"
            element={<KnowledgeBasePage />}
          />
          <Route path="/extensions" element={<span>列表页</span>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('知识库详情页', () => {
  beforeEach(() => {
    api.get.mockReset().mockResolvedValue(database());
    api.listDocuments.mockReset().mockResolvedValue(filePage([]));
    api.queryParams
      .mockReset()
      .mockResolvedValue({ options: [{ key: 'final_top_k', default: 10 }] });
    api.sampleQuestions.mockReset().mockResolvedValue([]);
    api.departments.mockReset().mockResolvedValue([]);
    api.users.mockReset().mockResolvedValue([]);
    api.update.mockReset().mockResolvedValue(undefined);
    api.searchDocuments.mockReset().mockResolvedValue({
      files: [],
      total: 0,
      offset: 0,
      limit: 100,
      has_more: false,
    });
  });

  it('展示名称、类型、描述与统计卡', async () => {
    renderPage();

    expect(await screen.findByText('研发知识库')).toBeTruthy();
    expect(screen.getByText('ARS')).toBeTruthy();
    expect(screen.getByText('内部资料')).toBeTruthy();
    // 待解析 1、文件 2、大小 4.0 KB、Tokens 3400（计数格式化只在过万时折成「万」）
    expect(screen.getByText('待解析').nextElementSibling?.textContent).toBe(
      '1',
    );
    expect(screen.getByText('文件数').nextElementSibling?.textContent).toBe(
      '2',
    );
    expect(screen.getByText('大小').nextElementSibling?.textContent).toBe(
      '4.0 KB',
    );
    expect(screen.getByText('Tokens').nextElementSibling?.textContent).toBe(
      '3400',
    );
  });

  it('未落地的分区给出占位说明而不是空白', async () => {
    renderPage();
    await screen.findByText('研发知识库');

    await userEvent.click(screen.getByRole('button', { name: '知识图谱' }));
    expect(screen.getByText('该分区随 S4 接入。')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '评估基准' }));
    expect(screen.getByText('该分区随 S4 接入。')).toBeTruthy();
  });

  it('检索测试分区渲染真实面板', async () => {
    renderPage();
    await screen.findByText('研发知识库');

    await userEvent.click(screen.getByRole('button', { name: '检索测试' }));

    expect(screen.getByLabelText('检索测试查询')).toBeTruthy();
    // 「检索测试」分区按钮与面板里的「检索」按钮重名，这里用精确名区分
    expect(screen.getByRole('button', { name: '检索' })).toBeTruthy();
    expect(screen.queryByText(/该分区随/)).toBeNull();
  });

  it('文档型知识库有六个分区，含评估基准', async () => {
    renderPage();
    await screen.findByText('研发知识库');

    const tabs = within(
      screen.getByRole('navigation', { name: '知识库分区切换' }),
    ).getAllByRole('button');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      '文件管理',
      '检索测试',
      '知识图谱',
      '知识导图',
      'RAG 评估',
      '评估基准',
    ]);
  });

  it('连接器类型只给检索测试，不渲染会 400 的文件表', async () => {
    api.get.mockResolvedValue(database({ kb_type: 'dify' }));
    renderPage();
    await screen.findByText('研发知识库');

    const nav = screen.getByRole('navigation', { name: '知识库分区切换' });
    expect(within(nav).getAllByRole('button')).toHaveLength(1);
    expect(within(nav).getByRole('button', { name: '检索测试' })).toBeTruthy();
    // 连接器类型只有检索测试，而这个分区是真实面板，不是占位
    expect(screen.getByLabelText('检索测试查询')).toBeTruthy();
    expect(api.listDocuments).not.toHaveBeenCalled();
  });

  it('只读知识库给出只读标记与说明', async () => {
    api.get.mockResolvedValue(database({ can_manage: false }));
    renderPage();
    await screen.findByText('研发知识库');

    expect(screen.getByText('只读')).toBeTruthy();
    expect(screen.getByText('当前账号对该知识库只有读取权限。')).toBeTruthy();
  });

  it('加载失败时给出原因与返回列表入口', async () => {
    api.get.mockRejectedValue(new Error('对话线程不存在'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '对话线程不存在',
    );
    await userEvent.click(screen.getByRole('link', { name: '返回知识库列表' }));
    expect(await screen.findByText('列表页')).toBeTruthy();
  });

  itSlow('刷新文件列表时一并刷新详情，统计卡不会停在旧数字', async () => {
    renderPage();
    await screen.findByText('研发知识库');
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenCalledWith(
        'kb-1',
        expect.objectContaining({ page: 1 }),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: '刷新文件列表' }));

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  itSlow('切到其它分区再回来，文件的每页条数不被重置', async () => {
    api.listDocuments.mockResolvedValue({
      items: [
        {
          file_id: 'f-1',
          filename: '报表.pdf',
          status: 'indexed',
          file_size: 12,
          chunk_count: 0,
          token_count: 0,
          created_by: 'u-1',
          created_by_name: '张三',
          is_folder: false,
          has_children: false,
          children_count: 0,
          has_original_file: false,
          has_parsed_markdown: false,
          is_virtual_folder: false,
        },
      ],
      total: 250,
      page: 1,
      page_size: 100,
      has_more: true,
    });
    renderPage();
    await screen.findByText('研发知识库');

    await userEvent.click(await screen.findByLabelText('每页条数'));
    await userEvent.click(
      await screen.findByRole('option', { name: '300 条/页' }),
    );
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ pageSize: 300, page: 1 }),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: '检索测试' }));
    await userEvent.click(screen.getByRole('button', { name: '文件管理' }));

    expect(screen.getByLabelText('每页条数').textContent).toContain(
      '300 条/页',
    );
  });

  it('文件表用详情页的 kbId 拉列表', async () => {
    renderPage();
    await screen.findByText('研发知识库');

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: null, status: 'all' }),
      ),
    );
  });

  itSlow('搜索命中跳目录时回到第一页，不拿上一页页码查新目录', async () => {
    api.listDocuments.mockImplementation(
      (_kbId: string, params: { page: number; parentId: string | null }) =>
        Promise.resolve({
          items: [
            {
              file_id: `f-${params.parentId ?? 'root'}-${params.page}`,
              filename: `第${params.page}页.pdf`,
              status: 'indexed',
              file_size: 12,
              chunk_count: 0,
              token_count: 0,
              is_folder: false,
              has_children: false,
              children_count: 0,
              has_original_file: false,
              has_parsed_markdown: false,
              is_virtual_folder: false,
            },
          ],
          total: 250,
          page: params.page,
          page_size: 100,
          has_more: true,
        }),
    );
    api.searchDocuments.mockResolvedValue({
      files: [
        {
          kb_id: 'kb-1',
          file_id: 'f-9',
          filename: '年度报表.pdf',
          status: 'indexed',
          parent_id: 'folder-9',
        },
      ],
      total: 1,
      offset: 0,
      limit: 100,
      has_more: false,
    });
    renderPage();
    await screen.findByText('研发知识库');
    await userEvent.click(
      await screen.findByRole('button', { name: '下一页' }),
    );
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ page: 2 }),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: /搜索文件/ }));
    await userEvent.type(screen.getByLabelText('搜索文件名'), '报表');
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: /年度报表\.pdf/ },
        { timeout: 3000 },
      ),
    );

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: 'folder-9', page: 1 }),
      ),
    );
  });

  itSlow(
    '搜索命中在路径投影下时按目录前缀定位，面包屑用真实目录名',
    async () => {
      api.searchDocuments.mockResolvedValue({
        files: [
          {
            kb_id: 'kb-1',
            file_id: 'f-1',
            filename: 'brief/docs/年度报表.pdf',
            status: 'indexed',
            parent_id: null,
          },
        ],
        total: 1,
        offset: 0,
        limit: 100,
        has_more: false,
      });
      renderPage();
      await screen.findByText('研发知识库');

      await userEvent.click(screen.getByRole('button', { name: /搜索文件/ }));
      await userEvent.type(screen.getByLabelText('搜索文件名'), '报表');
      await userEvent.click(
        await screen.findByRole(
          'button',
          { name: /年度报表\.pdf/ },
          { timeout: 3000 },
        ),
      );

      await waitFor(() =>
        expect(api.listDocuments).toHaveBeenLastCalledWith(
          'kb-1',
          expect.objectContaining({
            parentId: null,
            pathPrefix: 'brief/docs/',
            status: 'all',
          }),
        ),
      );
      const nav = await screen.findByRole('navigation', { name: '文件路径' });
      expect(within(nav).getByRole('button', { name: 'brief' })).toBeTruthy();
      expect(within(nav).getByRole('button', { name: 'docs' })).toBeTruthy();
      // 路径投影的每一节都用真实目录名，没有额外的占位节
      expect(within(nav).getAllByRole('button')).toHaveLength(3);
    },
  );

  itSlow('搜索命中后切到文件分区并回到它的目录', async () => {
    api.searchDocuments.mockResolvedValue({
      files: [
        {
          kb_id: 'kb-1',
          file_id: 'f-1',
          filename: '年度报表.pdf',
          status: 'indexed',
          parent_id: 'folder-9',
        },
      ],
      total: 1,
      offset: 0,
      limit: 100,
      has_more: false,
    });
    renderPage();
    await screen.findByText('研发知识库');

    await userEvent.click(screen.getByRole('button', { name: /搜索文件/ }));
    await userEvent.type(screen.getByLabelText('搜索文件名'), '报表');
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: /年度报表\.pdf/ },
        { timeout: 3000 },
      ),
    );

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: 'folder-9', status: 'all' }),
      ),
    );
  });

  itSlow(
    '搜索只给 parent_id 时面包屑用占位节，点它不会掉回根目录',
    async () => {
      // 目录不同就返回不同的文件，用界面内容判断表格到底查了哪一层
      api.listDocuments.mockImplementation(
        (_kbId: string, params: { parentId: string | null }) =>
          Promise.resolve(
            filePage([
              {
                file_id: params.parentId ? 'f-in-folder' : 'f-at-root',
                filename: params.parentId ? '目录内文件.md' : '根目录文件.md',
                status: 'indexed',
                file_size: 12,
                chunk_count: 0,
                token_count: 0,
                is_folder: false,
                has_children: false,
                children_count: 0,
                has_original_file: false,
                has_parsed_markdown: false,
                is_virtual_folder: false,
              },
            ]),
          ),
      );
      api.searchDocuments.mockResolvedValue({
        files: [
          {
            kb_id: 'kb-1',
            file_id: 'f-1',
            filename: '年度报表.pdf',
            status: 'indexed',
            parent_id: 'folder-9',
          },
        ],
        total: 1,
        offset: 0,
        limit: 100,
        has_more: false,
      });
      renderPage();
      await screen.findByText('研发知识库');

      await userEvent.click(screen.getByRole('button', { name: /搜索文件/ }));
      await userEvent.type(screen.getByLabelText('搜索文件名'), '报表');
      await userEvent.click(
        await screen.findByRole(
          'button',
          { name: /年度报表\.pdf/ },
          { timeout: 3000 },
        ),
      );
      await screen.findByText('目录内文件.md');

      // 只看点击之后的请求：首屏那次根目录查询不算
      api.listDocuments.mockClear();
      await userEvent.click(screen.getByRole('button', { name: '…' }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 面包屑缺锚点会退回根目录，届时这里会出现一次 parentId 为空的查询
      expect(api.listDocuments).not.toHaveBeenCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: null }),
      );
      expect(screen.getByText('目录内文件.md')).toBeTruthy();
    },
  );

  itSlow('搜索命中在根目录时回到根，不伪造面包屑', async () => {
    api.searchDocuments.mockResolvedValue({
      files: [
        {
          kb_id: 'kb-1',
          file_id: 'f-2',
          filename: '根目录文件.pdf',
          status: 'indexed',
          parent_id: null,
        },
      ],
      total: 1,
      offset: 0,
      limit: 100,
      has_more: false,
    });
    renderPage();
    await screen.findByText('研发知识库');

    await userEvent.click(screen.getByRole('button', { name: /搜索文件/ }));
    await userEvent.type(screen.getByLabelText('搜索文件名'), '根目录');
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: /根目录文件\.pdf/ },
        { timeout: 3000 },
      ),
    );

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: null }),
      ),
    );
    // 根目录下不该出现占位面包屑
    expect(screen.queryByRole('button', { name: '…' })).toBeNull();
  });

  it('地址缺少 kbId 时给出说明', async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/extensions/knowledgebase']}>
          <Routes>
            <Route
              path="/extensions/knowledgebase"
              element={<KnowledgeBasePage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('地址里缺少知识库 ID。')).toBeTruthy();
  });
});

describe('共享设置入口', () => {
  it('可管理的知识库显示当前共享级别并能打开弹窗', async () => {
    api.get.mockResolvedValue(
      database({
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
    renderPage();
    await screen.findByText('研发知识库');

    expect(screen.getByText('部门共享')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /共享设置/ }));

    expect(await screen.findByTestId('share-config-dialog')).toBeTruthy();
  });

  it('只读知识库不给共享入口', async () => {
    api.get.mockResolvedValue(database({ can_manage: false }));
    renderPage();
    await screen.findByText('研发知识库');

    expect(screen.queryByRole('button', { name: /共享设置/ })).toBeNull();
  });
});
