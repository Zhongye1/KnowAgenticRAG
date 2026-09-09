import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { CreateNoticeParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 创建通知公告 */

export const createNotice = (data: CreateNoticeParam): Promise<unknown> => {
  return api.post(`/api/v1/sys/notices`, data).then((res) => res.data);
};

type UseCreateNoticeOptions = {
  mutationConfig?: MutationConfig<typeof createNotice>;
};

export const useCreateNotice = ({ mutationConfig }: UseCreateNoticeOptions = {}) => {
  return useMutation({
    mutationFn: createNotice,
    ...mutationConfig,
  });
};