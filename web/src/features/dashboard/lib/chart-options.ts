/**
 * 图表 option 构造（纯函数）。
 *
 * 每个 builder 只接收已经排序/裁剪好的数据与一份解析好的配色，返回可直接交给
 * `setOption` 的对象。颜色不经手硬编码值，全部来自 `ChartPalette`；
 * 排序、Top-N 裁剪、分类标签归一也由这一层负责，界面不再重复判断。
 *
 * 分类标签与 tooltip 走 ECharts 自带的文本渲染，不拼 HTML 字符串。
 */
import type { EChartsCoreOption } from 'echarts/core';

import type {
  AgentAnalytics,
  CallMetricType,
  CallTimeRange,
  CallTimeseries,
  ThreadAnalytics,
  ToolCallStats,
} from '../api/dashboard-api';
import { seriesColor, type ChartPalette } from './chart-palette';
import { parseRate } from './dashboard-metrics';
import { formatTokenValue } from './dashboard-format';

/** 后端在无数据时下发的哨兵分类名与其界面文案。 */
const CATEGORY_LABELS: Record<string, string> = {
  None: '未知模型',
  unknown_model: '未知模型',
  unknown_agent: '未知智能体',
  unknown_tool: '未知工具',
  input_tokens: '输入 Token',
  output_tokens: '输出 Token',
};

/** 分类名 → 界面文案；智能体类分类优先用后端下发的 `agent_names`。 */
export const resolveCategoryLabel = (
  category: string,
  agentNames: Record<string, string> | null = null,
): string => CATEGORY_LABELS[category] ?? agentNames?.[category] ?? category;

/** 折线/柱图 tooltip 的数值文案：Token 视图折算成 M，其余保持原值。 */
export const formatCallValue = (
  value: number,
  metricType: CallMetricType,
): string =>
  metricType === 'tokens'
    ? formatTokenValue(value)
    : value.toLocaleString('zh-CN');

/**
 * 时间分桶的横轴文案：
 * 小时桶取 `HH:mm`、周桶取 `第N周`、日桶取 `MM-DD`。
 */
export const formatCallBucketLabel = (
  date: string,
  timeRange: CallTimeRange,
): string => {
  const text = String(date ?? '');
  if (timeRange === '14hours') return text.split(' ')[1] ?? text;
  if (timeRange === '14weeks') {
    const week = text.split('-')[1];
    return week ? `第${Number(week)}周` : text;
  }
  return text.split('-').slice(1).join('-') || text;
};

const axisTextStyle = (palette: ChartPalette) => ({
  color: palette.axisLabel,
  fontSize: 11,
});

const tooltipStyle = (palette: ChartPalette) => ({
  backgroundColor: palette.tooltipBackground,
  borderColor: palette.tooltipBorder,
  borderWidth: 1,
  textStyle: { color: palette.legendText, fontSize: 12 },
});

/** 调用统计：按分类堆叠的柱图 + 类型/时间范围切换后的汇总数字。 */
export const buildCallTimeseriesOption = ({
  timeseries,
  timeRange,
  metricType,
  palette,
}: {
  timeseries: CallTimeseries;
  timeRange: CallTimeRange;
  metricType: CallMetricType;
  palette: ChartPalette;
}): EChartsCoreOption => {
  const points = toTimeseriesPoints(timeseries.data);
  const categories = timeseries.categories ?? [];
  const legend = categories.map((category) =>
    resolveCategoryLabel(category, timeseries.agent_names),
  );

  return {
    grid: { left: 8, right: 16, top: 24, bottom: 44, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tooltipStyle(palette),
      valueFormatter: (value: number) =>
        formatCallValue(Number(value ?? 0), metricType),
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      data: legend,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: axisTextStyle(palette),
    },
    xAxis: {
      type: 'category',
      data: points.map((point) => formatCallBucketLabel(point.date, timeRange)),
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisTick: { show: false },
      axisLabel: axisTextStyle(palette),
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        ...axisTextStyle(palette),
        formatter: (value: number) =>
          formatCallValue(Number(value ?? 0), metricType),
      },
      splitLine: { lineStyle: { color: palette.splitLine } },
    },
    series: categories.map((category, index) => ({
      name: resolveCategoryLabel(category, timeseries.agent_names),
      type: 'bar',
      stack: 'total',
      barMaxWidth: 28,
      emphasis: { focus: 'series' },
      itemStyle: { color: seriesColor(palette, index) },
      data: points.map((point) => point.data[category] ?? 0),
    })),
  };
};

/** 最常用工具 Top-N：横向柱图，最常用的排在最上面。 */
export const buildToolRankOption = ({
  tools,
  limit = 10,
  palette,
}: {
  tools: ToolCallStats['most_used_tools'];
  limit?: number;
  palette: ChartPalette;
}): EChartsCoreOption => {
  const ranked = rankTools(tools, limit);
  return {
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tooltipStyle(palette),
    },
    xAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisLabel: axisTextStyle(palette),
      splitLine: { lineStyle: { color: palette.splitLine } },
    },
    yAxis: {
      type: 'category',
      data: ranked.map((tool) => tool.tool_name),
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisTick: { show: false },
      axisLabel: { ...axisTextStyle(palette), interval: 0 },
    },
    series: [
      {
        name: '调用次数',
        type: 'bar',
        data: ranked.map((tool) => tool.count),
        barMaxWidth: 14,
        itemStyle: {
          color: seriesColor(palette, 0),
          borderRadius: [0, 4, 4, 0],
        },
      },
    ],
  };
};

/**
 * 工具错误分布：环形图，取错误次数最多的前 `limit` 个工具。
 * `distribution` 为空时返回 `null`，由界面显式呈现空态而不是画一张空图。
 */
export const buildToolErrorPieOption = ({
  distribution,
  limit = 5,
  palette,
}: {
  distribution: ToolCallStats['tool_error_distribution'];
  limit?: number;
  palette: ChartPalette;
}): EChartsCoreOption | null => {
  const entries = rankErrorDistribution(distribution).slice(0, limit);
  if (entries.length === 0) return null;

  return {
    tooltip: { trigger: 'item', ...tooltipStyle(palette) },
    legend: {
      bottom: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: axisTextStyle(palette),
    },
    series: [
      {
        name: '错误分布',
        type: 'pie',
        radius: ['35%', '65%'],
        center: ['50%', '44%'],
        data: entries.map((entry) => ({
          name: entry.tool_name,
          value: entry.error_count,
        })),
        itemStyle: {
          borderColor: palette.surface,
          borderWidth: 2,
          borderRadius: 4,
        },
        label: { show: false },
        labelLine: { show: false },
        color: entries.map((_, index) => seriesColor(palette, index)),
      },
    ],
  };
};

/** 智能体分析：会话数与工具调用数并列柱图，取总量前 3 的智能体。 */
export const buildAgentRankOption = ({
  agents,
  limit = 3,
  palette,
}: {
  agents: AgentAnalytics;
  limit?: number;
  palette: ChartPalette;
}): EChartsCoreOption | null => {
  const ranked = rankAgents(agents, limit);
  if (ranked.length === 0) return null;

  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tooltipStyle(palette),
    },
    legend: {
      data: ['对话数', '工具调用数'],
      top: 0,
      right: 0,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: axisTextStyle(palette),
    },
    xAxis: {
      type: 'category',
      data: ranked.map((agent) => agent.name),
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisTick: { show: false },
      axisLabel: { ...axisTextStyle(palette), interval: 0 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: axisTextStyle(palette),
      splitLine: { lineStyle: { color: palette.splitLine } },
    },
    series: [
      {
        name: '对话数',
        type: 'bar',
        barMaxWidth: 24,
        data: ranked.map((agent) => agent.conversationCount),
        itemStyle: {
          color: seriesColor(palette, 0),
          borderRadius: [4, 4, 0, 0],
        },
      },
      {
        name: '工具调用数',
        type: 'bar',
        barMaxWidth: 24,
        data: ranked.map((agent) => agent.toolUsageCount),
        itemStyle: {
          color: seriesColor(palette, 1),
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  };
};

/** 分布对象 → 按数量降序的条目；空键名归到「未知」。 */
export const distributionEntries = (
  distribution: Record<string, unknown> = {},
): { name: string; value: number }[] =>
  Object.entries(distribution ?? {})
    .map(([name, value]) => ({
      name: name || '未知',
      value: Number(value ?? 0),
    }))
    .sort((left, right) => right.value - left.value);

/**
 * 知识库分类分布饼图（知识库类型 / 文件类型共用）。
 * 空分布返回 `null`，界面据此渲染空态文案。
 */
export const buildDistributionPieOption = ({
  distribution,
  name,
  palette,
}: {
  distribution: Record<string, unknown>;
  name: string;
  palette: ChartPalette;
}): EChartsCoreOption | null => {
  const entries = distributionEntries(distribution);
  if (entries.length === 0) return null;

  return {
    tooltip: { trigger: 'item', ...tooltipStyle(palette) },
    legend: {
      bottom: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: axisTextStyle(palette),
    },
    series: [
      {
        name,
        type: 'pie',
        radius: ['40%', '68%'],
        center: ['50%', '44%'],
        data: entries,
        itemStyle: {
          borderColor: palette.surface,
          borderWidth: 2,
          borderRadius: 6,
        },
        label: { show: false },
        labelLine: { show: false },
        color: entries.map((_, index) => seriesColor(palette, index)),
      },
    ],
  };
};

/** 会话增长与活跃趋势：新增会话柱图 + 活跃会话折线。 */
export const buildThreadTrendOption = ({
  trends,
  palette,
}: {
  trends: ThreadAnalytics['daily_trends'];
  palette: ChartPalette;
}): EChartsCoreOption => ({
  grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
  tooltip: { trigger: 'axis', ...tooltipStyle(palette) },
  legend: {
    data: ['新增会话', '活跃会话'],
    top: 0,
    right: 0,
    itemWidth: 12,
    itemHeight: 12,
    textStyle: axisTextStyle(palette),
  },
  xAxis: {
    type: 'category',
    data: trends.map((trend) => trend.date.slice(5)),
    axisLine: { lineStyle: { color: palette.axisLine } },
    axisTick: { show: false },
    axisLabel: axisTextStyle(palette),
  },
  yAxis: {
    type: 'value',
    axisLine: { show: false },
    axisLabel: axisTextStyle(palette),
    splitLine: { lineStyle: { color: palette.splitLine } },
  },
  series: [
    {
      name: '新增会话',
      type: 'bar',
      barMaxWidth: 18,
      data: trends.map((trend) => trend.new_threads),
      itemStyle: { color: seriesColor(palette, 0), borderRadius: [4, 4, 0, 0] },
    },
    {
      name: '活跃会话',
      type: 'line',
      smooth: true,
      data: trends.map((trend) => trend.active_threads),
      itemStyle: { color: seriesColor(palette, 1) },
      lineStyle: { width: 2 },
    },
  ],
});

/** 对话轮数深度分布：按桶顺序排列的柱图，柱顶带数量。 */
export const buildThreadDepthOption = ({
  distribution,
  palette,
}: {
  distribution: Record<string, number>;
  palette: ChartPalette;
}): EChartsCoreOption => {
  const buckets = sortDepthDistribution(distribution);
  return {
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tooltipStyle(palette),
    },
    xAxis: {
      type: 'category',
      data: buckets.map((bucket) => bucket.label),
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisTick: { show: false },
      axisLabel: axisTextStyle(palette),
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: axisTextStyle(palette),
      splitLine: { lineStyle: { color: palette.splitLine } },
    },
    series: [
      {
        name: '会话数量',
        type: 'bar',
        barMaxWidth: 28,
        data: buckets.map((bucket, index) => ({
          value: bucket.value,
          itemStyle: {
            color: seriesColor(palette, index),
            borderRadius: [4, 4, 0, 0],
          },
        })),
        label: {
          show: true,
          position: 'top',
          color: palette.axisLabel,
          fontSize: 11,
        },
      },
    ],
  };
};

/** 智能体会话承载排行：取会话数前 `limit` 的横向柱图，柱右带数量。 */
export const buildThreadAgentOption = ({
  distribution,
  limit = 8,
  palette,
}: {
  distribution: ThreadAnalytics['agent_distribution'];
  limit?: number;
  palette: ChartPalette;
}): EChartsCoreOption => {
  const agents = (distribution ?? []).slice(0, limit);
  return {
    grid: { left: 8, right: 32, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...tooltipStyle(palette),
    },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: axisTextStyle(palette),
      splitLine: { lineStyle: { color: palette.splitLine } },
    },
    yAxis: {
      type: 'category',
      data: agents.map((agent) => agent.agent_name || agent.agent_id),
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisTick: { show: false },
      axisLabel: { ...axisTextStyle(palette), interval: 0 },
    },
    series: [
      {
        name: '会话数',
        type: 'bar',
        barMaxWidth: 16,
        data: agents.map((agent, index) => ({
          value: agent.thread_count,
          itemStyle: {
            color: seriesColor(palette, index),
            borderRadius: [0, 4, 4, 0],
          },
        })),
        label: {
          show: true,
          position: 'right',
          color: palette.axisLabel,
          fontSize: 11,
        },
      },
    ],
  };
};

/** 深度分布桶的固定顺序；后端按这组标签下发，未知标签排在其后。 */
export const DEPTH_BUCKET_ORDER = [
  '0 条',
  '1-2 条',
  '3-5 条',
  '6-10 条',
  '11-20 条',
  '20+ 条',
] as const;

/** 深度分布 → 固定顺序的桶列表；后端新增的未知桶按名称排序附在末尾，不丢数据。 */
export const sortDepthDistribution = (
  distribution: Record<string, number> = {},
): { label: string; value: number }[] => {
  const entries = Object.entries(distribution).map(([label, value]) => ({
    label,
    value: Number(value ?? 0),
  }));
  const known = DEPTH_BUCKET_ORDER.map((label) => ({
    label,
    value: entries.find((entry) => entry.label === label)?.value ?? 0,
  }));
  const unknown = entries
    .filter(
      (entry) =>
        !DEPTH_BUCKET_ORDER.includes(
          entry.label as (typeof DEPTH_BUCKET_ORDER)[number],
        ),
    )
    .sort((left, right) => left.label.localeCompare(right.label));
  return [...known, ...unknown];
};

/**
 * 后端这些列表是 `list[dict]`，生成物只给 `Record<string, unknown>`；字段名的事实来源是
 * `ars/repositories/dashboard_repository.py`，下面按它取值并做一次窄化。
 */
const readString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value ? value : fallback;

const readNumber = (value: unknown): number => Number(value ?? 0);

/** 时间序列点。 */
export type TimeseriesPoint = {
  date: string;
  data: Record<string, number>;
  total: number;
};

/** 把生成物的宽松元素折成时间序列点（`data` 是「分类 → 计数」）。 */
export const toTimeseriesPoints = (points: unknown): TimeseriesPoint[] =>
  (Array.isArray(points) ? points : []).map((point) => {
    const record = (point ?? {}) as Record<string, unknown>;
    const buckets = (record.data ?? {}) as Record<string, unknown>;
    return {
      date: readString(record.date),
      data: Object.fromEntries(
        Object.entries(buckets).map(([key, value]) => [key, readNumber(value)]),
      ),
      total: readNumber(record.total),
    };
  });

/** 最常用工具 Top-N：按调用次数降序取前 N，再反转成「最多的在最上面」的绘图顺序。 */
export const rankTools = (
  tools: ToolCallStats['most_used_tools'] = [],
  limit = 10,
): { tool_name: string; count: number }[] =>
  [...tools]
    .map((tool) => ({
      tool_name: readString(tool.tool_name, '未知工具'),
      count: readNumber(tool.count),
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, limit)
    .reverse();

/** 错误分布 → 按错误次数降序的列表。 */
export const rankErrorDistribution = (
  distribution: ToolCallStats['tool_error_distribution'] = {},
): { tool_name: string; error_count: number }[] =>
  Object.entries(distribution ?? {})
    .map(([tool_name, error_count]) => ({
      tool_name,
      error_count: Number(error_count ?? 0),
    }))
    .sort((left, right) => right.error_count - left.error_count);

/** 智能体排行：按「对话数 + 工具调用数」降序取前 N。 */
export const rankAgents = (
  analytics: AgentAnalytics,
  limit = 3,
): {
  agent_id: string;
  name: string;
  conversationCount: number;
  toolUsageCount: number;
  satisfactionRate: number;
  totalFeedbacks: number;
}[] => {
  const conversations = new Map(
    (analytics?.agent_conversation_counts ?? []).map((item) => [
      readString(item.agent_id),
      readNumber(item.conversation_count),
    ]),
  );
  const tools = new Map(
    (analytics?.agent_tool_usage ?? []).map((item) => [
      readString(item.agent_id),
      readNumber(item.tool_usage_count),
    ]),
  );
  const satisfaction = new Map(
    (analytics?.agent_satisfaction_rates ?? []).map((item) => [
      readString(item.agent_id),
      item,
    ]),
  );
  const names = analytics?.agent_names ?? {};

  return [...new Set([...conversations.keys(), ...tools.keys()])]
    .map((agentId) => ({
      agent_id: agentId,
      name: names[agentId] || agentId,
      conversationCount: conversations.get(agentId) ?? 0,
      toolUsageCount: tools.get(agentId) ?? 0,
      satisfactionRate: parseRate(
        satisfaction.get(agentId)?.satisfaction_rate as
          number | string | null | undefined,
      ),
      totalFeedbacks: readNumber(satisfaction.get(agentId)?.total_feedbacks),
    }))
    .sort(
      (left, right) =>
        right.conversationCount +
        right.toolUsageCount -
        (left.conversationCount + left.toolUsageCount),
    )
    .slice(0, limit);
};

/** 智能体满意度表：有反馈的排在前面，其次按对话数，最后按名称。 */
export const sortAgentSatisfaction = (
  analytics: AgentAnalytics,
): ReturnType<typeof rankAgents> =>
  rankAgents(analytics, Number.MAX_SAFE_INTEGER).sort(
    (left, right) =>
      right.totalFeedbacks - left.totalFeedbacks ||
      right.conversationCount - left.conversationCount ||
      left.name.localeCompare(right.name),
  );

/**
 * 调用序列是否整段为空。
 *
 * 用逐点 `total` 判定而不是响应里的 `total_count`：`tools` 口径的 `total_count`
 * 统计的是全时段调用量，与所选时间范围无关，拿它判空会把空窗口画成一张平图。
 */
export const isCallTimeseriesEmpty = (
  timeseries: CallTimeseries | undefined,
): boolean =>
  (timeseries?.data ?? []).every((point) => Number(point.total ?? 0) <= 0);

/** 智能体排行里是否至少有一个非零计数；全 0 时不该画一张空柱图。 */
export const hasAgentUsage = (agents: AgentAnalytics | undefined): boolean =>
  (agents?.agent_conversation_counts ?? []).some(
    (item) => Number(item.conversation_count ?? 0) > 0,
  ) ||
  (agents?.agent_tool_usage ?? []).some(
    (item) => Number(item.tool_usage_count ?? 0) > 0,
  );
