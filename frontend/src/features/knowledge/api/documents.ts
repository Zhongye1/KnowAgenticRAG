import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

import { DocumentItem, PageResult } from './types';

export const getDocuments = (
  kbName: string,
): Promise<{ data: PageResult<DocumentItem> }> => {
  return api.get('/documents', {
    params: { kb_name: kbName, size: 50 },
  });
};

export const getDocumentsQueryOptions = (kbName: string) => {
  return queryOptions({
    queryKey: ['documents', kbName],
    queryFn: () => getDocuments(kbName),
    enabled: Boolean(kbName),
  });
};

type UseDocumentsOptions = {
  queryConfig?: QueryConfig<typeof getDocumentsQueryOptions>;
};

export const useDocuments = (
  kbName: string,
  { queryConfig }: UseDocumentsOptions = {},
) => {
  return useQuery({
    ...getDocumentsQueryOptions(kbName),
    ...queryConfig,
  });
};
