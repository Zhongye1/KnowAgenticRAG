import { useMutation } from '@tanstack/react-query';

import { sendEmailCaptcha } from '@/generated/emails/send-email-captcha';
import { MutationConfig } from '@/lib/react-query';

/**
 * 换绑邮箱的第一步：把验证码发到新邮箱（`POST /emails/captcha`）。
 *
 * 该端点属于 email 插件，投递依赖 `EMAIL_*` 配置的 SMTP；未配置时后端会报错，
 * 由调用方原样展示（见 `email-dialog.tsx`），前端不做静默兜底——发不出去却提示
 * 「已发送」比报错更糟。
 */
export const useRequestEmailCaptcha = ({
  mutationConfig,
}: {
  mutationConfig?: MutationConfig<typeof sendEmailCaptcha>;
} = {}) => {
  return useMutation({
    ...mutationConfig,
    mutationFn: sendEmailCaptcha,
  });
};
