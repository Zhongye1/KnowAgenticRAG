import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDictTypeDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取所有字典类型 */
export type GetDictTypesPaginatedParams = {
  name?: string | null;
  code?: string | null;
  page?: number;
  size?: number;
};

export const getDictTypesPaginated = (params: GetDictTypesPaginatedParams): Promise<PageData<GetDictTypeDetail>> => {
  const { name, code, page, size } = params;
  return api.get(`/api/v1/sys/dict-types`, { params: { name, code, page, size } }).then((res) => res.data);
};

export const getDictTypesPaginatedQueryOptions = (params: GetDictTypesPaginatedParams) => {
  return queryOptions({
    queryKey: ['sys-dict-types', 'get-dict-types-paginated', params],
    queryFn: () => getDictTypesPaginated(params),
  });
};

type UseGetDictTypesPaginatedOptions = {
  params: GetDictTypesPaginatedParams;
  queryConfig?: QueryConfig<typeof getDictTypesPaginatedQueryOptions>;
};

export const useGetDictTypesPaginated = (options: UseGetDictTypesPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDictTypesPaginatedQueryOptions(params),
    ...queryConfig,
  });
};