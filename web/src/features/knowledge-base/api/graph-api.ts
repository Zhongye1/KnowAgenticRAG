/**
 * 知识图谱接口（图谱视图与图谱构建管理）。
 *
 * 契约：`GET /api/graph/subgraph` 在 `backend/server/routers/graph_router.py`，
 * 其余六个 `graph-build/*` 在 `knowledge_router.py`；这些端点在契约里已声明响应模型，
 * 可直接复用 `openapi.json` 生成的类型。
 *
 * 但生成模型对若干「动态派生」字段留成了开放 map（节点的 `normalized`、配置的
 * `extractor_options`、状态的 `*_counts`、失败样例的 `details`），而图谱视图与配置表单按具体
 * 键读取这些嵌套值，因此下面保留对应类型的窄投影；其余响应类型直接用生成模型。
 *
 * `graph_router` 还提供 `list`/`labels`/`stats`，图谱分区一个都不用，因此不在这里出现。
 */
import {
  configureGraphBuildApiKnowledgeDatabasesKbIdGraphBuildConfigPost,
  getGraphBuildFailedChunksApiKnowledgeDatabasesKbIdGraphBuildFailedChunksGet,
  getGraphBuildStatusApiKnowledgeDatabasesKbIdGraphBuildStatusGet,
  getSubgraphApiGraphSubgraphGet,
  indexGraphBuildApiKnowledgeDatabasesKbIdGraphBuildIndexPost,
  reconcileGraphBuildApiKnowledgeDatabasesKbIdGraphBuildReconcilePost,
  resetGraphBuildApiKnowledgeDatabasesKbIdGraphBuildResetPost,
} from '@/shared/api/generated/sdk.gen';
import type {
  GraphBuildReconcileResponse,
  GraphBuildResetResponse,
  GraphBuildTaskResponse,
} from '@/shared/api/generated/types.gen';
import { unwrap, unwrapQueuedTask } from '@/shared/api';

/**
 * 子图节点；保留手写。
 *
 * 契约的 `GraphNode.normalized` 是 `{[key: string]: unknown}`，`graph-view.ts` 的
 * `describeNodeType` 直接读 `normalized.type` 当展示类型，生成模型会让它退化成 `unknown`。
 */
export type GraphNode = {
  id: string;
  /** 展示名：`name` → `content_preview` → `chunk_id` → Unknown。 */
  name: string;
  original_id: string;
  /** Chunk 节点是 `Chunk`，其余取属性里的 `label`。 */
  type: string;
  labels: string[];
  properties: Record<string, unknown>;
  normalized: { name: string; type: string; source: string };
  graph_type: string;
};

/**
 * 子图边；保留手写。
 *
 * 同 `GraphNode`：契约的 `normalized` 是开放 map，`describeEdgeType` 读 `normalized.type`。
 */
export type GraphEdge = {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  properties: Record<string, unknown>;
  normalized: { type: string; direction: string };
};

/**
 * 子图；保留手写。
 *
 * 契约的 `GraphSubgraphResponse.data` 是 `GraphSubgraphData`，其 `nodes` / `edges` 用上面两份
 * 窄投影；画布与图例按 `normalized` / `type` 的窄类型工作，因此沿用这份 `data` 投影。
 */
export type GraphSubgraph = { nodes: GraphNode[]; edges: GraphEdge[] };

/**
 * 抽取器配置；保留手写。
 *
 * 契约的 `GraphBuildConfigItem.extractor_options` 是 `{[key: string]: unknown}`，配置表单按
 * `model_spec` / `schema` / `concurrency_count` / `model_params` 读取这些键。
 */
export type GraphExtractorOptions = {
  model_spec?: string | null;
  schema?: string | null;
  concurrency_count?: number | null;
  model_params?: Record<string, unknown> | null;
};

/** 已锁定的抽取配置；保留手写（`extractor_options` 见上）。 */
export type GraphBuildConfig = {
  locked: boolean;
  extractor_type?: string | null;
  extractor_options?: GraphExtractorOptions | null;
  created_at?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

/**
 * 图谱构建状态；保留手写。
 *
 * 契约的 `GraphBuildStatusResponse.config` 是 `GraphBuildConfigItem`，其 `extractor_options` 是
 * 开放 map；状态面板把 `config` 交给配置表单回填（需要窄的 `GraphBuildConfig`）。`*_counts`
 * 与 `build_task_status` 也是界面直接读取的窄形状。
 */
export type GraphBuildStatus = {
  kb_id: string;
  kb_type: string;
  configured: boolean;
  locked: boolean;
  config: GraphBuildConfig | null;
  total_chunks: number;
  /** 待抽取（图谱口径）的 chunk 数；为 0 时不该给「开始索引」。 */
  pending_chunks: number;
  indexed_chunks: number;
  structured_chunks: number;
  extraction_counts: { pending: number; succeeded: number; failed: number };
  vector_counts: {
    pending: number;
    processing: number;
    indexed: number;
    failed: number;
  };
  entity_count: number;
  relationship_count: number;
  /** 后端把「最新一条任务」的状态映射过来：cancelled 也落在 failed。 */
  build_task_status: 'pending' | 'running' | 'completed' | 'failed' | null;
  build_task_progress: number;
};

/**
 * 抽取失败的 chunk 样例；保留手写。
 *
 * 契约的 `GraphBuildFailedChunkSample.details` 是开放 map，失败样例弹窗读
 * `attempt_count` / `last_error`。
 */
export type GraphFailedChunkSample = {
  chunk_id: string;
  file_id: string;
  chunk_index: number;
  content: string;
  details: {
    attempt_count?: number;
    failed_at?: string;
    last_error?: string;
  } | null;
};

/** 图谱构建/修复任务受理结果；契约生成的 `GraphBuildTaskResponse`。 */
export type GraphBuildTaskResult = GraphBuildTaskResponse;

export const graphApi = {
  /** 查询子图；`nodeLabel` 传 `*` 表示不按关键词过滤。 */
  async getSubgraph(
    kbId: string,
    options: {
      nodeLabel?: string;
      maxDepth?: number;
      maxNodes?: number;
      excludeChunk?: boolean;
    } = {},
  ): Promise<GraphSubgraph> {
    const result = unwrap<{ data?: Partial<GraphSubgraph> }>(
      await getSubgraphApiGraphSubgraphGet({
        query: {
          kb_id: kbId,
          node_label: options.nodeLabel ?? '*',
          max_depth: options.maxDepth ?? 2,
          max_nodes: options.maxNodes ?? 100,
          exclude_chunk: options.excludeChunk ?? false,
        },
      }),
    );
    return { nodes: result.data?.nodes ?? [], edges: result.data?.edges ?? [] };
  },

  /** 图谱构建状态；`build_task_status` 为 pending/running 时才需要轮询。 */
  async getGraphBuildStatus(kbId: string): Promise<GraphBuildStatus> {
    return unwrap<GraphBuildStatus>(
      await getGraphBuildStatusApiKnowledgeDatabasesKbIdGraphBuildStatusGet({
        path: { kb_id: kbId },
      }),
    );
  },

  /** 锁定抽取配置；锁定后 `extractor_type` 不可改。 */
  async configureGraphBuild(
    kbId: string,
    input: {
      extractorType: string;
      extractorOptions: GraphExtractorOptions;
    },
  ): Promise<GraphBuildConfig | null> {
    const result = unwrap<{ config?: GraphBuildConfig | null }>(
      await configureGraphBuildApiKnowledgeDatabasesKbIdGraphBuildConfigPost({
        path: { kb_id: kbId },
        body: {
          extractor_type: input.extractorType,
          extractor_options: input.extractorOptions,
        },
      }),
    );
    return result.config ?? null;
  },

  /** 提交图谱构建任务（后端异步执行，409 表示已有任务在跑）；契约生成的 `GraphBuildTaskResponse`。 */
  async indexGraphBuild(kbId: string): Promise<GraphBuildTaskResponse> {
    return unwrapQueuedTask(
      unwrap<GraphBuildTaskResponse>(
        await indexGraphBuildApiKnowledgeDatabasesKbIdGraphBuildIndexPost({
          path: { kb_id: kbId },
        }),
      ),
      '图谱构建任务提交失败。',
    );
  },

  /** 重置构建状态；是否清抽取结果与配置由调用方明确给出；契约生成的 `GraphBuildResetResponse`。 */
  async resetGraphBuild(
    kbId: string,
    options: { clearExtractionResult: boolean; clearConfig: boolean },
  ): Promise<GraphBuildResetResponse> {
    return unwrap<GraphBuildResetResponse>(
      await resetGraphBuildApiKnowledgeDatabasesKbIdGraphBuildResetPost({
        path: { kb_id: kbId },
        body: {
          clear_extraction_result: options.clearExtractionResult,
          clear_config: options.clearConfig,
        },
      }),
    );
  },

  /**
   * 对账向量记录：后端把它也做成后台任务，返回 `{message, status:'queued', task_id, mode}`，
   * 因此和索引一样按「只有 queued 算受理」处理。界面只用 `failed`；契约生成的
   * `GraphBuildReconcileResponse`。
   */
  async reconcileGraphBuild(
    kbId: string,
    mode: 'failed' | 'all_vectors',
  ): Promise<GraphBuildReconcileResponse> {
    return unwrapQueuedTask(
      unwrap<GraphBuildReconcileResponse>(
        await reconcileGraphBuildApiKnowledgeDatabasesKbIdGraphBuildReconcilePost(
          {
            path: { kb_id: kbId },
            body: { mode },
          },
        ),
      ),
      '向量对账任务提交失败。',
    );
  },

  /** 抽取失败的 chunk 样例；后端把 limit 夹在 1..10。 */
  async getGraphBuildFailedChunks(
    kbId: string,
    limit = 10,
  ): Promise<GraphFailedChunkSample[]> {
    const result = unwrap<{ samples?: GraphFailedChunkSample[] }>(
      await getGraphBuildFailedChunksApiKnowledgeDatabasesKbIdGraphBuildFailedChunksGet(
        { path: { kb_id: kbId }, query: { limit } },
      ),
    );
    return result.samples ?? [];
  },
};
