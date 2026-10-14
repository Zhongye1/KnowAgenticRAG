import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  readUsersPageApiAuthUsersPageGet: vi.fn(),
  createUserApiAuthUsersPost: vi.fn(),
  updateUserApiAuthUsersUserIdPut: vi.fn(),
  deleteUserApiAuthUsersUserIdDelete: vi.fn(),
  validateUsernameAndGenerateUidApiAuthValidateUsernamePost: vi.fn(),
  checkUidAvailabilityApiAuthCheckUidUidGet: vi.fn(),
}));

vi.mock('@/shared/api/generated/sdk.gen', () => sdk);

const {
  checkUidAvailable,
  createManagedUser,
  listManagedUsers,
  updateManagedUser,
  validateUsernameAndGenerateUid,
} = await import('@/entities/user-admin');

beforeEach(() => {
  for (const fn of Object.values(sdk)) fn.mockReset();
});

describe('listManagedUsers', () => {
  it('未设置的筛选不发出去，避免后端按空串筛选', async () => {
    sdk.readUsersPageApiAuthUsersPageGet.mockResolvedValue({
      data: { items: [], total: 0, limit: 20, offset: 0 },
    });

    await listManagedUsers({ offset: 0, limit: 20, search: '', role: '' });

    expect(sdk.readUsersPageApiAuthUsersPageGet).toHaveBeenCalledWith({
      query: { offset: 0, limit: 20 },
    });
  });

  it('筛选齐了按 snake_case 透传，并把行折成界面形状', async () => {
    sdk.readUsersPageApiAuthUsersPageGet.mockResolvedValue({
      data: {
        items: [
          {
            id: 9,
            username: 'zwj',
            uid: 'zwj',
            phone_number: '15251638888',
            avatar: null,
            role: 'admin',
            department_id: 2,
            department_name: '研发部',
            created_at: '2026-10-01T00:00:00',
            last_login: '2026-10-13T09:00:00',
          },
        ],
        total: 41,
        limit: 20,
        offset: 20,
      },
    });

    const page = await listManagedUsers({
      offset: 20,
      limit: 20,
      search: 'zwj',
      departmentId: 2,
      role: 'admin',
    });

    expect(sdk.readUsersPageApiAuthUsersPageGet).toHaveBeenCalledWith({
      query: {
        offset: 20,
        limit: 20,
        search: 'zwj',
        department_id: 2,
        role: 'admin',
      },
    });
    expect(page.total).toBe(41);
    expect(page.items).toEqual([
      {
        id: 9,
        username: 'zwj',
        uid: 'zwj',
        phoneNumber: '15251638888',
        avatar: '',
        role: 'admin',
        departmentId: 2,
        departmentName: '研发部',
        lastLogin: '2026-10-13T09:00:00',
      },
    ]);
  });
});

describe('updateManagedUser', () => {
  it('只发出现的字段：后端 UserUpdate 是 extra=forbid，多带字段会被 422', async () => {
    sdk.updateUserApiAuthUsersUserIdPut.mockResolvedValue({
      data: {
        id: 9,
        username: 'zwj',
        uid: 'zwj',
        role: 'user',
        created_at: '2026-10-01T00:00:00',
      },
    });

    await updateManagedUser(9, { username: 'zwj2' });

    expect(sdk.updateUserApiAuthUsersUserIdPut).toHaveBeenCalledWith({
      path: { user_id: 9 },
      body: { username: 'zwj2' },
    });
  });

  it('部门与密码只在显式给出时进请求体', async () => {
    sdk.updateUserApiAuthUsersUserIdPut.mockResolvedValue({
      data: {
        id: 9,
        username: 'zwj',
        uid: 'zwj',
        role: 'user',
        created_at: '2026-10-01T00:00:00',
      },
    });

    await updateManagedUser(9, {
      username: 'zwj',
      departmentId: 3,
      password: 'newsecret',
    });

    expect(sdk.updateUserApiAuthUsersUserIdPut).toHaveBeenCalledWith({
      path: { user_id: 9 },
      body: { username: 'zwj', department_id: 3, password: 'newsecret' },
    });
  });
});

describe('createManagedUser', () => {
  it('未填的手机号与部门发 null', async () => {
    sdk.createUserApiAuthUsersPost.mockResolvedValue({
      data: {
        id: 10,
        username: 'newbie',
        uid: 'newbie',
        role: 'user',
        created_at: '2026-10-03T00:00:00',
      },
    });

    await createManagedUser({
      username: 'newbie',
      password: 'secret123',
      role: 'user',
    });

    expect(sdk.createUserApiAuthUsersPost).toHaveBeenCalledWith({
      body: {
        username: 'newbie',
        password: 'secret123',
        role: 'user',
        phone_number: null,
        department_id: null,
      },
    });
  });
});

describe('validateUsernameAndGenerateUid', () => {
  it('取回后端生成的登录 ID', async () => {
    sdk.validateUsernameAndGenerateUidApiAuthValidateUsernamePost.mockResolvedValue(
      { data: { username: 'zwj', uid: 'zwj_01', is_available: true } },
    );

    await expect(validateUsernameAndGenerateUid('zwj')).resolves.toEqual({
      uid: 'zwj_01',
      isAvailable: true,
    });
  });

  it('后端拒绝时抛出后端文案，界面据此显示在用户名下方', async () => {
    sdk.validateUsernameAndGenerateUidApiAuthValidateUsernamePost.mockResolvedValue(
      {
        error: { detail: '用户名已存在' },
        response: { status: 400 },
      },
    );

    await expect(validateUsernameAndGenerateUid('zwj')).rejects.toThrow(
      '用户名已存在',
    );
  });
});

describe('checkUidAvailable', () => {
  it('is_available 为 true 才算可用', async () => {
    sdk.checkUidAvailabilityApiAuthCheckUidUidGet.mockResolvedValue({
      data: { uid: 'zwj', is_available: false },
    });

    await expect(checkUidAvailable('zwj')).resolves.toBe(false);
  });
});
