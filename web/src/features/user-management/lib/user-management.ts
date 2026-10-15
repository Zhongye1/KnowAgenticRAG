/**
 * 用户管理的筛选表、分页常量与表单校验。
 *
 * 角色文案由 `@/entities/session` 的 `formatUserRole` 提供（与账户设置同一份）；这里只放
 * 本分区特有的筛选项、长度上限与提交前校验。
 */
import { MIN_PASSWORD_LENGTH } from '@/entities/session';
import { validatePhoneNumber, validateUsername } from '@/shared/lib';

export const DEFAULT_PAGE_SIZE = 20;

/** 分页器可选的每页条数。 */
export const PAGE_SIZE_OPTIONS = ['20', '50', '100'];

/** 角色筛选下拉；空串表示不筛选。 */
export const ROLE_FILTER_OPTIONS = [
  { value: '', label: '全部权限' },
  { value: 'superadmin', label: '超级管理员' },
  { value: 'admin', label: '管理员' },
  { value: 'user', label: '普通用户' },
];

export const MAX_PHONE_LENGTH = 11;
export const MAX_PASSWORD_LENGTH = 50;

export type UserFormValues = {
  username: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
  role: string;
  departmentId: number | null;
};

/**
 * 提交前校验；通过返回 null。
 *
 * `withPassword` 为真时才校验密码：编辑态默认不改密码，勾选「修改密码」后才要求填写。
 */
export const validateUserForm = (
  values: UserFormValues,
  options: { withPassword: boolean },
): string | null => {
  if (!values.username.trim()) return '用户名不能为空';

  const usernameError = validateUsername(values.username);
  if (usernameError) return usernameError;

  const phoneError = validatePhoneNumber(values.phoneNumber);
  if (phoneError) return phoneError;

  if (options.withPassword) {
    if (!values.password) return '密码不能为空';
    if (values.password.length < MIN_PASSWORD_LENGTH) {
      return `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`;
    }
    if (values.password !== values.confirmPassword) {
      return '两次输入的密码不一致';
    }
  }

  return null;
};
