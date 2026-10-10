/**
 * 安装流弹窗的组件用例。
 *
 * 覆盖：草稿入口直接进确认、个人与共享走不同确认端点、取消/关闭清草稿、解析失败给明确
 * 失败态、失败项的重试边界与共享范围校验。面板与 api 段在别处覆盖，这里只 mock 契约客户端。
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SkillDraft } from '@/features/skills/api/skill-api';

vi.setConfig({ testTimeout: 20000 });

const { sdk, notifications, user } = vi.hoisted(() => ({
  sdk: {
    remotePrepare: vi.fn(),
    confirmShared: vi.fn(),
    confirmPersonal: vi.fn(),
    discard: vi.fn(),
    departments: vi.fn(),
    users: vi.fn(),
    remoteList: vi.fn(),
    remoteSearch: vi.fn(),
  },
  notifications: { addNotification: vi.fn() },
  user: {
    current: { uid: 'u-1', role: 'superadmin', department_id: 3 } as Record<
      string,
      unknown
    >,
  },
}));

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  prepareRemoteSkillsRouteApiSkillsRemotePreparePost: (...args: unknown[]) =>
    sdk.remotePrepare(...args),
  confirmSkillInstallDraftRouteApiSkillsInstallDraftsDraftIdConfirmPost: (
    ...args: unknown[]
  ) => sdk.confirmShared(...args),
  confirmPersonalSkillInstallDraftRouteApiSkillsPersonalInstallDraftsDraftIdConfirmPost:
    (...args: unknown[]) => sdk.confirmPersonal(...args),
  discardSkillInstallDraftRouteApiSkillsInstallDraftsDraftIdDelete: (
    ...args: unknown[]
  ) => sdk.discard(...args),
  getDepartmentsApiDepartmentsGet: (...args: unknown[]) =>
    sdk.departments(...args),
  readUserAccessOptionsApiAuthUsersAccessOptionsGet: (...args: unknown[]) =>
    sdk.users(...args),
  listRemoteSkillsRouteApiSkillsRemoteListPost: (...args: unknown[]) =>
    sdk.remoteList(...args),
  searchRemoteSkillsRouteApiSkillsRemoteSearchPost: (...args: unknown[]) =>
    sdk.remoteSearch(...args),
}));

vi.mock('@/shared/ui/notifications', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/ui/notifications')
  >('@/shared/ui/notifications');
  return { ...actual, useNotifications: () => notifications };
});

vi.mock('@/entities/session', async () => {
  const actual =
    await vi.importActual<typeof import('@/entities/session')>(
      '@/entities/session',
    );
  return { ...actual, useUser: () => ({ data: user.current }) };
});

const { SkillInstallFlowDialog } =
  await import('@/features/skills/ui/skill-install-flow-dialog');

const ok = <T,>(data: T) => ({ data: { success: true, data } });

const draft = (extra: Partial<SkillDraft> = {}): SkillDraft => ({
  draft_id: 'd1',
  created_by: 'u-1',
  source_type: 'upload',
  source: 'SKILL.md',
  created_at: 0,
  expires_at: 0,
  items: [
    {
      slug: 'alpha',
      name: 'alpha',
      description: '演示',
      success: true,
      warnings: ['原始 slug alpha 已存在，将安装为 alpha-2'],
    },
  ],
  default_share_config: {
    version: 2,
    read_scope: {
      access_level: 'user',
      department_ids: [],
      user_uids: ['u-1'],
    },
    manage_scope: null,
  },
  allowed_access_levels: ['global', 'department', 'user'],
  ...extra,
});

const renderFlow = (
  flow: Parameters<typeof SkillInstallFlowDialog>[0]['flow'],
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const handlers = { onClose: vi.fn(), onCompleted: vi.fn() };
  render(
    <QueryClientProvider client={queryClient}>
      <SkillInstallFlowDialog flow={flow} {...handlers} />
    </QueryClientProvider>,
  );
  return handlers;
};

describe('安装流弹窗', () => {
  beforeEach(() => {
    notifications.addNotification.mockReset();
    Object.values(sdk).forEach((mock) => mock.mockReset());
    user.current = { uid: 'u-1', role: 'superadmin', department_id: 3 };
    sdk.confirmPersonal.mockResolvedValue(
      ok([{ slug: 'alpha', success: true }]),
    );
    sdk.confirmShared.mockResolvedValue(ok([{ slug: 'alpha', success: true }]));
    sdk.discard.mockResolvedValue({ data: { success: true } });
    sdk.departments.mockResolvedValue({ data: [{ id: 3, name: '研发部' }] });
    sdk.users.mockResolvedValue({ data: [{ uid: 'u-1', username: '张三' }] });
  });

  it('草稿入口直接进确认阶段：步骤、条目、默认安装到个人（默认落到共享时本用例必须失败）', async () => {
    renderFlow({ kind: 'draft', title: '安装 SKILL.md', drafts: [draft()] });

    expect(await screen.findByText('确认安装内容')).toBeTruthy();
    expect(screen.getByTestId('install-step').textContent).toContain('3/4');
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /个人 Skill 推荐/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    // 个人目标不显示共享范围表单，也不显示共享警告
    expect(screen.queryByTestId('share-config-form')).toBeNull();
    expect(screen.queryByText(/原始 slug alpha 已存在/)).toBeNull();
  });

  it('确认个人安装：只发 slugs 给个人端点，完成后回报汇总（把个人发给共享端点时本用例必须失败）', async () => {
    const handlers = renderFlow({
      kind: 'draft',
      title: '安装 SKILL.md',
      drafts: [draft()],
    });
    await screen.findByText('确认安装内容');

    await userEvent.click(
      screen.getByRole('button', { name: /确认安装 1 个 Skill/ }),
    );
    await waitFor(() =>
      expect(sdk.confirmPersonal).toHaveBeenCalledWith({
        path: { draft_id: 'd1' },
        body: { slugs: ['alpha'] },
      }),
    );
    expect(sdk.confirmShared).not.toHaveBeenCalled();

    expect(await screen.findByText('全部 Skill 安装完成')).toBeTruthy();
    expect(screen.getByTestId('install-status-list').textContent).toContain(
      '完成',
    );

    await userEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(handlers.onCompleted).toHaveBeenCalledWith({
      success: 1,
      failed: 0,
    });
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('确认共享安装：带上共享范围与 slugs，且只给管理员这个选项（把共享选项给普通用户时本用例必须失败）', async () => {
    renderFlow({ kind: 'draft', title: '安装 SKILL.md', drafts: [draft()] });
    await screen.findByText('确认安装内容');

    await userEvent.click(screen.getByRole('button', { name: /共享 Skill/ }));
    expect(await screen.findByTestId('share-config-form')).toBeTruthy();
    expect(screen.getByText(/原始 slug alpha 已存在/)).toBeTruthy();
    // 切到部门共享：当前账号的部门被自动补进范围
    await userEvent.click(
      within(screen.getByTestId('share-config-form')).getByRole('radio', {
        name: '部门共享',
      }),
    );
    expect(
      await screen.findByRole('button', { name: '研发部' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(
      screen.getByRole('button', { name: /确认安装 1 个 Skill/ }),
    );
    await waitFor(() =>
      expect(sdk.confirmShared).toHaveBeenCalledWith({
        path: { draft_id: 'd1' },
        body: {
          share_config: {
            version: 2,
            read_scope: {
              access_level: 'department',
              department_ids: [3],
              user_uids: [],
            },
            manage_scope: null,
          },
          slugs: ['alpha'],
        },
      }),
    );
  });

  it('个人安装整份失败时补删草稿（后端只在有成功项时清草稿）', async () => {
    sdk.confirmPersonal.mockResolvedValue(
      ok([{ slug: 'alpha', success: false, error: '同名个人技能已存在' }]),
    );
    renderFlow({ kind: 'draft', title: '安装 SKILL.md', drafts: [draft()] });

    await screen.findByText('确认安装内容');
    await userEvent.click(
      screen.getByRole('button', { name: /确认安装 1 个 Skill/ }),
    );

    // 变异：去掉 `if (!results.some(success))` 那段补删，草稿会留在磁盘上直到过期
    await waitFor(() =>
      expect(sdk.discard).toHaveBeenCalledWith({ path: { draft_id: 'd1' } }),
    );
  });

  it('共享范围按指定人但一个人都没选时拦下，不发确认请求（不校验时本用例必须失败）', async () => {
    renderFlow({
      kind: 'draft',
      title: '安装 SKILL.md',
      drafts: [
        draft({
          default_share_config: {
            version: 2,
            read_scope: {
              access_level: 'user',
              department_ids: [],
              user_uids: [],
            },
            manage_scope: null,
          },
        }),
      ],
    });
    await screen.findByText('确认安装内容');
    await userEvent.click(screen.getByRole('button', { name: /共享 Skill/ }));
    await screen.findByTestId('share-config-form');

    await userEvent.click(
      screen.getByRole('button', { name: /确认安装 1 个 Skill/ }),
    );
    expect(
      await screen.findByText('指定人共享时至少要选一个用户。'),
    ).toBeTruthy();
    expect(sdk.confirmShared).not.toHaveBeenCalled();
    expect(sdk.confirmPersonal).not.toHaveBeenCalled();
  });

  it('普通用户看不到共享目标（后端要求 admin，界面先收敛入口）', async () => {
    user.current = { uid: 'u-1', role: 'user', department_id: 3 };
    renderFlow({ kind: 'draft', title: '安装 SKILL.md', drafts: [draft()] });
    await screen.findByText('确认安装内容');

    expect(screen.queryByRole('button', { name: /共享 Skill/ })).toBeNull();
    expect(
      screen.getByRole('button', { name: /个人 Skill 推荐/ }),
    ).toBeTruthy();
  });

  it('确认阶段取消会清掉草稿（不清草稿时本用例必须失败）', async () => {
    const handlers = renderFlow({
      kind: 'draft',
      title: '安装 SKILL.md',
      drafts: [draft()],
    });
    await screen.findByText('确认安装内容');

    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() =>
      expect(sdk.discard).toHaveBeenCalledWith({ path: { draft_id: 'd1' } }),
    );
    expect(handlers.onClose).toHaveBeenCalled();
    expect(sdk.confirmPersonal).not.toHaveBeenCalled();
  });

  it('远程解析成功：解析请求带上来源与技能，逐项进度推进到确认', async () => {
    sdk.remotePrepare.mockResolvedValue(
      ok(draft({ source_type: 'remote', source: 'owner/repo' })),
    );
    renderFlow({
      kind: 'remote',
      title: '远程安装 Skill',
      requests: [{ source: 'owner/repo', skills: ['alpha'] }],
    });

    expect(await screen.findByText('确认安装内容')).toBeTruthy();
    expect(sdk.remotePrepare).toHaveBeenCalledWith({
      body: { source: 'owner/repo', skills: ['alpha'] },
    });
  });

  it('远程解析失败：给出失败态与原因，并清掉已生成的草稿（把失败画成空列表时本用例必须失败）', async () => {
    sdk.remotePrepare
      .mockResolvedValueOnce(ok(draft({ draft_id: 'd9' })))
      .mockResolvedValueOnce({
        error: { detail: '第二个来源不可用' },
        response: { status: 400 },
      });
    renderFlow({
      kind: 'remote',
      title: '远程安装 Skill',
      requests: [
        { source: 'a/repo', skills: ['alpha'] },
        { source: 'b/repo', skills: ['beta'] },
      ],
    });

    expect(await screen.findByText('Skill 加载失败')).toBeTruthy();
    expect(screen.getByText('第二个来源不可用')).toBeTruthy();
    await waitFor(() =>
      expect(sdk.discard).toHaveBeenCalledWith({ path: { draft_id: 'd9' } }),
    );
    // 只有失败后才能关闭（弹窗头部与底栏各有一个关闭入口）
    screen
      .getAllByRole('button', { name: '关闭' })
      .forEach((button) => expect(button).toBeEnabled());
  });

  it('失败项重试只对远程来源可用：上传来源的失败项给「回到原入口」的说明（把上传也当成可重试时本用例必须失败）', async () => {
    sdk.confirmPersonal.mockResolvedValue(
      ok([{ slug: 'alpha', success: false, error: '无权限' }]),
    );
    renderFlow({ kind: 'draft', title: '安装 SKILL.md', drafts: [draft()] });
    await screen.findByText('确认安装内容');
    await userEvent.click(
      screen.getByRole('button', { name: /确认安装 1 个 Skill/ }),
    );

    expect(await screen.findByText('Skill 安装失败')).toBeTruthy();
    expect(screen.getByTestId('install-status-list').textContent).toContain(
      '无权限',
    );
    await userEvent.click(
      screen.getByRole('button', { name: '重新加载失败项' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '该失败项需要从原入口重新上传',
    );
    expect(sdk.remotePrepare).not.toHaveBeenCalled();
  });

  it('远程失败项重试会重新解析同一个来源', async () => {
    sdk.remotePrepare.mockResolvedValue(
      ok(draft({ source_type: 'remote', source: 'owner/repo' })),
    );
    sdk.confirmPersonal.mockResolvedValue(
      ok([{ slug: 'alpha', success: false, error: '网络中断' }]),
    );
    renderFlow({
      kind: 'remote',
      title: '远程安装 Skill',
      requests: [{ source: 'owner/repo', skills: ['alpha'] }],
    });
    await screen.findByText('确认安装内容');
    await userEvent.click(
      screen.getByRole('button', { name: /确认安装 1 个 Skill/ }),
    );
    await screen.findByText('Skill 安装失败');

    sdk.remotePrepare.mockClear();
    await userEvent.click(
      screen.getByRole('button', { name: '重新加载失败项' }),
    );
    await waitFor(() =>
      expect(sdk.remotePrepare).toHaveBeenCalledWith({
        body: { source: 'owner/repo', skills: ['alpha'] },
      }),
    );
  });

  it('确认列表里可以移除条目：整份被移除时不再发确认请求，只丢弃草稿', async () => {
    renderFlow({ kind: 'draft', title: '安装 SKILL.md', drafts: [draft()] });
    await screen.findByText('确认安装内容');

    await userEvent.click(screen.getByRole('button', { name: '移除 alpha' }));
    expect(
      screen.getByRole('button', { name: /确认安装 0 个 Skill/ }),
    ).toBeDisabled();
  });

  it('安装中不可用 Esc 或关闭按钮中止（把 canClose 放宽时本用例必须失败）', async () => {
    let resolveConfirm: ((value: unknown) => void) | undefined;
    sdk.confirmPersonal.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    const handlers = renderFlow({
      kind: 'draft',
      title: '安装 SKILL.md',
      drafts: [draft()],
    });
    await screen.findByText('确认安装内容');
    await userEvent.click(
      screen.getByRole('button', { name: /确认安装 1 个 Skill/ }),
    );

    await screen.findByText(/正在安装 1 个 Skill/);
    expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(handlers.onClose).not.toHaveBeenCalled();

    resolveConfirm?.(ok([{ slug: 'alpha', success: true }]));
    expect(await screen.findByText('全部 Skill 安装完成')).toBeTruthy();
  });

  it('远程选择区里可以拉取来源并解析选中项（选择区不发请求直接解析时本用例必须失败）', async () => {
    sdk.remoteList.mockResolvedValue(
      ok([{ name: 'alpha', description: '演示' }]),
    );
    renderFlow({ kind: 'remote', title: '远程安装 Skill' });

    await screen.findByTestId('remote-picker');
    await userEvent.type(screen.getByLabelText('来源仓库'), 'owner/repo');
    await userEvent.click(screen.getByRole('button', { name: '拉取技能' }));
    await waitFor(() =>
      expect(sdk.remoteList).toHaveBeenCalledWith({
        body: { source: 'owner/repo' },
      }),
    );

    // 只发现一个 Skill 时自动选中
    const row = await screen.findByRole('checkbox', { name: 'alpha' });
    expect(row).toBeChecked();
    expect(screen.getByTestId('install-footer-summary').textContent).toContain(
      '已选 1 / 共发现 1 个 Skill',
    );

    sdk.remotePrepare.mockResolvedValue(
      ok(draft({ source_type: 'remote', source: 'owner/repo' })),
    );
    await userEvent.click(screen.getByRole('button', { name: '解析并确认' }));
    await waitFor(() =>
      expect(sdk.remotePrepare).toHaveBeenCalledWith({
        body: { source: 'owner/repo', skills: ['alpha'] },
      }),
    );
    expect(await screen.findByText('确认安装内容')).toBeTruthy();
    expect(
      within(screen.getByTestId('review-list')).getByText('alpha'),
    ).toBeTruthy();
  });
});
