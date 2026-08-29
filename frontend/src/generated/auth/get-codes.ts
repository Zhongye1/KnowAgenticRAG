import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取所有授权码 */

export const getCodes = (): Promise<string[]> => {
  return api.get(`/api/v1/auth/codes`).then((res) => res.data);
};

export const getCodesQueryOptions = () => {
  return queryOptions({
    queryKey: ['auth', 'get-codes'],
    queryFn: () => getCodes(),
  });
};

type UseGetCodesOptions = {
  queryConfig?: QueryConfig<typeof getCodesQueryOptions>;
};

export const useGetCodes = ({ queryConfig }: UseGetCodesOptions = {}) => {
  return useQuery({
    ...getCodesQueryOptions(),
    ...queryConfig,
  });
};