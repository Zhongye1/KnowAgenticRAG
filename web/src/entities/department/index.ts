/**
 * 部门切片的对外接口。部门管理面板与用户管理都从这里引用。
 */
export {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} from './api/department-api';
export type {
  Department,
  DepartmentCreateInput,
  DepartmentUpdateInput,
} from './api/department-api';
export {
  DEPARTMENTS_QUERY_KEY,
  useCreateDepartment,
  useDeleteDepartment,
  useDepartments,
  useUpdateDepartment,
} from './model/department-queries';
