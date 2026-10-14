import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  getDepartmentsApiDepartmentsGet: vi.fn(),
  createDepartmentApiDepartmentsPost: vi.fn(),
  updateDepartmentApiDepartmentsDepartmentIdPut: vi.fn(),
  deleteDepartmentApiDepartmentsDepartmentIdDelete: vi.fn(),
}));

vi.mock('@/shared/api/generated/sdk.gen', () => sdk);

const {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} = await import('@/entities/department');

beforeEach(() => {
  for (const fn of Object.values(sdk)) fn.mockReset();
});

describe('listDepartments', () => {
  it('把 snake_case 折成界面形状，缺 user_count 按 0', async () => {
    sdk.getDepartmentsApiDepartmentsGet.mockResolvedValue({
      data: [
        {
          id: 1,
          name: '默认部门',
          description: null,
          created_at: '2026-10-01T00:00:00',
          user_count: 3,
        },
        { id: 2, name: '研发部', created_at: '2026-10-02T00:00:00' },
      ],
    });

    await expect(listDepartments()).resolves.toEqual([
      {
        id: 1,
        name: '默认部门',
        description: '',
        createdAt: '2026-10-01T00:00:00',
        userCount: 3,
      },
      {
        id: 2,
        name: '研发部',
        description: '',
        createdAt: '2026-10-02T00:00:00',
        userCount: 0,
      },
    ]);
  });

  it('响应不是数组时给空列表，而不是让整份列表炸掉', async () => {
    sdk.getDepartmentsApiDepartmentsGet.mockResolvedValue({ data: null });

    await expect(listDepartments()).resolves.toEqual([]);
  });
});

describe('createDepartment', () => {
  it('未填的描述与手机号发 null，而不是空串', async () => {
    sdk.createDepartmentApiDepartmentsPost.mockResolvedValue({
      data: { id: 5, name: '市场部', created_at: '2026-10-03T00:00:00' },
    });

    await createDepartment({
      name: '市场部',
      adminUid: 'market_admin',
      adminPassword: 'secret123',
    });

    expect(sdk.createDepartmentApiDepartmentsPost).toHaveBeenCalledWith({
      body: {
        name: '市场部',
        description: null,
        admin_uid: 'market_admin',
        admin_password: 'secret123',
        admin_phone: null,
      },
    });
  });

  it('填了描述与手机号就原样透传', async () => {
    sdk.createDepartmentApiDepartmentsPost.mockResolvedValue({
      data: { id: 5, name: '市场部', created_at: '2026-10-03T00:00:00' },
    });

    await createDepartment({
      name: '市场部',
      description: '负责增长',
      adminUid: 'market_admin',
      adminPassword: 'secret123',
      adminPhone: '15251638888',
    });

    expect(sdk.createDepartmentApiDepartmentsPost).toHaveBeenCalledWith({
      body: {
        name: '市场部',
        description: '负责增长',
        admin_uid: 'market_admin',
        admin_password: 'secret123',
        admin_phone: '15251638888',
      },
    });
  });
});

describe('updateDepartment', () => {
  it('只改名称与描述，路径带部门 id', async () => {
    sdk.updateDepartmentApiDepartmentsDepartmentIdPut.mockResolvedValue({
      data: { id: 7, name: '新名字', created_at: '2026-10-03T00:00:00' },
    });

    await updateDepartment(7, { name: '新名字' });

    expect(
      sdk.updateDepartmentApiDepartmentsDepartmentIdPut,
    ).toHaveBeenCalledWith({
      path: { department_id: 7 },
      body: { name: '新名字', description: null },
    });
  });
});

describe('deleteDepartment', () => {
  it('走部门 id 的 DELETE，后端拒绝时抛 ApiError 文案', async () => {
    sdk.deleteDepartmentApiDepartmentsDepartmentIdDelete.mockResolvedValue({
      data: { success: true },
    });

    await deleteDepartment(1);
    expect(
      sdk.deleteDepartmentApiDepartmentsDepartmentIdDelete,
    ).toHaveBeenCalledWith({ path: { department_id: 1 } });

    sdk.deleteDepartmentApiDepartmentsDepartmentIdDelete.mockResolvedValue({
      error: { detail: '默认部门不允许删除' },
      response: { status: 400 },
    });

    await expect(deleteDepartment(1)).rejects.toThrow('默认部门不允许删除');
  });
});
