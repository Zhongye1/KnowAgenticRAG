import { useMutation } from '@tanstack/react-query';

import { updateUserEmail } from '@/generated/sys-users/update-user-email';
import { useUser } from '@/lib/auth';
import { MutationConfig } from '@/lib/react-query';

/**
 * 换绑邮箱的第二步：带验证码提交（`PUT /sys/users/me/email`）。
 *
 * 验证码由 `request-email-captcha.ts` 发到**新邮箱**，且后端按请求 IP 存码
 * （`user_service.update_email` 读 `email_captcha:{ip}`），所以两步必须同源同 IP 完成。
 * 成功后会话用户里的 email 变了，refetch 同步资料卡。
 */
export const useUpdateEmail = ({
  mutationConfig,
}: {
  mutationConfig?: MutationConfig<typeof updateUserEmail>;
} = {}) => {
  const { refetch } = useUser();
  const { onSuccess, ...restConfig } = mutationConfig ?? {};

  return useMutation({
    onSuccess: (...args) => {
      refetch();
      onSuccess?.(...args);
    },
    ...restConfig,
    mutationFn: updateUserEmail,
  });
};
