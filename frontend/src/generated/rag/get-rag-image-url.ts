import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { ImageUrlData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 视觉 tile 预签名 URL（对象键 → 短期直链） */
export type GetRagImageUrlParams = {
  image_id: string | number;
};

export const getRagImageUrl = (params: GetRagImageUrlParams): Promise<ImageUrlData> => {
  const { image_id } = params;
  return api.get(`/api/v1/rag/images/${image_id}/url`).then((res) => res.data);
};

export const getRagImageUrlQueryOptions = (params: GetRagImageUrlParams) => {
  return queryOptions({
    queryKey: ['rag', 'get-rag-image-url', params],
    queryFn: () => getRagImageUrl(params),
  });
};

type UseGetRagImageUrlOptions = {
  params: GetRagImageUrlParams;
  queryConfig?: QueryConfig<typeof getRagImageUrlQueryOptions>;
};

export const useGetRagImageUrl = (options: UseGetRagImageUrlOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getRagImageUrlQueryOptions(params),
    ...queryConfig,
  });
};