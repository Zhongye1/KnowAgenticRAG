/**
 * 部门表单的校验规则。
 *
 * 与后端 `auth_dept_router` 同一套约束：部门名非空、管理员 UID 为 3–20 位字母/数字/下划线、
 * 密码至少 `MIN_PASSWORD_LENGTH` 位、手机号可选但必须是大陆号码。这里只做提交前的即时反馈，
 * 最终判定仍在后端。
 */
import { MIN_PASSWORD_LENGTH } from '@/entities/session';
import { validatePhoneNumber } from '@/shared/lib';

/** 管理员 UID 的字符集；与后端 `^[a-zA-Z0-9_]+$` 同值。 */
const ADMIN_UID_PATTERN = /^[a-zA-Z0-9_]+$/;

const MIN_DEPARTMENT_NAME_LENGTH = 2;
const MIN_ADMIN_UID_LENGTH = 3;
export const MAX_ADMIN_UID_LENGTH = 20;

/** 输入框长度上限。 */
export const MAX_DEPARTMENT_NAME_LENGTH = 50;
export const MAX_DEPARTMENT_DESCRIPTION_LENGTH = 255;
export const MAX_PHONE_LENGTH = 11;

export type DepartmentFormValues = {
  name: string;
  description: string;
  adminUid: string;
  adminPassword: string;
  adminConfirmPassword: string;
  adminPhone: string;
};

/** 管理员 UID 的静态校验（不含重名预检）；通过时返回 null。 */
export const validateAdminUid = (uid: string): string | null => {
  if (!uid) return '请输入管理员UID';
  if (!ADMIN_UID_PATTERN.test(uid)) return 'UID只能包含字母、数字和下划线';
  if (uid.length < MIN_ADMIN_UID_LENGTH || uid.length > MAX_ADMIN_UID_LENGTH) {
    return 'UID长度必须在3-20个字符之间';
  }

  return null;
};

/** 手机号可选；填了就必须是大陆号码。 */
export const validateAdminPhone = (phone: string): string | null =>
  validatePhoneNumber(phone);

/** 提交前的整表校验；通过时返回 null。 */
export const validateDepartmentForm = (
  values: DepartmentFormValues,
  options: { editing: boolean },
): string | null => {
  const name = values.name.trim();
  if (!name) return '部门名称不能为空';
  if (name.length < MIN_DEPARTMENT_NAME_LENGTH) return '部门名称至少2个字符';

  if (!options.editing) {
    const uidError = validateAdminUid(values.adminUid.trim());
    if (uidError) return uidError;
    if (!values.adminPassword) return '请输入管理员密码';
    if (values.adminPassword.length < MIN_PASSWORD_LENGTH) {
      return `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`;
    }
    if (values.adminPassword !== values.adminConfirmPassword) {
      return '两次输入的密码不一致';
    }
  }

  return validateAdminPhone(values.adminPhone.trim());
};
