import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { HistoryCandidate, ProjectItem } from '@/features/chat/api/projects-api';
import { AUTO_PROJECT_ID } from '@/features/chat/lib/project-selection';
import { ProjectSelector } from '@/features/chat/ui/project-selector';

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

const setup = (
  overrides: Partial<React.ComponentProps<typeof ProjectSelector>> = {},
) => {
  const props = {
    projects,
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

const openPicker = async () => {
  await userEvent.click(screen.getByRole('button', { name: /选择项目|Alpha|未命名项目/ }));
};

describe('ProjectSelector', () => {
  it('自动值显示「选择项目」，并说明发送时建独立目录', () => {
    setup();

    const trigger = screen.getByRole('button', { name: /选择项目/ });
    expect(trigger.textContent).toContain('选择项目');
    expect(trigger.getAttribute('title')).toBe('不使用项目（发送时创建独立目录）');
  });

  it('选中项目时显示它的名字与目录来源', () => {
    setup({ selected: 'b' });

    const trigger = screen.getByRole('button', { name: /beta/ });
    expect(trigger.textContent).toContain('beta');
    expect(trigger.getAttribute('title')).toBe('个人空间已有目录');
  });

  it('禁用时打不开', async () => {
    setup({ disabled: true });

    expect(
      (screen.getByRole('button', { name: /选择项目/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
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

  it('点一个项目把 id 交回调用方并关闭', async () => {
    const props = setup();
    await openPicker();
    await userEvent.click(await screen.findByRole('button', { name: /Alpha/ }));

    expect(props.onChange).toHaveBeenCalledWith('a');
    await waitFor(() => expect(screen.queryByText('不使用项目')).toBeNull());
  });

  it('点「不使用项目」交回自动值', async () => {
    const props = setup({ selected: 'a' });
    await openPicker();
    await userEvent.click(await screen.findByText('不使用项目'));

    expect(props.onChange).toHaveBeenCalledWith(AUTO_PROJECT_ID);
  });

  it('从历史对话选一条会把它的目录归一后预填进新建项目', async () => {
    setup({
      history: {
        query: '',
        items: candidates,
        loading: false,
        error: null,
        onQueryChange: vi.fn(),
      },
    });
    await openPicker();
    await userEvent.click(screen.getByRole('button', { name: /从历史对话选择/ }));

    await userEvent.click(await screen.findByRole('button', { name: /向量检索的讨论/ }));

    expect(screen.getByRole('heading', { name: '新建项目' })).toBeTruthy();
    expect((screen.getByLabelText('目录路径') as HTMLInputElement).value).toBe(
      '/projects/x',
    );
  });

  it('历史候选没有可用目录时提示，不进入新建', async () => {
    setup({
      history: {
        query: '',
        items: [{ ...candidates[0]!, workdirPath: '/' }],
        loading: false,
        error: null,
        onQueryChange: vi.fn(),
      },
    });
    await openPicker();
    await userEvent.click(screen.getByRole('button', { name: /从历史对话选择/ }));
    await userEvent.click(await screen.findByRole('button', { name: /向量检索的讨论/ }));

    expect(screen.getByText('该历史对话没有可用目录')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '新建项目' })).toBeNull();
  });

  it('新建项目要求名称与目录都有', async () => {
    const props = setup({
      history: {
        query: '',
        items: candidates,
        loading: false,
        error: null,
        onQueryChange: vi.fn(),
      },
    });
    await openPicker();
    await userEvent.click(screen.getByRole('button', { name: /从历史对话选择/ }));
    await userEvent.click(await screen.findByRole('button', { name: /向量检索的讨论/ }));

    const submit = screen.getByRole('button', { name: /创建/ }) as HTMLButtonElement;
    // 只有目录时不能提交
    expect(submit.disabled).toBe(true);

    await userEvent.type(screen.getByLabelText('项目名称'), '新项目');
    expect(submit.disabled).toBe(false);

    await userEvent.click(submit);

    await waitFor(() =>
      expect(props.onCreateProject).toHaveBeenCalledWith({
        name: '新项目',
        path: '/projects/x',
        requestId: expect.any(String),
      }),
    );
  });

  it('项目列表里能直接进新建项目', async () => {
    setup();
    await openPicker();
    await userEvent.click(screen.getByRole('button', { name: /新建项目/ }));

    expect(screen.getByRole('heading', { name: '新建项目' })).toBeTruthy();
  });

  it('创建失败后重试复用同一个幂等键', async () => {
    const onCreateProject = vi
      .fn<(input: { requestId: string }) => Promise<void>>()
      .mockRejectedValueOnce(new Error('网络超时'))
      .mockResolvedValueOnce(undefined);
    setup({ onCreateProject: onCreateProject as never });

    await openPicker();
    await userEvent.click(screen.getByRole('button', { name: /新建项目/ }));
    await userEvent.type(screen.getByLabelText('项目名称'), '新项目');
    await userEvent.type(screen.getByLabelText('目录路径'), '/a/b');
    await userEvent.click(screen.getByRole('button', { name: /创建/ }));
    expect(await screen.findByText('网络超时')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /创建/ }));

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(2));
    const [first, second] = onCreateProject.mock.calls;
    // 后端按它去重：超时重试不能建出两个项目
    expect(first![0].requestId).toBe(second![0].requestId);
    expect(first![0].requestId).toBeTruthy();
  });

  it('创建失败时显示原因且不关闭对话框', async () => {
    setup({
      history: {
        query: '',
        items: candidates,
        loading: false,
        error: null,
        onQueryChange: vi.fn(),
      },
      onCreateProject: vi.fn(async () => {
        throw new Error('目录已被占用');
      }),
    });
    await openPicker();
    await userEvent.click(screen.getByRole('button', { name: /从历史对话选择/ }));
    await userEvent.click(await screen.findByRole('button', { name: /向量检索的讨论/ }));
    await userEvent.type(screen.getByLabelText('项目名称'), '新项目');
    await userEvent.click(screen.getByRole('button', { name: /创建/ }));

    expect(await screen.findByText('目录已被占用')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '新建项目' })).toBeTruthy();
  });
});
