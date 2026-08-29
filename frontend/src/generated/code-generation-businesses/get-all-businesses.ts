import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';
import { GetGenBusinessDetail } from '../types';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** 获取所有代码生成业务 */

export const getAllBusinesses = (): Promise<GetGenBusinessDetail[]> => {
  return api.get(`/api/v1/code-generation/businesses/all`).then((res) => res.data);
};

export const getAllBusinessesQueryOptions = () => {
  return queryOptions({
    queryKey: ['code-generation-businesses', 'get-all-businesses'],
    queryFn: () => getAllBusinesses(),
  });
};

type UseGetAllBusinessesOptions = {
  queryConfig?: QueryConfig<typeof getAllBusinessesQueryOptions>;
};

export const useGetAllBusinesses = ({ queryConfig }: UseGetAllBusinessesOptions = {}) => {
  return useQuery({
    ...getAllBusinessesQueryOptions(),
    ...queryConfig,
  });
};