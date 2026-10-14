/**
 * 用户管理切片的对外接口。用户管理面板与部门创建（UID 预检）都从这里引用。
 */
export {
  checkUidAvailable,
  createManagedUser,
  deleteManagedUser,
  listManagedUsers,
  updateManagedUser,
  validateUsernameAndGenerateUid,
} from './api/user-admin-api';
export type {
  GeneratedUid,
  ManagedUser,
  ManagedUserCreateInput,
  ManagedUserPage,
  ManagedUserQuery,
  ManagedUserUpdateInput,
} from './api/user-admin-api';
export {
  MANAGED_USERS_QUERY_ROOT,
  managedUsersQueryKey,
  useCreateManagedUser,
  useDeleteManagedUser,
  useManagedUsers,
  useUpdateManagedUser,
} from './model/user-admin-queries';
