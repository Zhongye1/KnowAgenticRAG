import { useMutation } from '@tanstack/react-query';

import { updateUserPassword } from '@/generated/sys-users/update-user-password';
import { MutationConfig } from '@/lib/react-query';

/**
 * 修改当前用户密码（`PUT /sys/users/me/password`）。
 *
 * 与昵称/邮箱不同，改密码不动会话用户对象，所以不需要 refetch；
 * 后端会顺带清掉该用户的 JWT 缓存，下一次请求按既有 401 单飞刷新逻辑换新 token。
 */
export const useUpdatePassword = ({
  mutationConfig,
}: {
  mutationConfig?: MutationConfig<typeof updateUserPassword>;
} = {}) => {
  return useMutation({
    ...mutationConfig,
    mutationFn: updateUserPassword,
  });
};
