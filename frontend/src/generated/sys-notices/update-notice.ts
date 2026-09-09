import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { UpdateNoticeParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 更新通知公告 */
export type UpdateNoticeParams = {
  pk: string | number;
  data: UpdateNoticeParam;
};

export const updateNotice = (params: UpdateNoticeParams): Promise<unknown> => {
  const { pk, data } = params;
  return api.put(`/api/v1/sys/notices/${pk}`, data).then((res) => res.data);
};

type UseUpdateNoticeOptions = {
  mutationConfig?: MutationConfig<typeof updateNotice>;
};

export const useUpdateNotice = ({ mutationConfig }: UseUpdateNoticeOptions = {}) => {
  return useMutation({
    mutationFn: updateNotice,
    ...mutationConfig,
  });
};