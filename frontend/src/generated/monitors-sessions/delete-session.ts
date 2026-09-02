import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 强制下线 */
export type DeleteSessionParams = {
  pk: string | number;
  session_uuid: string;
};

export const deleteSession = (params: DeleteSessionParams): Promise<unknown> => {
  const { pk, session_uuid } = params;
  return api.delete(`/api/v1/monitors/sessions/${pk}`, { params: { session_uuid } }).then((res) => res.data);
};

type UseDeleteSessionOptions = {
  mutationConfig?: MutationConfig<typeof deleteSession>;
};

export const useDeleteSession = ({ mutationConfig }: UseDeleteSessionOptions = {}) => {
  return useMutation({
    mutationFn: deleteSession,
    ...mutationConfig,
  });
};