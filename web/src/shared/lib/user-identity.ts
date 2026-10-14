/**
 * 用户身份字段的校验规则。
 *
 * 规则源是后端 `ars/services/user_identity_service.py`（`validate_username` /
 * `is_valid_phone_number`）：账户设置、用户管理、部门创建三处都用同一套，前端只是提前拦截
 * 给出可行动文案，真正的拒绝仍在服务端。
 */

/** 用户名的字符集；与后端 `validate_username` 同集（中文、英文、数字、下划线）。 */
const USERNAME_PATTERN = /^[一-龥a-zA-Z0-9_]+$/;

/** 手机号格式；与后端 `is_valid_phone_number` 同一正则。 */
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

const USERNAME_MIN_LENGTH = 2;
const USERNAME_MAX_LENGTH = 20;

/** 用户名校验：通过返回 null，不通过返回可直接提示的文案。 */
export const validateUsername = (value: string): string | null => {
  const username = value.trim();
  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH
  ) {
    return '用户名长度必须在 2-20 个字符之间';
  }
  if (!USERNAME_PATTERN.test(username)) {
    return '用户名只能包含中文、英文、数字和下划线';
  }

  return null;
};

/** 手机号校验：空串表示清空，放行；非空时必须是 11 位合法手机号。 */
export const validatePhoneNumber = (value: string): string | null => {
  const phone = value.trim();
  if (!phone) return null;
  if (!PHONE_PATTERN.test(phone)) {
    return '请输入正确的手机号格式';
  }

  return null;
};
