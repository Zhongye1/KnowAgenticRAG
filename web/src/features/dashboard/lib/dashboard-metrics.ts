/**
 * 数据总览的指标档位。
 *
 * 界面用档位而不是直接比较数字：满意度 80/60、成功率 90/70 是产品口径。
 * 判定集中在 lib 段，组件只把档位映射成颜色类。
 */

/** 指标卡色调；与 `ui/metric-card.tsx` 的类名一一对应。 */
export type MetricTone =
  'primary' | 'success' | 'info' | 'warning' | 'accent' | 'neutral';

/** 表格内文字色调。 */
export type TextTone = 'success' | 'warning' | 'danger';

/**
 * 比率字段可能是数字也可能是字符串（后端有些字段是 `float`，序列化成 `100.0`）；
 * 缺失或不可解析时按 0，而不是把 `NaN` 带进比较。
 */
export const parseRate = (
  value: number | string | null | undefined,
): number => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

/** 满意度档位：≥80 正常、≥60 需注意、其余中性。 */
export const satisfactionTone = (
  value: number | string | null | undefined,
): MetricTone => {
  const rate = parseRate(value);
  if (rate >= 80) return 'success';
  if (rate >= 60) return 'warning';
  return 'neutral';
};

/** 工具成功率档位：≥90 正常、≥70 需注意、其余中性。 */
export const successRateTone = (
  value: number | string | null | undefined,
): MetricTone => {
  const rate = parseRate(value);
  if (rate >= 90) return 'success';
  if (rate >= 70) return 'warning';
  return 'neutral';
};

/** 智能体满意度文字档位：<60 用危险色。 */
export const satisfactionTextTone = (
  value: number | string | null | undefined,
): TextTone => {
  const rate = parseRate(value);
  if (rate >= 80) return 'success';
  if (rate >= 60) return 'warning';
  return 'danger';
};

/**
 * 指标卡数值色调：正常档不上色（默认文字色），需注意用警告色、偏低用危险色。
 * 只有「数值本身表达状态」的卡片才调用它，普通计数卡片保持中性，语义色不做装饰。
 */
export const metricValueTone = (tone: MetricTone): TextTone | undefined => {
  if (tone === 'warning') return 'warning';
  if (tone === 'neutral') return 'danger';
  return undefined;
};

/** 百分比展示：保留一位小数会掩盖整数满意度，因此整数不带小数位。 */
export const formatPercent = (
  value: number | string | null | undefined,
): string => {
  const rate = parseRate(value);
  return `${Number.isInteger(rate) ? rate : Number(rate.toFixed(1))}%`;
};
