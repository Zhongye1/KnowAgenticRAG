/**
 * 部门列表的查询与写入层。
 *
 * query key 的唯一事实在这里：部门管理面板与用户管理的部门筛选/归属选择读同一份缓存，
 * 三个写入统一失效它。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} from '../api/department-api';
import type {
  Department,
  DepartmentCreateInput,
  DepartmentUpdateInput,
} from '../api/department-api';

/** 列表查询的 key；写入后按它失效。 */
export const DEPARTMENTS_QUERY_KEY = ['departments'] as const;

export const useDepartments = (
  enabled = true,
): {
  departments: Department[];
  isLoading: boolean;
  refetch: () => void;
} => {
  const query = useQuery({
    queryKey: DEPARTMENTS_QUERY_KEY,
    queryFn: listDepartments,
    enabled,
  });

  return {
    departments: query.data ?? [],
    isLoading: query.isPending,
    refetch: () => void query.refetch(),
  };
};

const useInvalidateDepartments = (): (() => void) => {
  const client = useQueryClient();

  return () => {
    void client.invalidateQueries({ queryKey: DEPARTMENTS_QUERY_KEY });
  };
};

/** 创建部门（同时建出该部门的管理员）。 */
export const useCreateDepartment = (): UseMutationResult<
  Department,
  Error,
  DepartmentCreateInput
> => {
  const invalidate = useInvalidateDepartments();

  return useMutation({ mutationFn: createDepartment, onSuccess: invalidate });
};

/** 更新部门名称与描述。 */
export const useUpdateDepartment = (): UseMutationResult<
  Department,
  Error,
  { id: number; input: DepartmentUpdateInput }
> => {
  const invalidate = useInvalidateDepartments();

  return useMutation({
    mutationFn: ({ id, input }) => updateDepartment(id, input),
    onSuccess: invalidate,
  });
};

/** 删除部门。 */
export const useDeleteDepartment = (): UseMutationResult<
  void,
  Error,
  number
> => {
  const invalidate = useInvalidateDepartments();

  return useMutation({ mutationFn: deleteDepartment, onSuccess: invalidate });
};
