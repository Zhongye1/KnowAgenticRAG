/**
 * RAG 评估的 React Query 装配。
 *
 * 生成中的数据集与运行中的评估各按 3 秒轮询（上游同为 3000ms），轮询条件写成函数式
 * `refetchInterval`：只有确实在生成/在跑时才重取，结束后自停；页面不可见时 react-query 会暂停。
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  evaluationApi,
  type GenerateDatasetPayload,
  type RunEvaluationPayload,
} from '../api/evaluation-api';
import { isDatasetGenerating } from '../lib/evaluation-view';
import { knowledgeKeys } from './knowledge-queries';

/** 上游的轮询间隔。 */
export const EVALUATION_POLL_INTERVAL = 3000;

export const evaluationKeys = {
  datasets: (kbId: string) =>
    [...knowledgeKeys.all, 'evaluation-datasets', kbId] as const,
  dataset: (kbId: string, datasetId: string, page: number, pageSize: number) =>
    [
      ...knowledgeKeys.all,
      'evaluation-dataset',
      kbId,
      datasetId,
      page,
      pageSize,
    ] as const,
  runs: (kbId: string) =>
    [...knowledgeKeys.all, 'evaluation-runs', kbId] as const,
  runResults: (
    kbId: string,
    runId: string,
    page: number,
    pageSize: number,
    errorOnly: boolean,
  ) =>
    [
      ...knowledgeKeys.all,
      'evaluation-run-results',
      kbId,
      runId,
      page,
      pageSize,
      errorOnly,
    ] as const,
};

/** 数据集列表；有生成中的行时按 3 秒重取。 */
export const useEvaluationDatasets = (kbId: string) =>
  useQuery({
    queryKey: evaluationKeys.datasets(kbId),
    queryFn: () => evaluationApi.listDatasets(kbId),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((dataset) =>
        isDatasetGenerating(dataset.build_metadata),
      )
        ? EVALUATION_POLL_INTERVAL
        : false,
  });

/** 数据集详情（条目分页）；生成中的数据集后端会拒绝，因此只在可预览时启用。 */
export const useEvaluationDataset = (
  kbId: string,
  datasetId: string | null,
  options: { page?: number; pageSize?: number; enabled?: boolean } = {},
) =>
  useQuery({
    queryKey: evaluationKeys.dataset(
      kbId,
      datasetId ?? '',
      options.page ?? 1,
      options.pageSize ?? 50,
    ),
    queryFn: () =>
      evaluationApi.getDataset(kbId, datasetId as string, {
        page: options.page ?? 1,
        pageSize: options.pageSize ?? 50,
      }),
    enabled: Boolean(datasetId) && (options.enabled ?? true),
    placeholderData: keepPreviousData,
  });

/** 运行历史；有 running 的行时按 3 秒重取。 */
export const useEvaluationRuns = (kbId: string) =>
  useQuery({
    queryKey: evaluationKeys.runs(kbId),
    queryFn: () => evaluationApi.listRuns(kbId),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((run) => run.status === 'running')
        ? EVALUATION_POLL_INTERVAL
        : false,
  });

/** 运行结果分页；运行中时同样轮询，让进度与条目自己走。 */
export const useEvaluationRunResults = (
  kbId: string,
  runId: string | null,
  options: { page?: number; pageSize?: number; errorOnly?: boolean } = {},
) =>
  useQuery({
    queryKey: evaluationKeys.runResults(
      kbId,
      runId ?? '',
      options.page ?? 1,
      options.pageSize ?? 50,
      options.errorOnly ?? false,
    ),
    queryFn: () =>
      evaluationApi.getRunResults(kbId, runId as string, {
        page: options.page ?? 1,
        pageSize: options.pageSize ?? 50,
        errorOnly: options.errorOnly ?? false,
      }),
    enabled: Boolean(runId),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? EVALUATION_POLL_INTERVAL : false,
  });

/** 写操作成功后要作废的缓存：数据集三处与运行两处。 */
const useEvaluationMutation = <TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  invalidate: () => Array<readonly unknown[]>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const queryKey of invalidate()) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
};

export const useUploadEvaluationDataset = (kbId: string) =>
  useEvaluationMutation(
    (input: { file: File; name: string; description: string }) =>
      evaluationApi.uploadDataset(kbId, input),
    () => [evaluationKeys.datasets(kbId)],
  );

export const useGenerateEvaluationDataset = (kbId: string) =>
  useEvaluationMutation(
    (payload: GenerateDatasetPayload) =>
      evaluationApi.generateDataset(kbId, payload),
    () => [evaluationKeys.datasets(kbId)],
  );

/** 继续生成：只动这一份数据集，因此连带它自己的详情缓存一起失效。 */
export const useResumeEvaluationDataset = (kbId: string) =>
  useEvaluationMutation(
    (datasetId: string) =>
      evaluationApi.resumeDatasetGeneration(kbId, datasetId),
    () => [
      evaluationKeys.datasets(kbId),
      [...knowledgeKeys.all, 'evaluation-dataset', kbId],
    ],
  );

export const useDeleteEvaluationDataset = (kbId: string) =>
  useEvaluationMutation(
    (datasetId: string) => evaluationApi.deleteDataset(datasetId),
    () => [
      evaluationKeys.datasets(kbId),
      [...knowledgeKeys.all, 'evaluation-dataset', kbId],
    ],
  );

export const useRunEvaluation = (kbId: string) =>
  useEvaluationMutation(
    (payload: RunEvaluationPayload) =>
      evaluationApi.runEvaluation(kbId, payload),
    () => [evaluationKeys.runs(kbId)],
  );

export const useDeleteEvaluationRun = (kbId: string) =>
  useEvaluationMutation(
    (runId: string) => evaluationApi.deleteRun(kbId, runId),
    () => [
      evaluationKeys.runs(kbId),
      [...knowledgeKeys.all, 'evaluation-run-results', kbId],
    ],
  );
