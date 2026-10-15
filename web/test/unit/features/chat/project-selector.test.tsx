import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  HistoryCandidate,
  ProjectItem,
} from '@/features/chat/api/projects-api';
import type { FileEntry } from '@/shared/lib/files/filesystem-entry';
import { AUTO_PROJECT_ID } from '@/features/chat/lib/project-selection';
import { ProjectSelector } from '@/features/chat/ui/project-selector';

const notifications = vi.hoisted(() => ({ addNotification: vi.fn() }));
vi.mock('@/shared/ui/notifications', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/ui/notifications')
  >('@/shared/ui/notifications');

  return { ...actual, useNotifications: () => notifications };
});

// 目录选择器会真的去列个人空间；这里给一份固定目录，用例只关心选择结果
const filesystem = vi.hoisted(() => ({
  listWorkspaceEntries: vi.fn(),
  createWorkspaceDirectory: vi.fn(),
}));
vi.mock('@/entities/workspace', async () => {
  const actual = await vi.importActual<typeof import('@/entities/workspace')>(
    '@/entities/workspace',
  );

  return { ...actual, ...filesystem };
});

const projects: ProjectItem[] = [
  { id: 'a', name: 'Alpha', workdirPath: '/w/a', directoryMode: 'managed' },
  { id: 'b', name: 'beta', workdirPath: '/w/b', directoryMode: 'linked' },
];

const candidates: HistoryCandidate[] = [
  {
    threadId: 't-1',
    title: '向量检索的讨论',
    agentId: 'default-chatbot',
    workdirPath: '/projects/x/',
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
];

const directories: FileEntry[] = [
  { path: '/docs/', name: 'docs', isDir: true, size: 0, modifiedAt: '' },
  { path: '/reports/', name: 'reports', isDir: true, size: 0, modifiedAt: '' },
  {
    path: '/readme.md',
    name: 'readme.md',
    isDir: false,
    size: 12,
    modifiedAt: '',
  },
];

const setup = (
  overrides: Partial<React.ComponentProps<typeof ProjectSelector>> = {},
) => {
  const props = {
    projects,
    onReloadProjects: vi.fn(),
    selected: AUTO_PROJECT_ID,
    onChange: vi.fn(),
    history: {
      query: '',
      items: [],
      loading: false,
      error: null,
      onQueryChange: vi.fn(),
    },
    onCreateProject: vi.fn(async () => undefined),
    ...overrides,
  };

  render(<ProjectSelector {...props} />);

  return props;
};

const trigger = () =>
  screen.getByRole('button', { name: /选择项目|Alpha|beta|未命名项目/ });

/** 面板里的选项；选中项与触发器同名，必须限定在选项列表内查。 */
const option = (name: RegExp | string) =>
  within(screen.getByLabelText('选择项目')).getByRole('button', { name });

const createDialog = () => screen.getByRole('dialog', { name: '新建项目' });
const createDialogOrNull = () =>
  screen.queryByRole('dialog', { name: '新建项目' });

const openPicker = async () => {
  await userEvent.click(trigger());
};

const openHistory = async () => {
  await openPicker();
  await userEvent.click(
    await screen.findByRole('button', { name: /从历史对话添加/ }),
  );
};

/** 进新建弹窗并选中一个目录；返回弹窗里的「创建并选择」按钮。 */
const fillCreateForm = async (name = '新项目', directory = 'docs') => {
  await userEvent.type(screen.getByLabelText('项目名称'), name);
  await userEvent.click(
    await screen.findByRole('button', { name: new RegExp(directory) }),
  );

  return screen.getByRole('button', { name: '创建并选择' });
};

describe('ProjectSelector', () => {
  beforeEach(() => {
    notifications.addNotification.mockReset();
    filesystem.listWorkspaceEntries.mockReset();
    filesystem.listWorkspaceEntries.mockResolvedValue(directories);
    filesystem.createWorkspaceDirectory.mockReset();
  });

  it('自动值显示「选择项目」，并说明发送时建独立目录', () => {
    setup();

    expect(
      screen.getByRole('button', { name: '选择项目' }).textContent,
    ).toContain('选择项目');
    // 提示挂在文字上（参照 .project-trigger-label 的 title）
    expect(screen.getByTitle('不使用项目（发送时创建独立目录）')).toBeTruthy();
  });

  it('选中项目时显示它的名字与目录来源', () => {
    setup({ selected: 'b' });

    expect(screen.getByRole('button', { name: 'beta' }).textContent).toContain(
      'beta',
    );
    expect(screen.getByTitle('个人空间已有目录')).toBeTruthy();
  });

  it('禁用时打不开', () => {
    setup({ disabled: true });

    expect(screen.getByRole('button', { name: '选择项目' })).toBeDisabled();
  });

  it('打开后列出「不使用项目」与项目，搜索按名称过滤', async () => {
    setup();
    await openPicker();

    expect(await screen.findByText('不使用项目')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Alpha/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /beta/ })).toBeTruthy();

    await userEvent.type(screen.getByLabelText('搜索项目'), 'alp');

    expect(screen.queryByRole('button', { name: /beta/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Alpha/ })).toBeTruthy();
  });

  it('打开时把焦点放进搜索框', async () => {
    setup();
    await openPicker();

    await waitFor(() =>
      expect(screen.getByLabelText('搜索项目')).toHaveFocus(),
    );
  });

  it('选中项标记为按下，未选中的不标记', async () => {
    setup({ selected: 'a' });
    await openPicker();

    await screen.findByLabelText('选择项目');
    expect(option(/Alpha/).getAttribute('aria-pressed')).toBe('true');
    expect(option(/beta/).getAttribute('aria-pressed')).toBe('false');
    expect(option(/不使用项目/).getAttribute('aria-pressed')).toBe('false');
  });

  it('点一个项目把 id 交回调用方并关闭', async () => {
    const props = setup();
    await openPicker();
    await userEvent.click(await screen.findByRole('button', { name: /Alpha/ }));

    expect(props.onChange).toHaveBeenCalledWith('a');
    // antd 的弹层收起时是隐藏而不是卸载，因此看触发器的展开态
    await waitFor(() =>
      expect(trigger().getAttribute('aria-expanded')).toBe('false'),
    );
  });

  it('点「不使用项目」交回自动值', async () => {
    const props = setup({ selected: 'a' });
    await openPicker();
    await userEvent.click(
      await screen.findByRole('button', { name: /不使用项目/ }),
    );

    expect(props.onChange).toHaveBeenCalledWith(AUTO_PROJECT_ID);
  });

  it('列表加载中只显示加载态', async () => {
    render(
      <ProjectSelector
        {...{
          projects: [],
          projectsLoading: true,
          onReloadProjects: vi.fn(),
          selected: AUTO_PROJECT_ID,
          onChange: vi.fn(),
          history: {
            query: '',
            items: [],
            loading: false,
            error: null,
            onQueryChange: vi.fn(),
          },
          onCreateProject: vi.fn(async () => undefined),
        }}
      />,
    );
    await openPicker();

    // 弹层挂在 body 上，不在 render 的容器里
    expect(document.querySelector('.ant-spin')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /不使用项目/ })).toBeNull();
  });

  it('空列表文案随是否有查询词变化', async () => {
    setup({ projects: [] });
    await openPicker();

    expect(await screen.findByText('暂无已有项目')).toBeTruthy();

    await userEvent.type(screen.getByLabelText('搜索项目'), 'zzz');

    expect(screen.getByText('没有匹配的项目')).toBeTruthy();
  });

  it('加载失败时给出重试入口', async () => {
    const props = setup({ projectsError: '项目加载失败' });
    await openPicker();

    expect(await screen.findByText('项目加载失败')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '重新加载' }));

    expect(props.onReloadProjects).toHaveBeenCalledTimes(1);
  });

  it('历史视图能返回项目列表', async () => {
    setup();
    await openHistory();

    expect(await screen.findByLabelText('搜索历史对话')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '返回项目列表' }));

    expect(await screen.findByLabelText('搜索项目')).toBeTruthy();
  });

  it('历史候选没有可用目录时提示，不打开新建', async () => {
    setup({
      history: {
        query: '',
        items: [{ ...candidates[0]!, workdirPath: '/' }],
        loading: false,
        error: null,
        onQueryChange: vi.fn(),
      },
    });
    await openHistory();
    await userEvent.click(
      await screen.findByRole('button', { name: /向量检索的讨论/ }),
    );

    expect(notifications.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' }),
    );
    expect(createDialogOrNull()).toBeNull();
  });

  it('从历史对话选一条会把它的目录归一后预填进新建弹窗', async () => {
    setup({
      history: {
        query: '',
        items: candidates,
        loading: false,
        error: null,
        onQueryChange: vi.fn(),
      },
    });
    await openHistory();
    await userEvent.click(
      await screen.findByRole('button', { name: /向量检索的讨论/ }),
    );

    expect(await waitFor(createDialog)).toBeTruthy();
    // 目录来自历史对话：选择器直接定位到那个目录并把它当作当前选择
    expect(await screen.findByText('/projects/x')).toBeTruthy();
    // 只有目录、还没填名称，提交仍应禁用
    expect(screen.getByRole('button', { name: '创建并选择' })).toBeDisabled();
  });

  it('新建弹窗里的目录选择器只列目录，选中后即可提交', async () => {
    const props = setup();
    await openPicker();
    await userEvent.click(screen.getByRole('button', { name: /新建项目/ }));

    expect(await waitFor(createDialog)).toBeTruthy();
    // 面包屑起点与「未绑定目录也列出来」的请求参数
    expect(screen.getByRole('button', { name: 'Workspace' })).toBeTruthy();
    expect(filesystem.listWorkspaceEntries).toHaveBeenCalledWith({
      path: '/',
      includeUnboundProjectDirs: true,
    });

    // 只列目录：文件不出现在选择器里
    expect(await screen.findByRole('button', { name: /docs/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /readme\.md/ })).toBeNull();

    const submit = await fillCreateForm();
    await userEvent.click(submit);

    await waitFor(() =>
      expect(props.onCreateProject).toHaveBeenCalledWith({
        name: '新项目',
        path: '/docs',
        requestId: expect.any(String),
      }),
    );
  });

  it('创建成功提示并关闭弹窗', async () => {
    setup();
    await openPicker();
    await userEvent.click(screen.getByRole('button', { name: /新建项目/ }));
    await userEvent.click(await fillCreateForm());

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' }),
      ),
    );
    await waitFor(() => expect(createDialogOrNull()).toBeNull());
  });

  it('创建失败后重试复用同一个幂等键', async () => {
    const onCreateProject = vi
      .fn<(input: { requestId: string }) => Promise<void>>()
      .mockRejectedValueOnce(new Error('网络超时'))
      .mockResolvedValueOnce(undefined);
    setup({ onCreateProject: onCreateProject as never });

    await openPicker();
    await userEvent.click(screen.getByRole('button', { name: /新建项目/ }));
    await userEvent.click(await fillCreateForm());
    expect(await waitFor(createDialog)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '创建并选择' }));

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(2));
    const [first, second] = onCreateProject.mock.calls;
    // 后端按它去重：超时重试不能建出两个项目
    expect(first![0].requestId).toBe(second![0].requestId);
    expect(first![0].requestId).toBeTruthy();
  });

  it('创建失败时把原因交给通知，且不关闭弹窗', async () => {
    setup({
      onCreateProject: vi.fn(async () => {
        throw new Error('目录已被占用');
      }),
    });
    await openPicker();
    await userEvent.click(screen.getByRole('button', { name: /新建项目/ }));
    await userEvent.click(await fillCreateForm());

    await waitFor(() =>
      expect(notifications.addNotification).toHaveBeenCalledWith({
        type: 'error',
        title: '项目',
        message: '目录已被占用',
      }),
    );
    expect(createDialog()).toBeTruthy();
  });
});
