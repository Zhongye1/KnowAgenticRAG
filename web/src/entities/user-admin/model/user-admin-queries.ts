/**
 * 用户管理列表的查询与写入层。
 *
 * query key 里带上筛选与分页参数：每个筛选组合是一份独立缓存，写入后失效整棵前缀。
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import {
  createManagedUser,
  deleteManagedUser,
  listManagedUsers,
  updateManagedUser,
} from '../api/user-admin-api';
import type {
  ManagedUser,
  ManagedUserCreateInput,
  ManagedUserPage,
  ManagedUserQuery,
  ManagedUserUpdateInput,
} from '../api/user-admin-api';

/** 列表 key 前缀；写入后按它失效所有筛选组合。 */
export const MANAGED_USERS_QUERY_ROOT = ['managed-users'] as const;

/** 某个筛选组合的 key。 */
export const managedUsersQueryKey = (query: ManagedUserQuery) =>
  [...MANAGED_USERS_QUERY_ROOT, query] as const;

export const useManagedUsers = (
  query: ManagedUserQuery,
  enabled = true,
): {
  page: ManagedUserPage | undefined;
  users: ManagedUser[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => void;
} => {
  const result = useQuery({
    queryKey: managedUsersQueryKey(query),
    queryFn: () => listManagedUsers(query),
    enabled,
    // 换页/换筛选时保留上一份数据：表格不闪加载态，且调用方在数据到达前仍能读到总数
    // （用户管理的越界页收敛依赖这一点）
    placeholderData: keepPreviousData,
  });

  return {
    page: result.data,
    users: result.data?.items ?? [],
    total: result.data?.total ?? 0,
    isLoading: result.isPending,
    isFetching: result.isFetching,
    refetch: () => void result.refetch(),
  };
};

const useInvalidateManagedUsers = (): (() => void) => {
  const client = useQueryClient();

  return () => {
    void client.invalidateQueries({ queryKey: MANAGED_USERS_QUERY_ROOT });
  };
};

/** 创建用户。 */
export const useCreateManagedUser = (): UseMutationResult<
  ManagedUser,
  Error,
  ManagedUserCreateInput
> => {
  const invalidate = useInvalidateManagedUsers();

  return useMutation({ mutationFn: createManagedUser, onSuccess: invalidate });
};

/** 更新用户。 */
export const useUpdateManagedUser = (): UseMutationResult<
  ManagedUser,
  Error,
  { id: number; input: ManagedUserUpdateInput }
> => {
  const invalidate = useInvalidateManagedUsers();

  return useMutation({
    mutationFn: ({ id, input }) => updateManagedUser(id, input),
    onSuccess: invalidate,
  });
};

/** 删除用户。 */
export const useDeleteManagedUser = (): UseMutationResult<
  void,
  Error,
  number
> => {
  const invalidate = useInvalidateManagedUsers();

  return useMutation({ mutationFn: deleteManagedUser, onSuccess: invalidate });
};
