import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { TagItem } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 标签目录 */
export type GetTagsParams = {
  limit?: number;
};

export const getTags = (params: GetTagsParams): Promise<TagItem[]> => {
  const { limit } = params;
  return api.get(`/api/v1/tags`, { params: { limit } }).then((res) => res.data);
};

export const getTagsQueryOptions = (params: GetTagsParams) => {
  return queryOptions({
    queryKey: ['tags', 'get-tags', params],
    queryFn: () => getTags(params),
  });
};

type UseGetTagsOptions = {
  params: GetTagsParams;
  queryConfig?: QueryConfig<typeof getTagsQueryOptions>;
};

export const useGetTags = (options: UseGetTagsOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getTagsQueryOptions(params),
    ...queryConfig,
  });
};