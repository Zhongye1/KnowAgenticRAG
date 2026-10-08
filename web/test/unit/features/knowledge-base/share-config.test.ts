import { describe, expect, it } from 'vitest';

import {
  describeShareConfig,
  isManageScopeWithinRead,
  normalizeShareConfig,
  normalizeShareScope,
  validateShareConfig,
} from '@/features/knowledge-base';
import { describeScope } from '@/features/knowledge-base/lib/share-config';

describe('共享范围归一', () => {
  it('按访问级别清空无关数组并去重', () => {
    expect(
      normalizeShareScope({
        access_level: 'department',
        department_ids: [3, 3, 2],
        user_uids: ['u-1'],
      }),
    ).toEqual({
      access_level: 'department',
      department_ids: [3, 2],
      user_uids: [],
    });

    expect(
      normalizeShareScope({
        access_level: 'user',
        department_ids: [1],
        user_uids: [' u-1 ', 'u-1', ''],
      }),
    ).toEqual({ access_level: 'user', department_ids: [], user_uids: ['u-1'] });

    expect(
      normalizeShareScope({
        access_level: 'global',
        department_ids: [1],
        user_uids: ['u-1'],
      }),
    ).toEqual({ access_level: 'global', department_ids: [], user_uids: [] });
  });

  it('部门 id 按数字处理，非法值丢掉', () => {
    expect(
      normalizeShareScope({
        access_level: 'department',
        department_ids: [3, Number.NaN as unknown as number],
      })?.department_ids,
    ).toEqual([3]);
  });

  it('级别不认识时退回允许列表的第一项', () => {
    expect(
      normalizeShareScope({ access_level: 'team' as never }, ['user', 'global'])
        ?.access_level,
    ).toBe('user');
  });

  it('整体归一：读取范围缺失按全局，管理范围保持可为空', () => {
    expect(normalizeShareConfig(null)).toEqual({
      version: 2,
      read_scope: { access_level: 'global', department_ids: [], user_uids: [] },
      manage_scope: null,
    });
  });
});

describe('管理范围必须落在读取范围内', () => {
  const read = (extra: Record<string, unknown>) =>
    normalizeShareScope({ access_level: 'user', ...extra });

  it('读取是全局时恒成立', () => {
    expect(
      isManageScopeWithinRead(
        normalizeShareScope({ access_level: 'user', user_uids: ['u-1'] }),
        normalizeShareScope({ access_level: 'global' }),
      ),
    ).toBe(true);
  });

  it('级别不同或选了范围外的人/部门都不成立', () => {
    expect(
      isManageScopeWithinRead(
        normalizeShareScope({
          access_level: 'department',
          department_ids: [1],
        }),
        normalizeShareScope({ access_level: 'user', user_uids: ['u-1'] }),
      ),
    ).toBe(false);

    expect(
      isManageScopeWithinRead(
        normalizeShareScope({ access_level: 'user', user_uids: ['u-2'] }),
        read({ user_uids: ['u-1'] }),
      ),
    ).toBe(false);

    expect(
      isManageScopeWithinRead(
        normalizeShareScope({ access_level: 'user', user_uids: ['u-1'] }),
        read({ user_uids: ['u-1'] }),
      ),
    ).toBe(true);
  });
});

describe('共享配置校验与摘要', () => {
  it('越界时给出可行动的说明', () => {
    const config = normalizeShareConfig({
      read_scope: { access_level: 'user', user_uids: ['u-1'] },
      manage_scope: { access_level: 'user', user_uids: ['u-2'] },
    });

    expect(validateShareConfig(config)).toContain('管理范围必须落在读取范围内');
  });

  it('按部门/指定人共享时至少要选一个对象', () => {
    expect(
      validateShareConfig(
        normalizeShareConfig({
          read_scope: { access_level: 'department', department_ids: [] },
        }),
      ),
    ).toContain('至少要选一个部门');
    expect(
      validateShareConfig(
        normalizeShareConfig({
          read_scope: { access_level: 'user', user_uids: [] },
        }),
      ),
    ).toContain('至少要选一个用户');
  });

  it('同级别但管理范围勾了读取范围外的部门时拦下', () => {
    const config = normalizeShareConfig({
      read_scope: { access_level: 'department', department_ids: [3] },
      manage_scope: { access_level: 'department', department_ids: [9] },
    });

    expect(
      isManageScopeWithinRead(config.manage_scope, config.read_scope),
    ).toBe(false);
    expect(validateShareConfig(config)).toContain(
      '管理范围必须落在读取范围内',
    );
  });

  it('管理范围按部门/指定人限定却没选对象时拦下', () => {
    expect(
      validateShareConfig(
        normalizeShareConfig({
          read_scope: { access_level: 'department', department_ids: [3] },
          manage_scope: { access_level: 'department', department_ids: [] },
        }),
      ),
    ).toContain('管理范围按部门共享时至少要选一个部门');
    expect(
      validateShareConfig(
        normalizeShareConfig({
          read_scope: { access_level: 'user', user_uids: ['u-1'] },
          manage_scope: { access_level: 'user', user_uids: [] },
        }),
      ),
    ).toContain('管理范围指定人共享时至少要选一个用户');
  });

  it('合法配置没有报错', () => {
    expect(
      validateShareConfig(
        normalizeShareConfig({
          read_scope: { access_level: 'department', department_ids: [3] },
          manage_scope: { access_level: 'department', department_ids: [3] },
        }),
      ),
    ).toBeNull();
  });

  it('管理范围的摘要按「管理」口径说，不套用读取口径', () => {
    expect(
      describeScope({ access_level: 'department', department_ids: [] }, '管理'),
    ).toBe('0 个部门可管理');
    expect(
      describeScope({ access_level: 'user', user_uids: ['u-1'] }, '管理'),
    ).toBe('1 个用户可管理');
    expect(describeScope({ access_level: 'global' }, '管理')).toBe(
      '所有用户都可以管理',
    );
    // 空范围不等于「所有用户」：后端 scope_matches(None) 为 false，只留创建者与超管
    expect(describeScope(null, '管理')).toBe('未单独设置');
  });

  it('摘要按读取范围给标签与明细', () => {
    expect(describeShareConfig(null)).toEqual({
      label: '全局共享',
      detail: '所有用户都可以访问',
    });
    expect(
      describeShareConfig({
        read_scope: { access_level: 'department', department_ids: [1, 2] },
      }),
    ).toEqual({ label: '部门共享', detail: '2 个部门可访问' });
    expect(
      describeShareConfig({
        read_scope: { access_level: 'user', user_uids: ['u-1'] },
      }),
    ).toEqual({ label: '指定人', detail: '1 个用户可访问' });
  });
});
