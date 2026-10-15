/**
 * RAG 评估接口（评估数据集与评估运行）。
 *
 * 契约：`backend/server/routers/knowledge_eval_router.py` 的 11 个端点，响应统一是
 * `{message:'success', data}`；`data` 的形状按 `ars/knowledge/eval/service.py` 的三个序列化器
 * （`_dataset_to_dict` / `_dataset_item_to_dict` / `_run_item_to_dict`）与 `list_runs` 手写。
 * 指标键来自 `ars/knowledge/eval/metrics.py`：检索侧 `recall@k`/`f1@k`（k = 1/3/5/10），
 * 答案侧聚合出一个 `answer_correctness`，另有综合 `overall_score`。
 *
 * 所有端点都要求管理员（后端 `get_admin_user` + 知识库 read/manage），因此这个分区只在
 * 管理员可见的详情页里出现；前端不做管理员门，授权在后端。
 */
import {
  deleteEvaluationDatasetApiEvaluationDatasetsDatasetIdDelete,
  deleteEvaluationRunApiEvaluationDatabasesKbIdRunsRunIdDelete,
  generateEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsGeneratePost,
  getEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsDatasetIdGet,
  getEvaluationRunResultsApiEvaluationDatabasesKbIdRunsRunIdGet,
  listEvaluationDatasetsApiEvaluationDatabasesKbIdDatasetsGet,
  listEvaluationRunsApiEvaluationDatabasesKbIdRunsGet,
  resumeEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsDatasetIdResumePost,
  runEvaluationApiEvaluationDatabasesKbIdRunsPost,
  uploadEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsUploadPost,
} from '@/shared/api/generated/sdk.gen';
import type {
  GenerateDatasetRequest,
  RunEvaluationRequest,
} from '@/shared/api/generated/types.gen';
import { apiFetch } from '@/shared/api';
import { parseDownloadFilename } from '../lib/knowledge-files';
import { unwrap } from '@/shared/api';

/** 数据集生成状态；`completed`/`failed` 之外都算还在生成。 */
export type DatasetBuildStatus = 'pending' | 'running' | 'completed' | 'failed';

/** 数据集的构建元信息（后端 `build_metadata`，字段随生成方式不同）。 */
export type DatasetBuildMetadata = {
  status?: DatasetBuildStatus;
  message?: string;
  /** 失败原因；界面优先展示它。 */
  error_message?: string;
  progress?: number;
  /** 来源：自动生成写 `generated`，上传写 `upload`（`service.py` 的取值）。 */
  source?: 'generated' | 'upload' | string;
  generated_count?: number;
  failed_count?: number;
  generation_mode?: 'vector' | 'graph_enhanced';
  started_at?: string | null;
  finished_at?: string | null;
};

/** 列表与详情共用的数据集投影。 */
export type EvaluationDataset = {
  id: string;
  dataset_id: string;
  name: string;
  description: string;
  kb_id: string;
  item_count: number;
  has_gold_chunks: boolean;
  has_gold_answers: boolean;
  build_metadata: DatasetBuildMetadata;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EvaluationDatasetItem = {
  item_id: string;
  item_index: number;
  query: string;
  gold_chunk_ids: string[];
  gold_answer?: string | null;
};

export type PageInfo = {
  current_page: number;
  page_size: number;
  total_items?: number;
  total_pages: number;
  has_next?: boolean;
  has_prev?: boolean;
};

export type EvaluationDatasetDetail = EvaluationDataset & {
  items: EvaluationDatasetItem[];
  pagination: PageInfo;
};

export type EvaluationRun = {
  run_id: string;
  name: string;
  dataset_id: string;
  /** 后端用 running/completed/failed 之类表达；界面按字符串展示。 */
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  total_items: number;
  completed_items: number;
  overall_score?: number | null;
  retrieval_config?: Record<string, unknown>;
  metrics: Record<string, number>;
  /** 任务形状的那份响应会把 `task.progress` 原样带出来，任务没进度时是 null。 */
  progress?: number | null;
  message?: string;
};

export type RunMetrics = Record<string, number>;

export type EvaluationRunItem = {
  query: string;
  gold_chunk_ids?: string[] | null;
  gold_answer?: string | null;
  generated_answer?: string | null;
  retrieved_chunks?: Array<Record<string, unknown>> | null;
  metrics: RunMetrics;
};

export type EvaluationRunResults = {
  run_id: string;
  name?: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  total_items?: number;
  completed_items?: number;
  overall_score?: number | null;
  retrieval_config?: Record<string, unknown>;
  items?: EvaluationRunItem[];
  pagination?: PageInfo & { total?: number; error_only?: boolean };
  /**
   * 后端在「运行行还没落库」时会回任务形状（只有进度）。今天这条路径实际不可达
   * （`run_evaluation` 先落库再入队，任务 id 也不是 run_id），保留字段只为兼容响应形状。
   */
  progress?: number;
  message?: string;
};

/** 生成数据集的请求体；字段与约束由后端 schema 拥有，这里直接用生成物里的类型。 */
export type GenerateDatasetPayload = GenerateDatasetRequest;

/** 运行评估的请求体。 */
export type RunEvaluationPayload = RunEvaluationRequest;

export const evaluationApi = {
  /** 数据集列表；后端会把仍在生成的行同步一次构建状态。 */
  async listDatasets(kbId: string): Promise<EvaluationDataset[]> {
    const result = unwrap<{ data?: EvaluationDataset[] }>(
      await listEvaluationDatasetsApiEvaluationDatabasesKbIdDatasetsGet({
        path: { kb_id: kbId },
      }),
    );
    return result.data ?? [];
  },

  /** 数据集详情（含分页条目）；生成中的数据集后端会拒绝（400「not ready」）。 */
  async getDataset(
    kbId: string,
    datasetId: string,
    options: { page?: number; pageSize?: number } = {},
  ): Promise<EvaluationDatasetDetail> {
    // 后端这批端点都套了一层 {message, data}，unwrap 只剥生成客户端的 {data,error}
    const result = unwrap<{ data: EvaluationDatasetDetail }>(
      await getEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsDatasetIdGet({
        path: { kb_id: kbId, dataset_id: datasetId },
        query: {
          page: options.page ?? 1,
          page_size: options.pageSize ?? 50,
        },
      }),
    );
    return result.data;
  },

  /** 上传 JSONL 数据集（后端只收 `.jsonl`）。 */
  async uploadDataset(
    kbId: string,
    input: { file: File; name: string; description: string },
  ): Promise<EvaluationDataset> {
    const uploaded = unwrap<{ data: EvaluationDataset }>(
      await uploadEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsUploadPost(
        {
          path: { kb_id: kbId },
          // 传普通对象：生成物的 formDataBodySerializer 会自己组 multipart（与文件上传同一写法）
          body: {
            file: input.file,
            name: input.name,
            description: input.description,
          },
        },
      ),
    );
    return uploaded.data;
  },

  /** 用 AI 从知识库生成数据集（后端异步，返回数据集行）。 */
  async generateDataset(
    kbId: string,
    payload: GenerateDatasetPayload,
  ): Promise<EvaluationDataset> {
    const generated = unwrap<{ data: EvaluationDataset }>(
      await generateEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsGeneratePost(
        {
          path: { kb_id: kbId },
          body: payload,
        },
      ),
    );
    return generated.data;
  },

  /**
   * 数据集的 JSONL 导出。
   *
   * 生成物是文本文件，走手写 `apiFetch` 拿原始响应（与文件下载同一口径），
   * 由调用方决定落盘方式。
   */
  async downloadDataset(
    datasetId: string,
  ): Promise<{ blob: Blob; filename: string | null }> {
    const response = await apiFetch(
      `/api/evaluation/datasets/${encodeURIComponent(datasetId)}/download`,
    );
    return {
      blob: await response.blob(),
      filename: parseDownloadFilename(
        response.headers.get('content-disposition'),
      ),
    };
  },

  /** 继续生成失败的数据集；后端对已完成/已有任务的情况只回消息，不报错。 */
  async resumeDatasetGeneration(
    kbId: string,
    datasetId: string,
  ): Promise<{ dataset_id?: string; message?: string }> {
    return unwrap<{ dataset_id?: string; message?: string }>(
      await resumeEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsDatasetIdResumePost(
        {
          path: { kb_id: kbId, dataset_id: datasetId },
        },
      ),
    );
  },

  async deleteDataset(datasetId: string): Promise<void> {
    unwrap<unknown>(
      await deleteEvaluationDatasetApiEvaluationDatasetsDatasetIdDelete({
        path: { dataset_id: datasetId },
      }),
    );
  },

  /** 运行历史。 */
  async listRuns(kbId: string): Promise<EvaluationRun[]> {
    const result = unwrap<{ data?: EvaluationRun[] }>(
      await listEvaluationRunsApiEvaluationDatabasesKbIdRunsGet({
        path: { kb_id: kbId },
      }),
    );
    return result.data ?? [];
  },

  /** 启动一次评估；后端异步执行，返回 `run_id`。 */
  async runEvaluation(
    kbId: string,
    payload: RunEvaluationPayload,
  ): Promise<{ run_id: string }> {
    const result = unwrap<{ data: { run_id: string } }>(
      await runEvaluationApiEvaluationDatabasesKbIdRunsPost({
        path: { kb_id: kbId },
        body: payload,
      }),
    );
    return result.data;
  },

  /** 运行结果（分页 + 可只看失败项）。 */
  async getRunResults(
    kbId: string,
    runId: string,
    options: { page?: number; pageSize?: number; errorOnly?: boolean } = {},
  ): Promise<EvaluationRunResults> {
    const result = unwrap<{ data: EvaluationRunResults }>(
      await getEvaluationRunResultsApiEvaluationDatabasesKbIdRunsRunIdGet({
        path: { kb_id: kbId, run_id: runId },
        query: {
          page: options.page ?? 1,
          page_size: options.pageSize ?? 50,
          error_only: options.errorOnly ?? false,
        },
      }),
    );
    return result.data;
  },

  async deleteRun(kbId: string, runId: string): Promise<void> {
    unwrap<unknown>(
      await deleteEvaluationRunApiEvaluationDatabasesKbIdRunsRunIdDelete({
        path: { kb_id: kbId, run_id: runId },
      }),
    );
  },
};
