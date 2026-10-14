import { describe, expect, it } from 'vitest';

import { validateUserForm } from '@/features/user-management/lib/user-management';

const baseForm = {
  username: 'zwj',
  phoneNumber: '',
  password: 'secret123',
  confirmPassword: 'secret123',
  role: 'user',
  departmentId: null,
};

describe('validateUserForm', () => {
  it('用户名为空给专门文案，而不是长度文案', () => {
    expect(
      validateUserForm({ ...baseForm, username: '  ' }, { withPassword: true }),
    ).toBe('用户名不能为空');
  });

  it('用户名长度与字符集与后端同口径', () => {
    expect(
      validateUserForm({ ...baseForm, username: 'a' }, { withPassword: true }),
    ).toBe('用户名长度必须在 2-20 个字符之间');
    expect(
      validateUserForm(
        { ...baseForm, username: 'zwj-01' },
        { withPassword: true },
      ),
    ).toBe('用户名只能包含中文、英文、数字和下划线');
  });

  it('手机号可选；填了就必须合法', () => {
    expect(
      validateUserForm(
        { ...baseForm, phoneNumber: '15251638888' },
        { withPassword: true },
      ),
    ).toBeNull();
    expect(
      validateUserForm(
        { ...baseForm, phoneNumber: '12345678901' },
        { withPassword: true },
      ),
    ).toBe('请输入正确的手机号格式');
  });

  it('勾了「修改密码」才校验密码', () => {
    const empty = { ...baseForm, password: '', confirmPassword: '' };

    expect(validateUserForm(empty, { withPassword: false })).toBeNull();
    expect(validateUserForm(empty, { withPassword: true })).toBe(
      '密码不能为空',
    );
  });

  it('密码长度与两次一致', () => {
    expect(
      validateUserForm(
        { ...baseForm, password: 'short', confirmPassword: 'short' },
        { withPassword: true },
      ),
    ).toBe('密码至少需要 8 个字符');
    expect(
      validateUserForm(
        { ...baseForm, confirmPassword: 'another123' },
        { withPassword: true },
      ),
    ).toBe('两次输入的密码不一致');
  });
});
