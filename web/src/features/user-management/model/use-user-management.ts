/** 用户管理面板的状态与动作。 */
import * as React from 'react';

import { useDepartments } from '@/entities/department';
import { useIsSuperuser, useUser } from '@/entities/session';
import {
  useCreateManagedUser,
  useDeleteManagedUser,
  useManagedUsers,
  useUpdateManagedUser,
  validateUsernameAndGenerateUid,
  type ManagedUser,
  type ManagedUserQuery,
} from '@/entities/user-admin';
import { describeFailure } from '@/shared/api';
import { useDebouncedValue } from '@/shared/lib';
import { useConfirm } from '@/shared/ui/confirm-dialog';

import {
  DEFAULT_PAGE_SIZE,
  validateUserForm,
  type UserFormValues,
} from '../lib/user-management';

const EMPTY_FORM: UserFormValues = {
  username: '',
  phoneNumber: '',
  password: '',
  confirmPassword: '',
  role: 'user',
  departmentId: null,
};

/** 搜索防抖时长。 */
const SEARCH_DEBOUNCE_MS = 250;

export type UserManagement = {
  users: ManagedUser[];
  total: number;
  isLoading: boolean;
  refreshing: boolean;
  isSuperuser: boolean;
  searchInput: string;
  departmentFilter: string;
  roleFilter: string;
  departmentOptions: Array<{ value: string; label: string }>;
  hasActiveFilters: boolean;
  page: number;
  pageSize: number;
  modalOpen: boolean;
  editingUser: ManagedUser | null;
  values: UserFormValues;
  /** 编辑态是否展开密码字段。 */
  displayPasswordFields: boolean;
  generatedUid: string;
  usernameError: string | null;
  saving: boolean;
  setSearchInput: (value: string) => void;
  setDepartmentFilter: (value: string) => void;
  setRoleFilter: (value: string) => void;
  changePage: (page: number, pageSize: number) => void;
  openCreate: () => void;
  openEdit: (user: ManagedUser) => void;
  closeModal: () => void;
  changeValue: (patch: Partial<UserFormValues>) => void;
  setDisplayPasswordFields: (value: boolean) => void;
  /** 失焦时校验用户名并取回登录 ID。 */
  checkUsername: () => Promise<void>;
  submit: () => Promise<void>;
  remove: (user: ManagedUser) => Promise<void>;
  isDeleteDisabled: (user: ManagedUser) => boolean;
  refresh: () => Promise<void>;
};

export const useUserManagement = (options: {
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
}): UserManagement => {
  const { notifySuccess, notifyError } = options;
  const isSuperuser = useIsSuperuser();
  const currentUser = useUser().data;
  const { confirm } = useConfirm();

  const [searchInput, setSearchInput] = React.useState('');
  const [departmentFilter, setDepartmentFilter] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<ManagedUser | null>(
    null,
  );
  const [values, setValues] = React.useState<UserFormValues>(EMPTY_FORM);
  const [displayPasswordFields, setDisplayPasswordFields] =
    React.useState(true);
  const [generatedUid, setGeneratedUid] = React.useState('');
  const [usernameError, setUsernameError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const usernameRequestRef = React.useRef(0);

  const search = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  /** 某个页码对应的查询参数；筛选与分页一起进 query key。 */
  const buildQuery = React.useCallback(
    (targetPage: number): ManagedUserQuery => {
      const departmentId = departmentFilter
        ? Number(departmentFilter)
        : undefined;
      const trimmed = search.trim();

      return {
        offset: (targetPage - 1) * pageSize,
        limit: pageSize,
        ...(trimmed ? { search: trimmed } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(roleFilter ? { role: roleFilter } : {}),
      };
    },
    [departmentFilter, pageSize, roleFilter, search],
  );

  // 越界页收敛：总数与页码无关，所以先用「请求页」把总数取回来（换 key 时上一份数据由
  // keepPreviousData 兜住），再按总数算出有效页；页码在范围内时两次 useQuery 同 key，
  // TanStack 会去重成一次请求。这样删除、刷新与后台重取后都不会停在空页上。
  const requested = useManagedUsers(
    React.useMemo(() => buildQuery(page), [buildQuery, page]),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(requested.total / pageSize)),
  );
  const { users, total, isLoading, refetch } = useManagedUsers(
    React.useMemo(() => buildQuery(currentPage), [buildQuery, currentPage]),
  );

  const { departments, refetch: refetchDepartments } =
    useDepartments(isSuperuser);

  const createMutation = useCreateManagedUser();
  const updateMutation = useUpdateManagedUser();
  const deleteMutation = useDeleteManagedUser();

  // 改筛选就回到第一页：分页与筛选一起决定 query key，留在旧页会取到空列表
  const applySearch = React.useCallback((value: string) => {
    setSearchInput(value);
    setPage(1);
  }, []);

  const applyDepartmentFilter = React.useCallback((value: string) => {
    setDepartmentFilter(value);
    setPage(1);
  }, []);

  const applyRoleFilter = React.useCallback((value: string) => {
    setRoleFilter(value);
    setPage(1);
  }, []);

  const departmentOptions = React.useMemo(() => {
    const options = new Map<string, string>();
    for (const department of departments) {
      options.set(String(department.id), department.name);
    }
    // 普通管理员拿不到全部部门列表，用它可见用户的部门名兜底
    for (const user of users) {
      if (user.departmentId === null && !user.departmentName) continue;
      const value = String(user.departmentId ?? user.departmentName);
      if (!options.has(value)) {
        options.set(value, user.departmentName || `部门 ${user.departmentId}`);
      }
    }

    return [...options].map(([value, label]) => ({ value, label }));
  }, [departments, users]);

  const hasActiveFilters = Boolean(
    searchInput.trim() || departmentFilter || roleFilter,
  );

  const changeValue = React.useCallback((patch: Partial<UserFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    if (patch.username !== undefined) {
      usernameRequestRef.current += 1;
      setUsernameError(null);
      setGeneratedUid('');
    }
  }, []);

  const openCreate = React.useCallback(() => {
    usernameRequestRef.current += 1;
    setEditingUser(null);
    setValues(EMPTY_FORM);
    setGeneratedUid('');
    setUsernameError(null);
    setDisplayPasswordFields(true);
    setModalOpen(true);
  }, []);

  const openEdit = React.useCallback((user: ManagedUser) => {
    usernameRequestRef.current += 1;
    setEditingUser(user);
    setValues({
      username: user.username,
      phoneNumber: user.phoneNumber,
      password: '',
      confirmPassword: '',
      role: user.role,
      departmentId: user.departmentId,
    });
    setGeneratedUid(user.uid);
    setUsernameError(null);
    setDisplayPasswordFields(false);
    setModalOpen(true);
  }, []);

  const closeModal = React.useCallback(() => {
    usernameRequestRef.current += 1;
    setModalOpen(false);
  }, []);

  const togglePasswordFields = React.useCallback((value: boolean) => {
    setDisplayPasswordFields(value);
    if (!value) {
      setValues((current) => ({
        ...current,
        password: '',
        confirmPassword: '',
      }));
    }
  }, []);

  const checkUsername = React.useCallback(async () => {
    const username = values.username.trim();
    if (!username || editingUser) return;

    const requestId = usernameRequestRef.current + 1;
    usernameRequestRef.current = requestId;
    try {
      const result = await validateUsernameAndGenerateUid(username);
      if (usernameRequestRef.current !== requestId) return;
      setGeneratedUid(result.uid);
      setUsernameError(null);
    } catch (failure) {
      if (usernameRequestRef.current !== requestId) return;
      setGeneratedUid('');
      setUsernameError(describeFailure(failure, '用户名验证失败'));
    }
  }, [editingUser, values.username]);

  const changePage = React.useCallback(
    (nextPage: number, nextPageSize: number) => {
      setPageSize(nextPageSize);
      setPage(nextPageSize === pageSize ? nextPage : 1);
    },
    [pageSize],
  );

  const refresh = React.useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchDepartments()]);
      notifySuccess('刷新成功');
    } finally {
      setRefreshing(false);
    }
  }, [notifySuccess, refetch, refetchDepartments, refreshing]);

  const isDeleteDisabled = React.useCallback(
    (user: ManagedUser) =>
      user.id === currentUser?.id ||
      (user.role === 'superadmin' && !isSuperuser),
    [currentUser?.id, isSuperuser],
  );

  const submit = React.useCallback(async () => {
    const error = validateUserForm(values, {
      withPassword: displayPasswordFields,
    });
    if (error) {
      notifyError(error);
      return;
    }

    const username = values.username.trim();
    const phoneNumber = values.phoneNumber.trim();
    const departmentId =
      isSuperuser && values.departmentId ? values.departmentId : undefined;

    setSaving(true);
    try {
      if (editingUser) {
        await updateMutation.mutateAsync({
          id: editingUser.id,
          input: {
            username,
            ...(phoneNumber ? { phoneNumber } : {}),
            ...(departmentId ? { departmentId } : {}),
            ...(displayPasswordFields && values.password
              ? { password: values.password }
              : {}),
          },
        });
        notifySuccess('用户更新成功');
      } else {
        await createMutation.mutateAsync({
          username,
          password: values.password,
          role: values.role,
          ...(phoneNumber ? { phoneNumber } : {}),
          ...(departmentId ? { departmentId } : {}),
        });
        notifySuccess('用户创建成功');
      }

      setModalOpen(false);
    } catch (failure) {
      notifyError(describeFailure(failure, '操作失败，请稍后重试'));
    } finally {
      setSaving(false);
    }
  }, [
    createMutation,
    displayPasswordFields,
    editingUser,
    isSuperuser,
    notifyError,
    notifySuccess,
    updateMutation,
    values,
  ]);

  const remove = React.useCallback(
    async (user: ManagedUser) => {
      if (user.id === currentUser?.id) {
        notifyError('不能删除自己的账户');
        return;
      }

      const confirmed = await confirm({
        title: '确认删除用户',
        description: `确定要删除用户 "${user.username}" 吗？此操作不可撤销。`,
        confirmText: '删除',
        cancelText: '取消',
        destructive: true,
      });
      if (!confirmed) return;

      try {
        await deleteMutation.mutateAsync(user.id);
        notifySuccess('用户删除成功');
      } catch (failure) {
        notifyError(describeFailure(failure, '删除失败，请稍后重试'));
      }
    },
    [confirm, currentUser?.id, deleteMutation, notifyError, notifySuccess],
  );

  return {
    users,
    total,
    isLoading,
    refreshing,
    isSuperuser,
    searchInput,
    departmentFilter,
    roleFilter,
    departmentOptions,
    hasActiveFilters,
    page: currentPage,
    pageSize,
    modalOpen,
    editingUser,
    values,
    displayPasswordFields,
    generatedUid,
    usernameError,
    saving,
    setSearchInput: applySearch,
    setDepartmentFilter: applyDepartmentFilter,
    setRoleFilter: applyRoleFilter,
    changePage,
    openCreate,
    openEdit,
    closeModal,
    changeValue,
    setDisplayPasswordFields: togglePasswordFields,
    checkUsername,
    submit,
    remove,
    isDeleteDisabled,
    refresh,
  };
};
