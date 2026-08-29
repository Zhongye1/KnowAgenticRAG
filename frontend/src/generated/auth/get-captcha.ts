import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetCaptchaDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取登录验证码 */

export const getCaptcha = (): Promise<GetCaptchaDetail> => {
  return api.get(`/api/v1/auth/captcha`).then((res) => res.data);
};

export const getCaptchaQueryOptions = () => {
  return queryOptions({
    queryKey: ['auth', 'get-captcha'],
    queryFn: () => getCaptcha(),
  });
};

type UseGetCaptchaOptions = {
  queryConfig?: QueryConfig<typeof getCaptchaQueryOptions>;
};

export const useGetCaptcha = ({ queryConfig }: UseGetCaptchaOptions = {}) => {
  return useQuery({
    ...getCaptchaQueryOptions(),
    ...queryConfig,
  });
};