/**
 * RAG 评估接口（评估数据集与评估运行）。
 *
 * 契约：`backend/server/routers/knowledge_eval_router.py` 的端点，响应统一包一层
 * `{message:'success', data}`；数据集的 `data` 形状直接复用后端响应模型生成的类型
 * （`EvaluationDatasetItem` / `EvaluationDatasetDetailItem` / `EvaluationDatasetQuestionItem` 等），
 * 运行侧因界面按更窄的读形状使用而保留手写。指标键来自 `ars/knowledge/eval/metrics.py`：
 * 检索侧 `recall@k`/`f1@k`（k = 1/3/5/10），答案侧聚合出一个 `answer_correctness`，
 * 另有综合 `overall_score`。
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
  EvaluationDatasetDetailItem,
  EvaluationDatasetDetailResponse,
  EvaluationDatasetItemResponse,
  EvaluationDatasetListResponse,
  EvaluationDatasetQuestionItem,
  EvaluationDatasetItem as EvaluationDatasetReadItem,
  EvaluationDeleteResponse,
  EvaluationGenerationItem,
  EvaluationGenerationResponse,
  EvaluationResumeResponse,
  EvaluationRunCreateData,
  EvaluationRunCreateResponse,
  EvaluationRunResultItem,
  GenerateDatasetRequest,
  RunEvaluationRequest,
} from '@/shared/api/generated/types.gen';
import { apiFetch } from '@/shared/api';
import { parseDownloadFilename } from '../lib/knowledge-files';
import { unwrap } from '@/shared/api';

/** 数据集生成状态；`completed`/`failed` 之外都算还在生成。 */
export type DatasetBuildStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * 数据集的构建元信息（后端 `build_metadata`）。
 *
 * 契约把 `build_metadata` 声明为形状不定的 map，字段随生成方式变化，所以这里保留一份界面
 * 读取用的窄化形状（已知键的可选投影），不是响应体的契约类型。
 */
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

/** 列表与详情共用的数据集投影；形状由后端 `EvaluationDatasetItem` 拥有。 */
export type EvaluationDataset = EvaluationDatasetReadItem;

/** 数据集题目；形状由后端 `EvaluationDatasetQuestionItem` 拥有。 */
export type EvaluationDatasetItem = EvaluationDatasetQuestionItem;

/** 数据集详情（摘要 + 当页题目 + 分页）；形状由后端 `EvaluationDatasetDetailItem` 拥有。 */
export type EvaluationDatasetDetail = EvaluationDatasetDetailItem;

/**
 * 评估运行历史条目。
 *
 * 这里保留界面读取用的形状，不直接等同契约的 `EvaluationRunItem`：后者把 `dataset_id`
 * 声明为可空，而界面（`datasetNameOf`）按非空使用；`metrics` 也按数值映射读取。
 */
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
  /** 历史行的指标按数值读取（面板直接展示 `recall@k`），因此这里收窄为数值映射。 */
  metrics: Record<string, number>;
  /** 任务形状的那份响应会把 `task.progress` 原样带出来，任务没进度时是 null。 */
  progress?: number | null;
  message?: string;
};

/** 指标映射；契约把 `metrics` 声明为形状不定的 map。 */
export type RunMetrics = EvaluationRunResultItem['metrics'];

/**
 * 逐题结果。
 *
 * 保留界面读取用的形状：题目可能只有部分字段（例如仅标注检索指标），这里按可选字段读取，
 * 与契约里除 `query`/`metrics` 外均可空的声明对齐。
 */
export type EvaluationRunItem = {
  query: string;
  gold_chunk_ids?: string[] | null;
  gold_answer?: string | null;
  generated_answer?: string | null;
  retrieved_chunks?: Array<Record<string, unknown>> | null;
  metrics: RunMetrics;
};

/** 数据集详情的分页信息。 */
export type PageInfo = {
  current_page: number;
  page_size: number;
  total_items?: number;
  total_pages: number;
  has_next?: boolean;
  has_prev?: boolean;
};

/**
 * 运行结果（分页 + 可只看失败项）。
 *
 * 保留界面读取用的形状：`items` 是下方按可选字段读取的 `EvaluationRunItem`（契约的
 * `EvaluationRunResultItem` 把 `gold_chunk_ids` 声明为非字符串数组，界面按 `string[]` 用）。
 */
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
    const result = unwrap<EvaluationDatasetListResponse>(
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
    const result = unwrap<EvaluationDatasetDetailResponse>(
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
    const uploaded = unwrap<EvaluationDatasetItemResponse>(
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

  /** 用 AI 从知识库生成数据集（后端异步，返回生成任务提交结果：`dataset_id` + `task_id`）。 */
  async generateDataset(
    kbId: string,
    payload: GenerateDatasetPayload,
  ): Promise<EvaluationGenerationItem> {
    const generated = unwrap<EvaluationGenerationResponse>(
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
  ): Promise<EvaluationResumeResponse> {
    return unwrap<EvaluationResumeResponse>(
      await resumeEvaluationDatasetApiEvaluationDatabasesKbIdDatasetsDatasetIdResumePost(
        {
          path: { kb_id: kbId, dataset_id: datasetId },
        },
      ),
    );
  },

  async deleteDataset(datasetId: string): Promise<void> {
    unwrap<EvaluationDeleteResponse>(
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
  ): Promise<EvaluationRunCreateData> {
    const result = unwrap<EvaluationRunCreateResponse>(
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
    unwrap<EvaluationDeleteResponse>(
      await deleteEvaluationRunApiEvaluationDatabasesKbIdRunsRunIdDelete({
        path: { kb_id: kbId, run_id: runId },
      }),
    );
  },
};
