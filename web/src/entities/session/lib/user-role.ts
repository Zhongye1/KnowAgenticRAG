/**
 * 用户角色的展示文案。
 *
 * 事实源是后端当前用户接口返回的 `role` 字段；未知枚举显示「未知角色」，
 * 不把原始值直接透到界面上。
 */

/** 角色枚举到中文文案；未知角色返回「未知角色」。 */
export function formatUserRole(role: string | null | undefined): string {
  switch (role) {
    case 'superadmin':
      return '超级管理员';
    case 'admin':
      return '管理员';
    case 'user':
      return '普通用户';
    default:
      return '未知角色';
  }
}
