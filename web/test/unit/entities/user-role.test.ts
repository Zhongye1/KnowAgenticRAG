import { describe, expect, it } from 'vitest';

import { formatUserRole } from '@/entities/session/lib/user-role';

describe('formatUserRole', () => {
  it('已知角色给出中文文案', () => {
    expect(formatUserRole('superadmin')).toBe('超级管理员');
    expect(formatUserRole('admin')).toBe('管理员');
    expect(formatUserRole('user')).toBe('普通用户');
  });

  it('未知角色不回显原始枚举', () => {
    expect(formatUserRole('guest')).toBe('未知角色');
    expect(formatUserRole('')).toBe('未知角色');
  });

  it('角色缺失时按未知处理', () => {
    expect(formatUserRole(null)).toBe('未知角色');
    expect(formatUserRole(undefined)).toBe('未知角色');
  });
});
