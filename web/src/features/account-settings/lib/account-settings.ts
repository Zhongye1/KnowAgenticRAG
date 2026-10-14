/**
 * 账户设置页面的取值与判定。
 *
 * 身份字段（用户名、手机号）的规则在 `@/shared/lib` 的 `user-identity`（与后端
 * `user_identity_service.py` 同源），这里只保留本页面特有的头像约束与角色配色。
 * 文案与参照 `AccountSettingsComponent.vue` 逐字一致。
 */

/** 单个头像文件的体积上限；与后端 `upload_image_to_minio` 的 5MB 一致。 */
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

/** 头像文件校验：通过返回 null；文案与参照逐字一致。 */
export const validateAvatarFile = (file: File): string | null => {
  if (!file.type.startsWith('image/')) {
    return '只能上传图片文件！';
  }
  if (file.size / 1024 / 1024 >= 5) {
    return '图片大小不能超过 5MB！';
  }

  return null;
};

/** 角色 → 权限值的展示色；token 名取自参照（红 / 主色 / 绿 / 灰）。 */
export const roleValueColor = (role: string | null | undefined): string => {
  switch (role) {
    case 'superadmin':
      return 'var(--color-error-700)';
    case 'admin':
      return 'var(--main-500)';
    case 'user':
      return 'var(--color-success-500)';
    default:
      return 'var(--gray-600)';
  }
};
