/**
 * 评估视图的纯逻辑：数据集/运行的展示口径、标签、进度与指标格式化。
 *
 * 展示口径与格式化函数集中在这里；`f1@k` 的显示、错误判定的单一来源、进度缺失时的回退
 * 写在各函数注释里。
 */
import type {
  DatasetBuildMetadata,
  DatasetBuildStatus,
  EvaluationDataset,
  EvaluationRun,
  EvaluationRunItem,
  RunMetrics,
} from '../api/evaluation-api';

type View = { label: string; className: string };

const TAG = {
  neutral: 'bg-color-fill-2 text-color-text-2',
  info: 'bg-primary-6/10 text-primary-6',
  success: 'bg-success-6/10 text-success-6',
  warning: 'bg-warning-6/10 text-warning-6',
  danger: 'bg-danger-6/10 text-danger-6',
} as const;

/** 数据集构建状态：后端只产出 pending/running/completed/failed，默认值按 completed。 */
export const datasetBuildStatus = (
  metadata?: DatasetBuildMetadata | null,
): DatasetBuildStatus => metadata?.status ?? 'completed';

export const datasetStatusView = (
  metadata?: DatasetBuildMetadata | null,
): View => {
  switch (datasetBuildStatus(metadata)) {
    case 'pending':
      return { label: '等待生成', className: TAG.warning };
    case 'running':
      return { label: '生成中', className: TAG.info };
    case 'failed':
      return { label: '生成失败', className: TAG.danger };
    default:
      return { label: '已完成', className: TAG.success };
  }
};

/** 生成中（含排队）才需要进度条与轮询。 */
export const isDatasetGenerating = (
  metadata?: DatasetBuildMetadata | null,
): boolean => {
  const status = datasetBuildStatus(metadata);
  return status === 'pending' || status === 'running';
};

/** 只有完成与失败的数据集能预览/继续生成；失败的不能再跑评估。 */
export const canPreviewDataset = (
  metadata?: DatasetBuildMetadata | null,
): boolean => {
  const status = datasetBuildStatus(metadata);
  return status === 'completed' || status === 'failed';
};

export const isDatasetCompleted = (
  metadata?: DatasetBuildMetadata | null,
): boolean => datasetBuildStatus(metadata) === 'completed';

/** 生成中的进度；缺失或非法时返回 null（界面就不画进度条）。 */
export const datasetProgress = (
  metadata?: DatasetBuildMetadata | null,
): number | null => {
  if (!isDatasetGenerating(metadata)) return null;
  const progress = Number(metadata?.progress);
  if (!Number.isFinite(progress)) return null;
  return Math.min(100, Math.max(0, Math.round(progress)));
};

/** 生成状态的一句话：后端消息优先，其次状态标签。 */
export const datasetStatusMessage = (
  metadata?: DatasetBuildMetadata | null,
): string => {
  const message = metadata?.error_message ?? metadata?.message;
  if (typeof message === 'string' && message.trim()) return message;
  return datasetStatusView(metadata).label;
};

/** 数据集类型标签：只有 gold chunks / 只有 gold answer / 仅查询。 */
export const datasetKindLabel = (
  dataset: Pick<EvaluationDataset, 'has_gold_chunks' | 'has_gold_answers'>,
): string => {
  if (dataset.has_gold_chunks && !dataset.has_gold_answers) return '检索评估';
  if (dataset.has_gold_answers && !dataset.has_gold_chunks) return '问答评估';
  if (!dataset.has_gold_chunks && !dataset.has_gold_answers) return '仅查询';
  return '检索 + 问答';
};

/** 数据集来源：后端 `build_metadata.source === 'generated'` 表示自动生成。 */
export const datasetSourceLabel = (
  metadata?: DatasetBuildMetadata | null,
): string => (metadata?.source === 'generated' ? '自动生成' : '上传');

const RUN_TAG = TAG;

/** 运行状态文案：运行中 / 已完成 / 失败 / 已暂停。 */
export const runStatusView = (status?: string | null): View => {
  switch (status) {
    case 'running':
      return { label: '运行中', className: RUN_TAG.info };
    case 'completed':
      return { label: '已完成', className: RUN_TAG.success };
    case 'failed':
      return { label: '失败', className: RUN_TAG.danger };
    case 'paused':
      return { label: '已暂停', className: RUN_TAG.warning };
    default:
      return {
        label: status ? String(status) : '未知',
        className: RUN_TAG.neutral,
      };
  }
};

/**
 * 运行进度：优先用后端在跑任务给的 `progress`，否则按完成条数推算。
 *
 * 后端只在「状态是 running 且有存活任务」时下发 progress，另外 `get_run_results` 在运行行
 * 还没落库时回的是任务形状（只有 progress），两种都要能用。
 */
export const runProgress = (
  run: Pick<EvaluationRun, 'progress' | 'completed_items' | 'total_items'>,
): number | null => {
  // `progress: null` 不等于 0：那是「没有进度信息」，要回落到按完成条数推算
  if (run.progress !== null && run.progress !== undefined) {
    const progress = Number(run.progress);
    if (Number.isFinite(progress)) {
      return Math.min(100, Math.max(0, Math.round(progress)));
    }
  }
  const total = Number(run.total_items);
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.min(
    100,
    Math.max(0, Math.round((Number(run.completed_items) / total) * 100)),
  );
};

/** 进度文案：后端消息 → 「评估 c/t」→ 「评估进行中」。 */
export const runProgressMessage = (
  run: Pick<
    EvaluationRun,
    'progress' | 'completed_items' | 'total_items' | 'message'
  >,
): string => {
  if (run.message && String(run.message).trim()) return String(run.message);
  const total = Number(run.total_items);
  if (Number.isFinite(total) && total > 0) {
    return `评估 ${Number(run.completed_items) || 0}/${total}`;
  }
  return '评估进行中';
};

/**
 * 转成有限数字；`null`/`undefined`/空串/布尔以外的非数字都算「没有值」。
 * `Number(null)` 是 0，直接用它会把「没数据」显示成 0.0%。
 */
const toMetricNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * 运行耗时：两端时间都有才算；运行中显示「进行中」，缺时间给 `-`。
 */
export const runDuration = (
  run: Pick<EvaluationRun, 'status' | 'started_at' | 'completed_at'>,
): string => {
  if (run.status === 'running') return '进行中';
  if (!run.started_at || !run.completed_at) return '-';
  const started = Date.parse(run.started_at);
  const completed = Date.parse(run.completed_at);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return '-';
  const seconds = Math.max(0, (completed - started) / 1000);
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
};

/** 完成率：完成条数 / 总条数；总数为 0 时不显示。 */
export const runCompletion = (
  run: Pick<EvaluationRun, 'completed_items' | 'total_items'>,
): number | null => {
  const total = Number(run.total_items);
  if (!Number.isFinite(total) || total <= 0) return null;
  const completed = Number(run.completed_items) || 0;
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
};

/** 运行历史的默认展示：最近一次（后端按时间倒序给）。 */
export const latestRun = (
  runs?: EvaluationRun[] | null,
): EvaluationRun | null => (runs && runs.length > 0 ? runs[0] : null);

/** 数据集名：运行里只存 id，名字从数据集列表投影取；找不到就回落 id。 */
export const datasetNameOf = (
  datasetId: string,
  datasets?: Array<{ dataset_id: string; name: string }> | null,
): string =>
  datasets?.find((item) => item.dataset_id === datasetId)?.name ?? datasetId;

/** 可评估的数据集：只有生成完成的能跑。 */
export const evaluableDatasets = <
  T extends { build_metadata?: DatasetBuildMetadata | null },
>(
  datasets?: T[] | null,
): T[] =>
  (datasets ?? []).filter((item) => isDatasetCompleted(item.build_metadata));

export const formatPercent = (value: unknown, digits = 1): string => {
  const numeric = toMetricNumber(value);
  if (numeric === null) return '-';
  return `${(numeric * 100).toFixed(digits)}%`;
};

/** 指标数值：三位小数；非数字给 `-`。 */
export const formatMetricValue = (value: unknown): string => {
  const numeric = toMetricNumber(value);
  if (numeric === null) return '-';
  return numeric.toFixed(3);
};

export type MetricTone = 'success' | 'warning' | 'danger';

/** 指标颜色阈值：≥0.8 好、≥0.6 警告、其余差；非数字不给色。 */
export const metricTone = (value: unknown): MetricTone | null => {
  const numeric = toMetricNumber(value);
  if (numeric === null) return null;
  if (numeric >= 0.8) return 'success';
  if (numeric >= 0.6) return 'warning';
  return 'danger';
};

/**
 * 检索指标的展示顺序与短名。
 *
 * 后端同时算 recall@k 与 f1@k（`metrics.py`），因此 `f1@k` 一并显示：只认
 * `recall*|precision*|map|ndcg` 会把 f1 漏掉。
 */
export const RETRIEVAL_METRIC_ORDER = [
  'recall@1',
  'recall@3',
  'recall@5',
  'recall@10',
  'f1@1',
  'f1@3',
  'f1@5',
  'f1@10',
  'precision@10',
  'map',
  'ndcg@10',
] as const;

/** 检索侧指标键的形态（后端目前只产出 recall@k / f1@k）。 */
const RETRIEVAL_METRIC_PATTERN = /^(recall|f1|precision|map|ndcg|mrr|hit_rate)/;

export const metricShortName = (key: string): string => {
  const match = /^([a-z][a-z0-9]*)@(\d+)$/.exec(key);
  const names: Record<string, string> = {
    recall: 'R',
    f1: 'F1',
    precision: 'P',
    ndcg: 'NDCG',
  };
  if (match) return `${names[match[1]] ?? match[1]}@${match[2]}`;
  return key;
};

/** 这条结果里的检索指标（按固定顺序，未知键排在后面按原名）。 */
export const retrievalMetricEntries = (
  metrics?: RunMetrics | null,
): Array<{ key: string; label: string; value: number }> => {
  const entries = Object.entries(metrics ?? {}).filter(
    ([key, value]) =>
      typeof value === 'number' &&
      Number.isFinite(value) &&
      // 答案侧的 score/answer_correctness 不是检索指标，别混进这一列
      RETRIEVAL_METRIC_PATTERN.test(key),
  );
  const known = RETRIEVAL_METRIC_ORDER.filter((key) =>
    entries.some(([entryKey]) => entryKey === key),
  );
  const rest = entries
    .map(([key]) => key)
    .filter(
      (key) => !(RETRIEVAL_METRIC_ORDER as readonly string[]).includes(key),
    )
    .sort();
  return [...known, ...rest].map((key) => ({
    key,
    label: metricShortName(key),
    value: Number((metrics ?? {})[key]),
  }));
};

/**
 * 逐条结果是否算「错误」。
 *
 * 与后端 `_is_error_run_item` 同口径（答案得分 ≤0.5 或任一 recall@k < 0.3），
 * 让「错误结果」这件事只有一个判定来源，避免界面与后端各说各话。
 */
export const isErrorRunItem = (item: EvaluationRunItem): boolean => {
  const score = Number(item.metrics?.score);
  if (Number.isFinite(score) && score <= 0.5) return true;
  return Object.entries(item.metrics ?? {}).some(
    ([key, value]) =>
      key.startsWith('recall@') &&
      Number.isFinite(Number(value)) &&
      Number(value) < 0.3,
  );
};

/** 答案评判：只有后端给出 `metrics.score` 时才算有分数。 */
export const answerScore = (item: EvaluationRunItem): number | null => {
  const score = Number(item.metrics?.score);
  return Number.isFinite(score) ? score : null;
};

export const answerVerdict = (score: number | null): string => {
  if (score === null) return '未评判';
  return score === 1 ? '正确' : '错误';
};
