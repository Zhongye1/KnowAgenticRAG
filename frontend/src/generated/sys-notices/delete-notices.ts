import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';
import { DeleteNoticeParam } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 批量删除通知公告 */

export const deleteNotices = (data: DeleteNoticeParam): Promise<unknown> => {
  return api.delete(`/api/v1/sys/notices`, { data }).then((res) => res.data);
};

type UseDeleteNoticesOptions = {
  mutationConfig?: MutationConfig<typeof deleteNotices>;
};

export const useDeleteNotices = ({ mutationConfig }: UseDeleteNoticesOptions = {}) => {
  return useMutation({
    mutationFn: deleteNotices,
    ...mutationConfig,
  });
};