import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig, QueryConfig } from '@/lib/react-query';

import {
  CreateKnowledgeBaseDTO,
  KnowledgeBase,
  KnowledgeBaseOverview,
  PageResult,
} from './types';

export type ListKnowledgeBasesParams = {
  query?: string;
  sort?: 'recent' | 'name';
};

export const getKnowledgeBases = (
  params?: ListKnowledgeBasesParams,
): Promise<{
  data: PageResult<KnowledgeBase>;
}> => {
  return api.get('/knowledge_bases', { params });
};

export const getKnowledgeBasesQueryOptions = (
  params?: ListKnowledgeBasesParams,
) => {
  return queryOptions({
    queryKey: ['knowledge-bases', params],
    queryFn: () => getKnowledgeBases(params),
  });
};

type UseKnowledgeBasesOptions = {
  params?: ListKnowledgeBasesParams;
  queryConfig?: QueryConfig<typeof getKnowledgeBasesQueryOptions>;
};

export const useKnowledgeBases = ({
  params,
  queryConfig,
}: UseKnowledgeBasesOptions = {}) => {
  return useQuery({
    ...getKnowledgeBasesQueryOptions(params),
    ...queryConfig,
  });
};

export const getKnowledgeBaseOverview = (): Promise<{
  data: KnowledgeBaseOverview;
}> => {
  return api.get('/knowledge_bases/overview');
};

export const getKnowledgeBaseOverviewQueryOptions = () => {
  return queryOptions({
    queryKey: ['knowledge-bases-overview'],
    queryFn: getKnowledgeBaseOverview,
  });
};

type UseKnowledgeBaseOverviewOptions = {
  queryConfig?: QueryConfig<typeof getKnowledgeBaseOverviewQueryOptions>;
};

export const useKnowledgeBaseOverview = ({
  queryConfig,
}: UseKnowledgeBaseOverviewOptions = {}) => {
  return useQuery({
    ...getKnowledgeBaseOverviewQueryOptions(),
    ...queryConfig,
  });
};

export const createKnowledgeBase = (
  payload: CreateKnowledgeBaseDTO,
): Promise<{ data: KnowledgeBase }> => {
  return api.post('/knowledge_bases', payload);
};

type UseCreateKnowledgeBaseOptions = {
  mutationConfig?: MutationConfig<typeof createKnowledgeBase>;
};

export const useCreateKnowledgeBase = ({
  mutationConfig,
}: UseCreateKnowledgeBaseOptions = {}) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restConfig } = mutationConfig || {};

  return useMutation({
    onSuccess: (...args) => {
      queryClient.invalidateQueries({
        queryKey: ['knowledge-bases'],
      });
      onSuccess?.(...args);
    },
    ...restConfig,
    mutationFn: createKnowledgeBase,
  });
};

export const deleteKnowledgeBase = (
  kbName: string,
): Promise<{ data: { deleted: boolean } }> => {
  return api.delete(`/knowledge_bases/${kbName}`);
};

type UseDeleteKnowledgeBaseOptions = {
  mutationConfig?: MutationConfig<typeof deleteKnowledgeBase>;
};

export const useDeleteKnowledgeBase = ({
  mutationConfig,
}: UseDeleteKnowledgeBaseOptions = {}) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restConfig } = mutationConfig || {};

  return useMutation({
    onSuccess: (...args) => {
      queryClient.invalidateQueries({
        queryKey: ['knowledge-bases'],
      });
      onSuccess?.(...args);
    },
    ...restConfig,
    mutationFn: deleteKnowledgeBase,
  });
};
