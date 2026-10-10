/**
 * 图谱抽取配置的纯逻辑：表单默认值/回填、模型参数 JSON 解析、提交体组装与校验。
 *
 * 表单默认值与回填、模型参数 JSON 解析、提交体组装三段。
 *
 * 回填只认已锁定的配置，模型必须由用户在弹窗里选（没有全局默认模型可兜底）；提交前先校验
 * 模型是否为空，避免把后端的 400「LLM 抽取器需要 model_spec」当成提示。
 */
import type { GraphBuildConfig, GraphExtractorOptions } from '../api/graph-api';

export type GraphConfigForm = {
  extractorType: string;
  modelSpec: string;
  schema: string;
  concurrencyCount: number;
  modelParamsText: string;
};

/** 默认并发 50；后端允许 1..1000。 */
export const DEFAULT_CONCURRENCY = 50;

export const MIN_CONCURRENCY = 1;

export const MAX_CONCURRENCY = 1000;

export const DEFAULT_GRAPH_CONFIG_FORM: GraphConfigForm = {
  extractorType: 'llm',
  modelSpec: '',
  schema: '',
  concurrencyCount: DEFAULT_CONCURRENCY,
  modelParamsText: '',
};

/** 抽取器卡片；只有 LLM 可用，「更多」是占位。 */
export const EXTRACTOR_TYPE_OPTIONS = [
  {
    value: 'llm',
    label: 'LLM',
    description: '使用大模型按 Schema 抽取实体和关系',
    helper: '当前唯一支持的图谱抽取方式',
    disabled: false,
  },
  {
    value: 'more',
    label: '更多',
    description: '更多抽取方式正在拓展中',
    helper: '拓展中',
    disabled: true,
  },
] as const;

/** 回填表单：模型、Schema、并发数与模型参数取自已锁定的配置。 */
export const fillGraphConfigForm = (
  config?: GraphBuildConfig | null,
): GraphConfigForm => {
  const options = config?.extractor_options ?? {};
  return {
    extractorType: 'llm',
    modelSpec: options.model_spec ?? '',
    schema: options.schema ?? '',
    concurrencyCount: Number(options.concurrency_count || DEFAULT_CONCURRENCY),
    modelParamsText: options.model_params
      ? JSON.stringify(options.model_params)
      : '',
  };
};

export type ParseResult =
  { ok: true; value: Record<string, unknown> } | { ok: false; message: string };

/** 模型参数：空文本视为没有参数；必须是 JSON 对象，数组与原始值都不行。 */
export const parseModelParams = (text: string): ParseResult => {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, message: '模型参数必须是合法 JSON 对象。' };
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    return { ok: false, message: '模型参数必须是 JSON 对象。' };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
};

/** 提交前的校验；通过时返回 null。 */
export const validateGraphConfig = (form: GraphConfigForm): string | null => {
  if (!form.extractorType.trim()) return '请选择抽取器类型。';
  if (!form.modelSpec.trim()) return '请选择抽取模型。';
  if (!Number.isFinite(form.concurrencyCount)) return '并发数必须是数字。';
  if (
    form.concurrencyCount < MIN_CONCURRENCY ||
    form.concurrencyCount > MAX_CONCURRENCY
  ) {
    return `并发数需要在 ${MIN_CONCURRENCY} 到 ${MAX_CONCURRENCY} 之间。`;
  }
  const params = parseModelParams(form.modelParamsText);
  return params.ok ? null : params.message;
};

/**
 * 组装提交体；调用前先过 `validateGraphConfig`（模型参数已确认可解析）。
 */
export const buildExtractorOptions = (
  form: GraphConfigForm,
): GraphExtractorOptions => {
  const params = parseModelParams(form.modelParamsText);
  return {
    model_spec: form.modelSpec.trim(),
    schema: form.schema.trim(),
    concurrency_count: form.concurrencyCount || DEFAULT_CONCURRENCY,
    model_params: params.ok ? params.value : {},
  };
};
