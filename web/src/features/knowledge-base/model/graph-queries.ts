/**
 * 图谱查询与构建管理的 React Query 装配。
 *
 * 状态轮询沿用文件表的函数式 `refetchInterval`：只有最新一份状态真的是
 * `pending`/`running` 才按 5 秒重取，任务收尾后自己停；
 * 页面不可见时 react-query 默认暂停轮询。
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  graphApi,
  type GraphBuildStatus,
  type GraphExtractorOptions,
} from '../api/graph-api';
import { knowledgeApi } from '../api/knowledge-api';
import { knowledgeKeys } from './knowledge-queries';

/** 子图查询参数；一起进 queryKey，改参数即是换一份缓存。 */
export type GraphSubgraphParams = {
  nodeLabel: string;
  maxDepth: number;
  maxNodes: number;
  excludeChunk: boolean;
};

export const DEFAULT_SUBGRAPH_PARAMS: GraphSubgraphParams = {
  nodeLabel: '*',
  maxDepth: 2,
  maxNodes: 100,
  excludeChunk: true,
};

export const graphKeys = {
  all: ['knowledge-graph'] as const,
  subgraph: (kbId: string, params: GraphSubgraphParams) =>
    [
      ...graphKeys.all,
      'subgraph',
      kbId,
      params.nodeLabel,
      params.maxDepth,
      params.maxNodes,
      params.excludeChunk,
    ] as const,
  status: (kbId: string) => [...graphKeys.all, 'status', kbId] as const,
  failedChunks: (kbId: string) =>
    [...graphKeys.all, 'failed-chunks', kbId] as const,
};

/** 任务在跑（含排队）时才算「构建中」。 */
export const isGraphBuildActive = (status?: GraphBuildStatus | null): boolean =>
  status?.build_task_status === 'pending' ||
  status?.build_task_status === 'running';

/** 子图：翻参数时保留上一份，避免画布先清空再重建。 */
export const useGraphSubgraph = (
  kbId: string,
  params: GraphSubgraphParams = DEFAULT_SUBGRAPH_PARAMS,
  options: { enabled?: boolean } = {},
) =>
  useQuery({
    queryKey: graphKeys.subgraph(kbId, params),
    queryFn: () =>
      graphApi.getSubgraph(kbId, {
        nodeLabel: params.nodeLabel,
        maxDepth: params.maxDepth,
        maxNodes: params.maxNodes,
        excludeChunk: params.excludeChunk,
      }),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });

/** 构建状态；`interval` 只影响任务在跑时的重取间隔。 */
export const useGraphBuildStatus = (
  kbId: string,
  options: { interval?: number; enabled?: boolean } = {},
) =>
  useQuery({
    queryKey: graphKeys.status(kbId),
    queryFn: () => graphApi.getGraphBuildStatus(kbId),
    enabled: options.enabled ?? true,
    refetchInterval: (query) =>
      isGraphBuildActive(query.state.data) ? (options.interval ?? 5000) : false,
  });

/** 抽取器可用的对话模型（图谱抽取走 chat 模型）。 */
export const useExtractorModels = (enabled = true) =>
  useQuery({
    queryKey: knowledgeKeys.models('chat'),
    queryFn: () => knowledgeApi.listModels('chat'),
    staleTime: 5 * 60 * 1000,
    enabled,
  });

/** 抽取失败的 chunk 样例；只在弹窗打开时拉。 */
export const useGraphFailedChunks = (kbId: string, enabled: boolean) =>
  useQuery({
    queryKey: graphKeys.failedChunks(kbId),
    queryFn: () => graphApi.getGraphBuildFailedChunks(kbId, 10),
    enabled,
  });

/** 写操作成功后要作废的缓存：状态一定重算，子图只在图本身变了时失效。 */
const useGraphMutation = <TInput, TResult>(
  kbId: string,
  mutationFn: (input: TInput) => Promise<TResult>,
  options: { invalidateSubgraph?: boolean } = {},
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: graphKeys.status(kbId) });
      if (options.invalidateSubgraph) {
        void queryClient.invalidateQueries({
          queryKey: [...graphKeys.all, 'subgraph', kbId],
        });
      }
    },
  });
};

/** 锁定抽取配置（后端锁定后 `extractor_type` 不可改）。 */
export const useConfigureGraphBuild = (kbId: string) =>
  useGraphMutation(
    kbId,
    (input: {
      extractorType: string;
      extractorOptions: GraphExtractorOptions;
    }) => graphApi.configureGraphBuild(kbId, input),
  );

/** 提交图谱构建任务。 */
export const useIndexGraphBuild = (kbId: string) =>
  useGraphMutation(kbId, () => graphApi.indexGraphBuild(kbId));

/** 重置构建状态：清掉抽取结果后图会变，因此子图也要失效。 */
export const useResetGraphBuild = (kbId: string) =>
  useGraphMutation(
    kbId,
    (input: { clearExtractionResult: boolean; clearConfig: boolean }) =>
      graphApi.resetGraphBuild(kbId, input),
    { invalidateSubgraph: true },
  );

/** 向量对账（界面只用 `failed`，重试失败向量）。 */
export const useReconcileGraphBuild = (kbId: string) =>
  useGraphMutation(
    kbId,
    (mode: 'failed' | 'all_vectors') =>
      graphApi.reconcileGraphBuild(kbId, mode),
    { invalidateSubgraph: true },
  );
