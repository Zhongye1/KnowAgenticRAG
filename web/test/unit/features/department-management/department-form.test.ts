import { describe, expect, it } from 'vitest';

import {
  MAX_ADMIN_UID_LENGTH,
  validateAdminPhone,
  validateAdminUid,
  validateDepartmentForm,
} from '@/features/department-management/lib/department-form';

const baseForm = {
  name: '研发部',
  description: '',
  adminUid: 'dev_admin',
  adminPassword: 'secret123',
  adminConfirmPassword: 'secret123',
  adminPhone: '',
};

describe('validateAdminUid', () => {
  it('字符集与长度与后端同口径', () => {
    expect(validateAdminUid('')).toBe('请输入管理员UID');
    expect(validateAdminUid('ab')).toBe('UID长度必须在3-20个字符之间');
    expect(validateAdminUid('a'.repeat(MAX_ADMIN_UID_LENGTH + 1))).toBe(
      'UID长度必须在3-20个字符之间',
    );
    expect(validateAdminUid('dev-admin')).toBe('UID只能包含字母、数字和下划线');
    expect(validateAdminUid('dev_admin')).toBeNull();
    expect(validateAdminUid('Dev123')).toBeNull();
  });
});

describe('validateAdminPhone', () => {
  it('可选；填了就必须是大陆号码', () => {
    expect(validateAdminPhone('')).toBeNull();
    expect(validateAdminPhone('15251638888')).toBeNull();
    expect(validateAdminPhone('12345678901')).toBe('请输入正确的手机号格式');
  });
});

describe('validateDepartmentForm', () => {
  it('名称非空且至少两个字', () => {
    expect(
      validateDepartmentForm({ ...baseForm, name: '  ' }, { editing: false }),
    ).toBe('部门名称不能为空');
    expect(
      validateDepartmentForm({ ...baseForm, name: '研' }, { editing: false }),
    ).toBe('部门名称至少2个字符');
  });

  it('创建时校验管理员字段：UID、密码长度与两次一致', () => {
    expect(
      validateDepartmentForm({ ...baseForm, adminUid: '' }, { editing: false }),
    ).toBe('请输入管理员UID');
    expect(
      validateDepartmentForm(
        { ...baseForm, adminPassword: '', adminConfirmPassword: '' },
        { editing: false },
      ),
    ).toBe('请输入管理员密码');
    expect(
      validateDepartmentForm(
        { ...baseForm, adminPassword: 'short', adminConfirmPassword: 'short' },
        { editing: false },
      ),
    ).toBe('密码至少需要 8 个字符');
    expect(
      validateDepartmentForm(
        { ...baseForm, adminConfirmPassword: 'another123' },
        { editing: false },
      ),
    ).toBe('两次输入的密码不一致');
  });

  it('编辑时跳过管理员字段——参照在这条路径上照样校验隐藏字段，编辑分支永远提交不出去', () => {
    // 编辑弹窗不渲染管理员输入框，表单里这些字段是空串
    const editingForm = {
      name: '研发部（改名）',
      description: '负责平台',
      adminUid: '',
      adminPassword: '',
      adminConfirmPassword: '',
      adminPhone: '',
    };

    expect(validateDepartmentForm(editingForm, { editing: true })).toBeNull();
    // 同一份值在创建路径上会被管理员 UID 拦下，证明跳过是按模式生效的
    expect(validateDepartmentForm(editingForm, { editing: false })).toBe(
      '请输入管理员UID',
    );
  });

  it('手机号在创建路径上校验', () => {
    expect(
      validateDepartmentForm(
        { ...baseForm, adminPhone: '12345678901' },
        { editing: false },
      ),
    ).toBe('请输入正确的手机号格式');
  });
});
