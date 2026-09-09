import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createKnowledgeBase } from '@/generated/knowledge_bases/create-knowledge-base';
import { deleteKnowledgeBase } from '@/generated/knowledge_bases/delete-knowledge-base';
import {
  getKnowledgeBases,
  getKnowledgeBasesQueryOptions,
  type GetKnowledgeBasesParams,
  useGetKnowledgeBases,
} from '@/generated/knowledge_bases/get-knowledge-bases';
import {
  getKnowledgeBasesOverview,
  getKnowledgeBasesOverviewQueryOptions,
  useGetKnowledgeBasesOverview,
} from '@/generated/knowledge_bases/get-knowledge-bases-overview';
import {
  getKnowledgeBaseFacetsQueryOptions,
  useGetKnowledgeBaseFacets,
} from '@/generated/knowledge_bases/get-knowledge-base-facets';
import {
  getKnowledgeBaseFormatDistributionQueryOptions,
  useGetKnowledgeBaseFormatDistribution,
} from '@/generated/knowledge_bases/get-knowledge-base-format-distribution';
import { updateKnowledgeBase } from '@/generated/knowledge_bases/update-knowledge-base';
import { MutationConfig, QueryConfig } from '@/lib/react-query';

/**
 * 知识库 API 层：请求路径、入参与出参类型均来自 OpenAPI 生成的 IDL
 * （src/generated/knowledge_bases/*），此处只补充 React Query 侧的
 * 查询默认参数与写操作后的缓存失效。
 */

// 管理页以网格展示全部知识库，一页取满后端允许上限即可，暂不做分页控件
const KNOWLEDGE_BASES_PAGE_SIZE = 200;

export type ListKnowledgeBasesParams = Pick<
  GetKnowledgeBasesParams,
  'query' | 'sort'
>;

export const useKnowledgeBases = ({
  params,
  queryConfig,
}: {
  params?: ListKnowledgeBasesParams;
  queryConfig?: QueryConfig<typeof getKnowledgeBasesQueryOptions>;
} = {}) => {
  return useGetKnowledgeBases({
    params: {
      query: params?.query,
      sort: params?.sort,
      size: KNOWLEDGE_BASES_PAGE_SIZE,
    },
    queryConfig,
  });
};

export const useKnowledgeBaseOverview = ({
  queryConfig,
}: {
  queryConfig?: QueryConfig<typeof getKnowledgeBasesOverviewQueryOptions>;
} = {}) => {
  return useGetKnowledgeBasesOverview({ queryConfig });
};

/** 文档分面统计（source_type / pipeline / status），供分类浏览侧栏使用。 */
export const useKnowledgeBaseFacets = (
  kbName: string | null,
  {
    queryConfig,
  }: {
    queryConfig?: QueryConfig<typeof getKnowledgeBaseFacetsQueryOptions>;
  } = {},
) => {
  return useGetKnowledgeBaseFacets({
    params: { kb_name: kbName ?? '' },
    queryConfig: { enabled: Boolean(kbName), ...queryConfig },
  });
};

/** 文件来源类型分布（source_type 计数），供概览条展示。 */
export const useKnowledgeBaseFormatDistribution = (
  kbName: string | null,
  {
    queryConfig,
  }: {
    queryConfig?: QueryConfig<
      typeof getKnowledgeBaseFormatDistributionQueryOptions
    >;
  } = {},
) => {
  return useGetKnowledgeBaseFormatDistribution({
    params: { kb_name: kbName ?? '' },
    queryConfig: { enabled: Boolean(kbName), ...queryConfig },
  });
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
    mutationFn: createKnowledgeBase,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] });
      onSuccess?.(...args);
    },
    ...restConfig,
  });
};

type UseUpdateKnowledgeBaseOptions = {
  mutationConfig?: MutationConfig<typeof updateKnowledgeBase>;
};

export const useUpdateKnowledgeBase = ({
  mutationConfig,
}: UseUpdateKnowledgeBaseOptions = {}) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restConfig } = mutationConfig || {};

  return useMutation({
    mutationFn: updateKnowledgeBase,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] });
      onSuccess?.(...args);
    },
    ...restConfig,
  });
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
    mutationFn: deleteKnowledgeBase,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] });
      onSuccess?.(...args);
    },
    ...restConfig,
  });
};

export { getKnowledgeBases, getKnowledgeBasesOverview };
