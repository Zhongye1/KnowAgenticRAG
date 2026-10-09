/**
 * 图谱构建面板的纯逻辑：状态标签、九个统计格、主操作按钮的取值。
 *
 * 上游 `KnowledgeGraphSection.vue` 把这些判定写在模板的 `v-if` 链里，这里提成函数是为了
 * 能直接对「有失败向量 / 有失败抽取 / 未锁定 / 构建中」这几种组合断言，而不是靠渲染猜。
 */
import type { GraphBuildStatus } from '../api/graph-api';

export type GraphBuildTone = 'info' | 'danger' | 'success' | 'warning';

/** 与文件状态徽标同一套 tone 口径（`lib/knowledge-files.ts`）。 */
const TONE_CLASSES: Record<GraphBuildTone, string> = {
  info: 'bg-primary-6/10 text-primary-6',
  danger: 'bg-danger-6/10 text-danger-6',
  success: 'bg-success-6/10 text-success-6',
  warning: 'bg-warning-6/10 text-warning-6',
};

/** 状态标签：构建中 / 执行异常 / 执行完成 / 已配置 / 未配置（上游同文案与配色）。 */
export const graphBuildStateTag = (
  status?: GraphBuildStatus | null,
): { label: string; tone: GraphBuildTone } => {
  if (
    status?.build_task_status === 'pending' ||
    status?.build_task_status === 'running'
  ) {
    return { label: '构建中', tone: 'info' };
  }
  if (status?.build_task_status === 'failed') {
    return { label: '执行异常', tone: 'danger' };
  }
  if (status?.build_task_status === 'completed') {
    return { label: '执行完成', tone: 'success' };
  }
  if (status?.locked) return { label: '已配置', tone: 'success' };
  return { label: '未配置', tone: 'warning' };
};

/** 状态标签 + 展示类，给面板直接用。 */
export const graphBuildStateView = (
  status?: GraphBuildStatus | null,
): { label: string; tone: GraphBuildTone; className: string } => {
  const { label, tone } = graphBuildStateTag(status);
  return { label, tone, className: TONE_CLASSES[tone] };
};

export type GraphBuildAction = {
  kind: 'configure' | 'building' | 'retry-vectors' | 'retry-index' | 'index';
  label: string;
  disabled: boolean;
};

export const isGraphBuildRunning = (
  status?: GraphBuildStatus | null,
): boolean =>
  status?.build_task_status === 'pending' ||
  status?.build_task_status === 'running';

/**
 * 主操作按钮。
 *
 * 与上游的一处差异：上游把「待构建 Chunk 为 0」当成所有分支的禁用条件，
 * 于是「重试失败向量」在 `pending_chunks === 0` 时点不动——而重试向量本来就不需要待构建的
 * Chunk。这里按动作给禁用条件：索引类要 `pending_chunks > 0`，重试向量只看失败数。
 */
export const graphBuildAction = (
  status?: GraphBuildStatus | null,
): GraphBuildAction => {
  if (!status?.locked) {
    return { kind: 'configure', label: '配置抽取器', disabled: false };
  }
  if (isGraphBuildRunning(status)) {
    const progress = Math.round(status.build_task_progress ?? 0);
    return { kind: 'building', label: `构建中 ${progress}%`, disabled: true };
  }
  const pending = (status.pending_chunks ?? 0) > 0;
  const vectorFailed = (status.vector_counts?.failed ?? 0) > 0;
  if (vectorFailed) {
    return { kind: 'retry-vectors', label: '重试失败向量', disabled: false };
  }
  if (status.build_task_status === 'failed') {
    return { kind: 'retry-index', label: '重试索引', disabled: !pending };
  }
  return { kind: 'index', label: '开始索引', disabled: !pending };
};

export type GraphBuildStat = {
  key: string;
  label: string;
  value: number | null;
  /** 抽取失败数大于 0 时可点开失败样例。 */
  clickable?: boolean;
};

/** 九个统计格；没有状态时值显示 `-`（`null`）。 */
export const graphBuildStats = (
  status?: GraphBuildStatus | null,
): GraphBuildStat[] => {
  const extractionFailed = status?.extraction_counts?.failed ?? 0;
  const vectorPending = status?.vector_counts?.pending ?? 0;
  const vectorProcessing = status?.vector_counts?.processing ?? 0;
  return [
    { key: 'total', label: '总 Chunk', value: status?.total_chunks ?? null },
    { key: 'pending', label: '待构建', value: status?.pending_chunks ?? null },
    { key: 'indexed', label: '已构建', value: status?.indexed_chunks ?? null },
    {
      key: 'structured',
      label: '结构完成',
      value: status?.structured_chunks ?? null,
    },
    {
      key: 'extraction-failed',
      label: '抽取失败',
      value: status ? extractionFailed : null,
      clickable: extractionFailed > 0,
    },
    {
      key: 'vector-pending',
      label: '向量待处理',
      value: status ? vectorPending + vectorProcessing : null,
    },
    {
      key: 'vector-failed',
      label: '向量失败',
      // 只有「抽取失败」能点开样例：`graph-build/failed-chunks` 给的是抽取失败的 Chunk，
      // 向量失败没有对应的样例接口，点了会展示错的数据（上游同样只让抽取失败可点）。
      value: status ? (status.vector_counts?.failed ?? 0) : null,
    },
    { key: 'entities', label: '实体', value: status?.entity_count ?? null },
    {
      key: 'relationships',
      label: '关系',
      value: status?.relationship_count ?? null,
    },
  ];
};

/** 「修改配置」「重置」只在已锁定且没有任务在跑时出现。 */
export const canManageGraphBuildConfig = (
  status?: GraphBuildStatus | null,
): boolean => Boolean(status?.locked) && !isGraphBuildRunning(status);

/** 画布空态与「开始索引」入口共用：有待构建的 Chunk 才谈得上索引。 */
export const hasPendingGraphChunks = (
  status?: GraphBuildStatus | null,
): boolean => (status?.pending_chunks ?? 0) > 0;
