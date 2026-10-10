/**
 * 图表 option 构造用例。
 *
 * 断言的是「业务结果」——数据系列的名字、顺序、数值与横轴标签、空态返回 null，
 * 而不是 ECharts 的样式细节。每个 builder 只吃已经排序裁剪好的数据与一份配色。
 */
import { describe, expect, it } from 'vitest';

import type {
  AgentAnalytics,
  CallTimeseries,
  ThreadAnalytics,
} from '@/features/dashboard/api/dashboard-api';
import {
  DEPTH_BUCKET_ORDER,
  buildAgentRankOption,
  buildCallTimeseriesOption,
  buildDistributionPieOption,
  buildThreadAgentOption,
  buildThreadDepthOption,
  buildThreadTrendOption,
  buildToolErrorPieOption,
  buildToolRankOption,
  distributionEntries,
  formatCallBucketLabel,
  formatCallValue,
  hasAgentUsage,
  isCallTimeseriesEmpty,
  rankAgents,
  rankErrorDistribution,
  rankTools,
  resolveCategoryLabel,
  sortAgentSatisfaction,
  sortDepthDistribution,
} from '@/features/dashboard/lib/chart-options';
import type { ChartPalette } from '@/features/dashboard/lib/chart-palette';

const palette: ChartPalette = {
  series: ['#data1', '#data2', '#data3'],
  axisLine: 'axis-line',
  splitLine: 'split-line',
  axisLabel: 'axis-label',
  legendText: 'legend-text',
  tooltipBackground: 'tip-bg',
  tooltipBorder: 'tip-border',
  surface: 'surface',
};

const timeseries = (extra: Partial<CallTimeseries> = {}): CallTimeseries => ({
  data: [
    { date: '2026-09-27', data: { 'default-chatbot': 3 }, total: 3 },
    { date: '2026-09-28', data: { 'default-chatbot': 0 }, total: 0 },
  ],
  categories: ['default-chatbot'],
  total_count: 3,
  average_count: 1.5,
  peak_count: 3,
  peak_date: '2026-09-27',
  agent_names: { 'default-chatbot': '智能助手' },
  ...extra,
});

describe('分类与时间桶文案', () => {
  it('后端哨兵分类名折算成界面文案，智能体名优先用接口下发的名称', () => {
    // 变异：去掉 CATEGORY_LABELS 回退会让图例出现 `unknown_model`
    expect(resolveCategoryLabel('None')).toBe('未知模型');
    expect(resolveCategoryLabel('unknown_agent')).toBe('未知智能体');
    expect(resolveCategoryLabel('input_tokens')).toBe('输入 Token');
    expect(
      resolveCategoryLabel('default-chatbot', {
        'default-chatbot': '智能助手',
      }),
    ).toBe('智能助手');
    expect(resolveCategoryLabel('unknown-tool')).toBe('unknown-tool');
  });

  it('小时桶取 HH:mm、周桶取第 N 周、日桶取 MM-DD', () => {
    // 变异：周桶不解析会让横轴显示 `2026-41`
    expect(formatCallBucketLabel('2026-10-09 12:00', '14hours')).toBe('12:00');
    expect(formatCallBucketLabel('2026-41', '14weeks')).toBe('第41周');
    expect(formatCallBucketLabel('2026-09-27', '14days')).toBe('09-27');
  });

  it('Token 视图折算成 M，其它视图保持原值分组', () => {
    expect(formatCallValue(1_500_000, 'tokens')).toBe('1.50M');
    expect(formatCallValue(1500, 'agents')).toBe('1,500');
  });
});

describe('调用统计 option', () => {
  it('每个分类一条堆叠柱，横轴按时间范围格式化，图例用界面名称', () => {
    const option = buildCallTimeseriesOption({
      timeseries: timeseries(),
      timeRange: '14days',
      metricType: 'agents',
      palette,
    });
    const series = option.series as {
      name: string;
      type: string;
      stack: string;
      data: number[];
    }[];
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      name: '智能助手',
      type: 'bar',
      stack: 'total',
    });
    expect(series[0].data).toEqual([3, 0]);
    expect((option.xAxis as { data: string[] }).data).toEqual([
      '09-27',
      '09-28',
    ]);
    expect((option.legend as { data: string[] }).data).toEqual(['智能助手']);
  });

  it('整段为 0 时判空；tools 口径的 total_count 不参与判空', () => {
    // 变异：改用 total_count 判定，会让 tools 口径的空窗口画成一张全 0 平图
    const empty = timeseries({
      data: [{ date: '2026-09-27', data: {}, total: 0 }],
      total_count: 99,
    });
    expect(isCallTimeseriesEmpty(empty)).toBe(true);
    expect(isCallTimeseriesEmpty(timeseries())).toBe(false);
    expect(isCallTimeseriesEmpty(undefined)).toBe(true);
  });
});

describe('工具排行与错误分布', () => {
  it('按次数降序取前 N，再反转成最多的在最上面', () => {
    // 变异：去掉 reverse 会让最多用的工具画在最下面
    const tools = [
      { tool_name: 'a', count: 1 },
      { tool_name: 'b', count: 9 },
      { tool_name: 'c', count: 5 },
      { tool_name: 'd', count: 3 },
    ];
    expect(rankTools(tools, 2)).toEqual([
      { tool_name: 'c', count: 5 },
      { tool_name: 'b', count: 9 },
    ]);
  });

  it('超过 10 个工具时取调用最多的 10 个', () => {
    const tools = Array.from({ length: 12 }, (_, index) => ({
      tool_name: `t${index}`,
      count: index + 1,
    }));
    const ranked = rankTools(tools, 10);
    expect(ranked).toHaveLength(10);
    // 最上面是最多的（count=12），最少用的 t0/t1 被排除，最下面是入选里最少的 t2
    expect(ranked.at(-1)).toEqual({ tool_name: 't11', count: 12 });
    expect(ranked[0]).toEqual({ tool_name: 't2', count: 3 });
    expect(ranked.some((tool) => tool.tool_name === 't0')).toBe(false);
  });

  it('错误分布按次数降序，饼图取前 5，空分布返回 null', () => {
    // 变异：空分布返回空 option 会让界面画出一张没有扇区的图
    const option = buildToolErrorPieOption({
      distribution: { a: 1, b: 7, c: 3, d: 2, e: 5, f: 6 },
      palette,
    });
    const series = option?.series as {
      data: { name: string; value: number }[];
    }[];
    expect(series[0].data.map((item) => item.name)).toEqual([
      'b',
      'f',
      'e',
      'c',
      'd',
    ]);
    expect(buildToolErrorPieOption({ distribution: {}, palette })).toBeNull();
    expect(rankErrorDistribution({ a: 1, b: 3 })).toEqual([
      { tool_name: 'b', error_count: 3 },
      { tool_name: 'a', error_count: 1 },
    ]);
  });
});

describe('智能体排行', () => {
  const analytics: AgentAnalytics = {
    total_agents: 3,
    agent_conversation_counts: [
      { agent_id: 'a', conversation_count: 5 },
      { agent_id: 'b', conversation_count: 1 },
      { agent_id: 'c', conversation_count: 0 },
    ],
    agent_satisfaction_rates: [
      { agent_id: 'a', satisfaction_rate: 50, total_feedbacks: 2 },
      { agent_id: 'b', satisfaction_rate: 100, total_feedbacks: 0 },
    ],
    agent_tool_usage: [
      { agent_id: 'a', tool_usage_count: 0 },
      { agent_id: 'b', tool_usage_count: 9 },
    ],
    agent_names: { a: '甲', b: '乙' },
    top_performing_agents: [],
  };

  it('按对话数 + 工具调用数降序，缺名回退 agent_id', () => {
    // 变异：只按对话数排序会让 b（1 对话 + 9 工具）排到 c 后面
    const ranked = rankAgents(analytics, 3);
    expect(ranked.map((agent) => agent.agent_id)).toEqual(['b', 'a', 'c']);
    expect(ranked[0]).toMatchObject({
      name: '乙',
      conversationCount: 1,
      toolUsageCount: 9,
    });
    expect(ranked[2]).toMatchObject({
      name: 'c',
      satisfactionRate: 0,
      totalFeedbacks: 0,
    });
  });

  it('满意度表按反馈数优先排序', () => {
    // 变异：去掉 feedback 排序会让 0 反馈的乙排在甲前面
    expect(
      sortAgentSatisfaction(analytics).map((agent) => agent.agent_id),
    ).toEqual(['a', 'b', 'c']);
  });

  it('柱图取前 3，两条系列各自带数值；没有任何调用时返回 null', () => {
    const option = buildAgentRankOption({ agents: analytics, palette });
    const series = option?.series as { name: string; data: number[] }[];
    expect(series[0].name).toBe('对话数');
    expect(series[0].data).toEqual([1, 5, 0]);
    expect(series[1].data).toEqual([9, 0, 0]);
    expect((option?.xAxis as { data: string[] }).data).toEqual([
      '乙',
      '甲',
      'c',
    ]);

    const idle: AgentAnalytics = {
      ...analytics,
      agent_conversation_counts: analytics.agent_conversation_counts.map(
        (item) => ({
          agent_id: item.agent_id,
          conversation_count: 0,
        }),
      ),
      agent_tool_usage: [],
    };
    expect(hasAgentUsage(idle)).toBe(false);
    expect(hasAgentUsage(analytics)).toBe(true);
  });
});

describe('知识库分布饼图', () => {
  it('按数量降序，空分布返回 null', () => {
    const option = buildDistributionPieOption({
      distribution: { pdf: 2, docx: 7 },
      name: '文件类型',
      palette,
    });
    const series = option?.series as {
      name: string;
      data: { name: string; value: number }[];
    }[];
    expect(series[0].name).toBe('文件类型');
    expect(series[0].data).toEqual([
      { name: 'docx', value: 7 },
      { name: 'pdf', value: 2 },
    ]);
    // 变异：空键名不归一，图例会渲染出一个空标签
    expect(distributionEntries({ '': 4 })).toEqual([
      { name: '未知', value: 4 },
    ]);
    expect(
      buildDistributionPieOption({ distribution: {}, name: 'x', palette }),
    ).toBeNull();
  });
});

describe('会话分析 option', () => {
  const trends: ThreadAnalytics['daily_trends'] = [
    { date: '2026-09-11', new_threads: 2, active_threads: 3, message_count: 4 },
    { date: '2026-09-12', new_threads: 0, active_threads: 1, message_count: 0 },
  ];

  it('趋势图是「新增会话柱 + 活跃会话线」，横轴取 MM-DD', () => {
    const option = buildThreadTrendOption({ trends, palette });
    const series = option.series as {
      name: string;
      type: string;
      data: number[];
    }[];
    expect(series.map((item) => [item.name, item.type])).toEqual([
      ['新增会话', 'bar'],
      ['活跃会话', 'line'],
    ]);
    expect(series[0].data).toEqual([2, 0]);
    expect(series[1].data).toEqual([3, 1]);
    expect((option.xAxis as { data: string[] }).data).toEqual([
      '09-11',
      '09-12',
    ]);
  });

  it('深度分布按固定桶顺序排列，后端新增的未知桶附在末尾且不丢数据', () => {
    const distribution = { '20+ 条': 2, '0 条': 5, '3-5 条': 1, 新桶: 4 };
    const buckets = sortDepthDistribution(distribution);
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      ...DEPTH_BUCKET_ORDER,
      '新桶',
    ]);
    expect(buckets.map((bucket) => bucket.value)).toEqual([
      5, 0, 1, 0, 0, 2, 4,
    ]);

    const option = buildThreadDepthOption({ distribution, palette });
    expect((option.xAxis as { data: string[] }).data).toEqual([
      ...DEPTH_BUCKET_ORDER,
      '新桶',
    ]);
    const series = option.series as { data: { value: number }[] }[];
    expect(series[0].data.map((item) => item.value)).toEqual([
      5, 0, 1, 0, 0, 2, 4,
    ]);
  });

  it('智能体承载排行横轴是名称（缺名回退 id），数值是会话数', () => {
    // 变异：只用 agent_name 不兜底会让缺名智能体的轴标签为空
    const option = buildThreadAgentOption({
      distribution: [
        {
          agent_id: 'a',
          agent_name: '甲',
          thread_count: 4,
          message_count: 0,
          token_count: 0,
          avg_messages: 0,
          agent_avatar: null,
        },
        {
          agent_id: 'b',
          agent_name: '',
          thread_count: 2,
          message_count: 0,
          token_count: 0,
          avg_messages: 0,
          agent_avatar: null,
        },
      ],
      palette,
    });
    expect((option.yAxis as { data: string[] }).data).toEqual(['甲', 'b']);
    const series = option.series as { data: { value: number }[] }[];
    expect(series[0].data.map((item) => item.value)).toEqual([4, 2]);
  });
});

describe('调色板接入', () => {
  it('分类色来自传入的配色而不是硬编码', () => {
    const option = buildToolRankOption({
      tools: [{ tool_name: 'a', count: 1 }],
      palette,
    });
    const series = option.series as { itemStyle: { color: string } }[];
    expect(series[0].itemStyle.color).toBe(palette.series[0]);
  });

  it('分类数超过配色长度时循环取色', () => {
    const option = buildDistributionPieOption({
      distribution: { a: 4, b: 3, c: 2, d: 1 },
      name: 'x',
      palette,
    });
    const series = option?.series as { color: string[] }[];
    expect(series[0].color).toEqual([
      palette.series[0],
      palette.series[1],
      palette.series[2],
      palette.series[0],
    ]);
  });
});
