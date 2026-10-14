import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ManagedUserQuery } from '@/entities/user-admin';

/**
 * 用户管理控制器的分页收敛。
 *
 * 页面自己挂载时页码是 1，越界只可能来自「停在某一页时总数变小」（自己的删除、刷新或后台
 * 重取）。这里断言有效页会跟着总数收敛，而不是停在空页上。
 */
const mocks = vi.hoisted(() => ({
  total: 45,
  queries: [] as Array<Record<string, unknown>>,
  refetch: vi.fn(),
  deleteUser: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('@/entities/session', () => ({
  MIN_PASSWORD_LENGTH: 8,
  useUser: () => ({ data: { id: 1, role: 'superadmin' } }),
  useIsSuperuser: () => true,
  useIsAdmin: () => true,
  formatUserRole: () => '普通用户',
}));

vi.mock('@/entities/department', () => ({
  useDepartments: () => ({ departments: [], refetch: vi.fn() }),
}));

vi.mock('@/entities/user-admin', () => ({
  useManagedUsers: (query: ManagedUserQuery) => {
    mocks.queries.push(query as unknown as Record<string, unknown>);
    return {
      users: [],
      total: mocks.total,
      isLoading: false,
      refetch: mocks.refetch,
    };
  },
  useCreateManagedUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateManagedUser: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteManagedUser: () => ({
    mutateAsync: mocks.deleteUser,
    isPending: false,
  }),
  validateUsernameAndGenerateUid: vi.fn(),
}));

vi.mock('@/shared/ui/confirm-dialog', () => ({
  useConfirm: () => ({ confirm: mocks.confirm }),
}));

const { useUserManagement } =
  await import('@/features/user-management/model/use-user-management');

/** 每次渲染里最后一次查询就是生效的那一次（越界时前一次是请求页）。 */
const effectiveQuery = () => mocks.queries[mocks.queries.length - 1];

const renderManagement = () =>
  renderHook(() =>
    useUserManagement({ notifySuccess: vi.fn(), notifyError: vi.fn() }),
  );

beforeEach(() => {
  mocks.total = 45;
  mocks.queries = [];
  mocks.refetch.mockReset();
  mocks.deleteUser.mockReset().mockResolvedValue(undefined);
  mocks.confirm.mockReset().mockResolvedValue(true);
});

describe('页码收敛', () => {
  it('范围内按请求页取数', () => {
    const { result } = renderManagement();

    expect(result.current.page).toBe(1);
    expect(effectiveQuery().offset).toBe(0);

    act(() => result.current.changePage(3, 20));

    expect(result.current.page).toBe(3);
    expect(effectiveQuery().offset).toBe(40);
  });

  it('总数变小后收敛到最后一页，而不是停在空页', () => {
    const { result, rerender } = renderManagement();

    act(() => result.current.changePage(3, 20));
    expect(result.current.page).toBe(3);

    // 别处删了用户：45 → 5，只剩一页
    mocks.total = 5;
    rerender();

    expect(result.current.page).toBe(1);
    expect(effectiveQuery().offset).toBe(0);
  });

  it('改筛选回到第一页', () => {
    const { result } = renderManagement();

    act(() => result.current.changePage(3, 20));
    expect(result.current.page).toBe(3);

    act(() => result.current.setRoleFilter('admin'));

    expect(result.current.page).toBe(1);
    expect(effectiveQuery().offset).toBe(0);
    expect(effectiveQuery().role).toBe('admin');
  });

  it('换每页条数时回到第一页，条数不变时只换页', () => {
    // 120 位用户：每页 50 时有 3 页，页码 2 在范围内
    mocks.total = 120;
    const { result } = renderManagement();

    act(() => result.current.changePage(2, 50));
    expect(result.current.pageSize).toBe(50);
    expect(result.current.page).toBe(1);

    act(() => result.current.changePage(2, 50));
    expect(result.current.page).toBe(2);
    expect(effectiveQuery().offset).toBe(50);
  });
});

describe('删除后的页码', () => {
  it('删掉最后一页的最后一条后收敛到新的最后一页', async () => {
    const { result, rerender } = renderManagement();

    act(() => result.current.changePage(3, 20));
    expect(result.current.page).toBe(3);

    mocks.total = 40;
    await act(async () => {
      await result.current.remove({
        id: 9,
        username: 'zwj',
        uid: 'zwj',
        phoneNumber: '',
        avatar: '',
        role: 'user',
        departmentId: null,
        departmentName: '',
        lastLogin: null,
      });
    });
    rerender();

    expect(mocks.deleteUser).toHaveBeenCalledWith(9);
    expect(result.current.page).toBe(2);
    expect(effectiveQuery().offset).toBe(20);
  });
});
