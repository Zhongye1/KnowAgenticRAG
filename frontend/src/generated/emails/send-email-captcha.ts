import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 发送电子邮件验证码 */
export type SendEmailCaptchaParamsData = {
  recipients: string | string[];
};

export const sendEmailCaptcha = (data: SendEmailCaptchaParamsData): Promise<unknown> => {
  return api.post(`/api/v1/emails/captcha`, data).then((res) => res.data);
};

type UseSendEmailCaptchaOptions = {
  mutationConfig?: MutationConfig<typeof sendEmailCaptcha>;
};

export const useSendEmailCaptcha = ({ mutationConfig }: UseSendEmailCaptchaOptions = {}) => {
  return useMutation({
    mutationFn: sendEmailCaptcha,
    ...mutationConfig,
  });
};