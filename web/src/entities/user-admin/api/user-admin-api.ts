/**
 * 用户管理端点（管理员面）。
 *
 * 只走契约生成的 SDK。写回只带确实要改的字段：后端 `UserUpdate` 是 `extra="forbid"`，
 * 多带字段会被 422 拒绝。分页与用户名校验的响应契约里都有 schema，直接用生成类型。
 */
import { unwrap } from '@/shared/api';
import {
  checkUidAvailabilityApiAuthCheckUidUidGet,
  createUserApiAuthUsersPost,
  deleteUserApiAuthUsersUserIdDelete,
  readUsersPageApiAuthUsersPageGet,
  updateUserApiAuthUsersUserIdPut,
  validateUsernameAndGenerateUidApiAuthValidateUsernamePost,
} from '@/shared/api/generated/sdk.gen';
import type {
  UserPageResponse,
  UserResponse,
} from '@/shared/api/generated/types.gen';

/** 用户管理表里的一行。 */
export type ManagedUser = {
  id: number;
  username: string;
  uid: string;
  phoneNumber: string;
  avatar: string;
  role: string;
  departmentId: number | null;
  departmentName: string;
  lastLogin: string | null;
};

/** 分页查询参数；未设置的可选字段不发出去（后端按未筛选处理）。 */
export type ManagedUserQuery = {
  offset: number;
  limit: number;
  search?: string;
  departmentId?: number;
  role?: string;
};

export type ManagedUserPage = {
  items: ManagedUser[];
  total: number;
};

/** 新建用户；`departmentId` 只对超管生效，普通管理员继承自己的部门。 */
export type ManagedUserCreateInput = {
  username: string;
  password: string;
  role: string;
  phoneNumber?: string;
  departmentId?: number;
};

/** 编辑用户；只带要改的字段。 */
export type ManagedUserUpdateInput = {
  username?: string;
  password?: string;
  phoneNumber?: string;
  departmentId?: number;
};

/** 用户名可用性校验的返回：可用时给出后端生成的登录 ID。 */
export type GeneratedUid = {
  uid: string;
  isAvailable: boolean;
};

const toManagedUser = (raw: UserResponse): ManagedUser => ({
  id: raw.id,
  username: raw.username,
  uid: raw.uid,
  phoneNumber: raw.phone_number ?? '',
  avatar: raw.avatar ?? '',
  role: raw.role,
  departmentId:
    typeof raw.department_id === 'number' ? raw.department_id : null,
  departmentName: raw.department_name ?? '',
  lastLogin: raw.last_login ?? null,
});

/** 分页查询当前管理员可管理的用户。 */
export async function listManagedUsers(
  query: ManagedUserQuery,
): Promise<ManagedUserPage> {
  const page = unwrap<UserPageResponse>(
    await readUsersPageApiAuthUsersPageGet({
      query: {
        offset: query.offset,
        limit: query.limit,
        ...(query.search ? { search: query.search } : {}),
        ...(query.departmentId ? { department_id: query.departmentId } : {}),
        ...(query.role
          ? { role: query.role as 'superadmin' | 'admin' | 'user' }
          : {}),
      },
    }),
  );

  return {
    items: Array.isArray(page.items) ? page.items.map(toManagedUser) : [],
    total: typeof page.total === 'number' ? page.total : 0,
  };
}

/** 创建用户；响应是新建的用户。 */
export async function createManagedUser(
  input: ManagedUserCreateInput,
): Promise<ManagedUser> {
  const created = unwrap<UserResponse>(
    await createUserApiAuthUsersPost({
      body: {
        username: input.username,
        password: input.password,
        role: input.role,
        phone_number: input.phoneNumber ?? null,
        department_id: input.departmentId ?? null,
      },
    }),
  );

  return toManagedUser(created);
}

/** 更新用户；只发出现的字段（`undefined` 的字段不进请求体）。 */
export async function updateManagedUser(
  id: number,
  input: ManagedUserUpdateInput,
): Promise<ManagedUser> {
  const updated = unwrap<UserResponse>(
    await updateUserApiAuthUsersUserIdPut({
      path: { user_id: id },
      body: {
        ...(input.username !== undefined ? { username: input.username } : {}),
        ...(input.password !== undefined ? { password: input.password } : {}),
        ...(input.phoneNumber !== undefined
          ? { phone_number: input.phoneNumber }
          : {}),
        ...(input.departmentId !== undefined
          ? { department_id: input.departmentId }
          : {}),
      },
    }),
  );

  return toManagedUser(updated);
}

/** 删除用户。 */
export async function deleteManagedUser(id: number): Promise<void> {
  unwrap<unknown>(
    await deleteUserApiAuthUsersUserIdDelete({ path: { user_id: id } }),
  );
}

/** 校验用户名格式与重名，并取回后端生成的登录 ID。 */
export async function validateUsernameAndGenerateUid(
  username: string,
): Promise<GeneratedUid> {
  const result = unwrap<{ uid?: unknown; is_available?: unknown }>(
    await validateUsernameAndGenerateUidApiAuthValidateUsernamePost({
      body: { username },
    }),
  );

  return {
    uid: typeof result.uid === 'string' ? result.uid : '',
    isAvailable: result.is_available !== false,
  };
}

/** 检查 UID 是否可用；部门创建用它做重名预检。 */
export async function checkUidAvailable(uid: string): Promise<boolean> {
  const result = unwrap<{ is_available?: unknown }>(
    await checkUidAvailabilityApiAuthCheckUidUidGet({ path: { uid } }),
  );

  return result.is_available === true;
}
