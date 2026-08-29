import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetDictDataDetail, PageData } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 分页获取所有字典数据 */
export type GetDictDatasPaginatedParams = {
  type_code?: string | null;
  label?: string | null;
  value?: string | null;
  status?: number | null;
  type_id?: number | null;
  page?: number;
  size?: number;
};

export const getDictDatasPaginated = (params: GetDictDatasPaginatedParams): Promise<PageData<GetDictDataDetail>> => {
  const { type_code, label, value, status, type_id, page, size } = params;
  return api.get(`/api/v1/sys/dict-datas`, { params: { type_code, label, value, status, type_id, page, size } }).then((res) => res.data);
};

export const getDictDatasPaginatedQueryOptions = (params: GetDictDatasPaginatedParams) => {
  return queryOptions({
    queryKey: ['sys-dict-datas', 'get-dict-datas-paginated', params],
    queryFn: () => getDictDatasPaginated(params),
  });
};

type UseGetDictDatasPaginatedOptions = {
  params: GetDictDatasPaginatedParams;
  queryConfig?: QueryConfig<typeof getDictDatasPaginatedQueryOptions>;
};

export const useGetDictDatasPaginated = (options: UseGetDictDatasPaginatedOptions) => {
  const { params, queryConfig } = options;
  return useQuery({
    ...getDictDatasPaginatedQueryOptions(params),
    ...queryConfig,
  });
};