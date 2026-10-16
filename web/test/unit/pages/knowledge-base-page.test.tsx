import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// antd 词汇由应用装配承载，测试同构挂上
import { AntdProvider } from '@/app/theme/antd-provider';

/**
 * 这套用例逐个靠 userEvent 驱动 antd 弹窗，全套件并行跑时会超过默认 5 秒预算；
 * 这里给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

/**
 * 搜索结果要等 240ms 防抖 + 一次查询；antd 弹窗与表格比原 Radix 实现重，
 * 全套件并行跑时把等待窗口放宽到文件预算以内，而不是放宽全局配置。
 */
const SEARCH_RESULT_TIMEOUT_MS = 12000;

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

// 评估基准分区会自己拉数据；这里固定成空列表
vi.mock('@/features/knowledge-base/api/evaluation-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/evaluation-api')
  >('@/features/knowledge-base/api/evaluation-api');
  return {
    ...actual,
    evaluationApi: {
      ...actual.evaluationApi,
      listDatasets: async () => [],
      listRuns: async () => [],
      getDataset: async () => {
        throw new Error('unused');
      },
      resumeDatasetGeneration: async () => ({}),
      deleteDataset: async () => undefined,
      downloadDataset: async () => ({ blob: new Blob(), filename: null }),
    },
  };
});

// 导图分区会自己拉数据；这里固定成「还没生成」，让页面用例只验接线
vi.mock('@/features/knowledge-base/api/mindmap-api', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/knowledge-base/api/mindmap-api')
  >('@/features/knowledge-base/api/mindmap-api');
  return {
    ...actual,
    mindmapApi: {
      getDocument: async () => ({ mindmap: null, kb_id: 'kb-1' }),
      generate: async () => ({ mindmap: null }),
      getDiff: async () => ({
        has_mindmap: false,
        tracked_files: [],
        current_files: [],
        added_files: [],
        removed_file_ids: [],
        unchanged_count: 0,
        needs_update: false,
      }),
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

const LocationProbe = () => {
  const location = useLocation();
  return (
    <>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="search">{location.search}</span>
    </>
  );
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <AntdProvider>
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
      </QueryClientProvider>
    </AntdProvider>,
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
    expect(screen.getByText('Milvus')).toBeTruthy();
    expect(screen.getByText('内部资料')).toBeTruthy();
    // 统计卡由 `StatInline` 渲染：数值在前、标签在后，两者是兄弟节点
    const statValue = (label: string) =>
      screen.getByText(label).previousElementSibling?.textContent;
    // 待解析 1、文件 2、Tokens 3400（计数格式化只在过万时折成「万」）；大小卡不带标签
    expect(statValue('待解析')).toBe('1');
    expect(statValue('文件')).toBe('2');
    expect(screen.getByText('4.0 KB')).toBeTruthy();
    expect(statValue('Tokens')).toBe('3400');
  });

  it('RAG 评估分区渲染真实面板（没有基准时引导去基准管理）', async () => {
    renderPage();
    await screen.findByText('研发知识库');

    await userEvent.click(screen.getByRole('tab', { name: 'RAG 评估' }));

    expect(
      await screen.findByText('先上传或生成评估基准，再运行 RAG 评估。'),
    ).toBeTruthy();
    expect(screen.queryByText(/该分区随/)).toBeNull();
  });

  it('评估基准分区渲染真实面板', async () => {
    renderPage();
    await screen.findByText('研发知识库');

    await userEvent.click(screen.getByRole('tab', { name: '评估基准' }));

    expect(await screen.findByText(/共 \d+ 个评估基准/)).toBeTruthy();
    expect(screen.queryByText(/该分区随/)).toBeNull();
  });

  it('知识导图分区渲染真实面板（空态给生成入口）', async () => {
    renderPage();
    await screen.findByText('研发知识库');

    await userEvent.click(screen.getByRole('tab', { name: '知识导图' }));

    expect(
      await screen.findByText('从当前知识库内容生成结构化导图。'),
    ).toBeTruthy();
    expect(screen.queryByText(/该分区随/)).toBeNull();
  });

  it('知识图谱分区渲染真实面板：工具栏与搜索入口都在', async () => {
    renderPage();
    await screen.findByText('研发知识库');

    await userEvent.click(screen.getByRole('tab', { name: '知识图谱' }));

    expect(await screen.findByLabelText('搜索实体')).toBeTruthy();
    expect(screen.getByRole('button', { name: '图谱设置' })).toBeTruthy();
    expect(screen.queryByText(/该分区随/)).toBeNull();
  });

  it('检索测试分区渲染真实面板', async () => {
    renderPage();
    await screen.findByText('研发知识库');

    await userEvent.click(screen.getByRole('tab', { name: '检索测试' }));

    expect(screen.getByLabelText('检索测试查询')).toBeTruthy();
    // 「检索测试」分区按钮与面板里的「检索」按钮重名，这里用精确名区分
    expect(screen.getByRole('button', { name: '检索' })).toBeTruthy();
    expect(screen.queryByText(/该分区随/)).toBeNull();
  });

  it('文档型知识库有六个分区，含评估基准', async () => {
    renderPage();
    await screen.findByText('研发知识库');

    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      '文件管理',
      '检索测试',
      '知识图谱',
      '知识导图',
      'RAG 评估',
      '评估基准',
    ]);
  });

  it('只读知识库只保留四个分区，评估两个分区留给管理员', async () => {
    // 变异：去掉 visibleTabs 过滤后，只读用户会看到 RAG 评估与评估基准
    api.get.mockResolvedValue(database({ can_manage: false }));
    renderPage();
    await screen.findByText('研发知识库');

    const nav = screen.getByRole('tablist');
    expect(
      within(nav)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['文件管理', '检索测试', '知识图谱', '知识导图']);
  });

  it('返回列表时带上知识库分区，落回同一个 tab', async () => {
    renderPage();
    await screen.findByText('研发知识库');

    await userEvent.click(screen.getByRole('button', { name: /返回/ }));

    expect(await screen.findByText('列表页')).toBeTruthy();
    expect(screen.getByTestId('search').textContent).toBe('?tab=knowledge');
  });

  it('带 ?action=edit 进页面直接打开配置弹窗，并消费掉该参数', async () => {
    // 变异：不消费参数时，关掉弹窗再刷新会又弹一次
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <AntdProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter
            initialEntries={['/extensions/knowledgebase/kb-1?action=edit']}
          >
            <Routes>
              <Route
                path="/extensions/knowledgebase/:kbId"
                element={<KnowledgeBasePage />}
              />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </QueryClientProvider>
      </AntdProvider>,
    );

    expect(await screen.findByRole('dialog')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('search').textContent).toBe(''),
    );
  });

  it('连接器类型只给检索测试，不渲染会 400 的文件表', async () => {
    api.get.mockResolvedValue(database({ kb_type: 'dify' }));
    renderPage();
    await screen.findByText('研发知识库');

    const nav = screen.getByRole('tablist');
    expect(within(nav).getAllByRole('tab')).toHaveLength(1);
    expect(within(nav).getByRole('tab', { name: '检索测试' })).toBeTruthy();
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
    await userEvent.click(screen.getByRole('button', { name: /返回/ }));
    expect(await screen.findByText('列表页')).toBeTruthy();
  });

  it('刷新文件列表时一并刷新详情，统计卡不会停在旧数字', async () => {
    renderPage();
    await screen.findByText('研发知识库');
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenCalledWith(
        'kb-1',
        expect.objectContaining({ page: 1 }),
      ),
    );

    const before = api.get.mock.calls.length;

    await userEvent.click(screen.getByRole('button', { name: '刷新文件列表' }));

    // 这条断言的主题是「刷新会连带重取详情」，因此看点击前后的增量；
    // 挂载时取了几次属于另一条主张，不在这里钉。
    await waitFor(() => expect(api.get.mock.calls.length).toBe(before + 1));
  });

  it('切到其它分区再回来，文件的每页条数不被重置', async () => {
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

    await userEvent.click(
      await screen.findByRole('combobox', { name: '每页条数' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: '300 条/页' }),
    );
    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ pageSize: 300, page: 1 }),
      ),
    );

    await userEvent.click(screen.getByRole('tab', { name: '检索测试' }));
    await userEvent.click(screen.getByRole('tab', { name: '文件管理' }));

    // antd Select 的选中值渲染在 selection-item，combobox input 本身无文本
    expect(
      screen.getByText('300 条/页', {
        selector: '.ant-select-selection-item',
      }),
    ).toBeTruthy();
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

  it('搜索命中跳目录时回到第一页，不拿上一页页码查新目录', async () => {
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
        { timeout: SEARCH_RESULT_TIMEOUT_MS },
      ),
    );

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: 'folder-9', page: 1 }),
      ),
    );
  });

  it('搜索命中在路径投影下时按目录前缀定位，面包屑用真实目录名', async () => {
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
        { timeout: SEARCH_RESULT_TIMEOUT_MS },
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
  });

  it('搜索命中后切到文件分区并回到它的目录', async () => {
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
        { timeout: SEARCH_RESULT_TIMEOUT_MS },
      ),
    );

    await waitFor(() =>
      expect(api.listDocuments).toHaveBeenLastCalledWith(
        'kb-1',
        expect.objectContaining({ parentId: 'folder-9', status: 'all' }),
      ),
    );
  });

  it('搜索只给 parent_id 时面包屑用占位节，点它不会掉回根目录', async () => {
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
        { timeout: SEARCH_RESULT_TIMEOUT_MS },
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
  });

  it('搜索命中在根目录时回到根，不伪造面包屑', async () => {
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
        { timeout: SEARCH_RESULT_TIMEOUT_MS },
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

    // antd Modal 不带 testid，按弹窗内容断言它确实开了
    expect(await screen.findByRole('radio', { name: '部门共享' })).toBeTruthy();
  });

  it('只读知识库不给共享入口', async () => {
    api.get.mockResolvedValue(database({ can_manage: false }));
    renderPage();
    await screen.findByText('研发知识库');

    expect(screen.queryByRole('button', { name: /共享设置/ })).toBeNull();
  });
});
