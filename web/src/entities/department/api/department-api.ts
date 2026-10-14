/**
 * 部门端点。
 *
 * 只走契约生成的 SDK：列表与写回的响应契约里都有 schema（`DepartmentResponse` /
 * `DepartmentCreate` / `DepartmentUpdate`），直接用生成类型，只把 snake_case 折成界面形状。
 * 权限由后端按 `get_admin_user` / `get_superadmin_user` 判定，前端不做授权判断。
 */
import { unwrap } from '@/shared/api';
import {
  createDepartmentApiDepartmentsPost,
  deleteDepartmentApiDepartmentsDepartmentIdDelete,
  getDepartmentsApiDepartmentsGet,
  updateDepartmentApiDepartmentsDepartmentIdPut,
} from '@/shared/api/generated/sdk.gen';
import type { DepartmentResponse } from '@/shared/api/generated/types.gen';

/** 一个部门；`userCount` 是后端聚合的本部门用户数。 */
export type Department = {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  userCount: number;
};

/** 创建部门要同时建出该部门的管理员（后端 `DepartmentCreate`）。 */
export type DepartmentCreateInput = {
  name: string;
  description?: string;
  adminUid: string;
  adminPassword: string;
  adminPhone?: string;
};

/** 编辑部门只改名称与描述。 */
export type DepartmentUpdateInput = {
  name: string;
  description?: string;
};

const toDepartment = (raw: DepartmentResponse): Department => ({
  id: raw.id,
  name: raw.name,
  description: raw.description ?? '',
  createdAt: raw.created_at,
  userCount: typeof raw.user_count === 'number' ? raw.user_count : 0,
});

/** 部门列表；管理员可读，用户管理的部门筛选与归属选择也用这一份。 */
export async function listDepartments(): Promise<Department[]> {
  const rows = unwrap<DepartmentResponse[]>(
    await getDepartmentsApiDepartmentsGet(),
  );
  return Array.isArray(rows) ? rows.map(toDepartment) : [];
}

/** 创建部门并同时创建其管理员；响应是新建的部门。 */
export async function createDepartment(
  input: DepartmentCreateInput,
): Promise<Department> {
  const created = unwrap<DepartmentResponse>(
    await createDepartmentApiDepartmentsPost({
      body: {
        name: input.name,
        description: input.description ?? null,
        admin_uid: input.adminUid,
        admin_password: input.adminPassword,
        admin_phone: input.adminPhone ?? null,
      },
    }),
  );

  return toDepartment(created);
}

/** 更新部门名称与描述；响应是更新后的部门。 */
export async function updateDepartment(
  id: number,
  input: DepartmentUpdateInput,
): Promise<Department> {
  const updated = unwrap<DepartmentResponse>(
    await updateDepartmentApiDepartmentsDepartmentIdPut({
      path: { department_id: id },
      body: { name: input.name, description: input.description ?? null },
    }),
  );

  return toDepartment(updated);
}

/** 删除部门；部门下的用户由后端迁移到默认部门。 */
export async function deleteDepartment(id: number): Promise<void> {
  unwrap<unknown>(
    await deleteDepartmentApiDepartmentsDepartmentIdDelete({
      path: { department_id: id },
    }),
  );
}
