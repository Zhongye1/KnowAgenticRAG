/**
 * 模型供应商面板的纯逻辑（分组、排序、表单折算、JSON 文本与模型元信息格式化）。
 *
 * ui 段只做渲染与接线，判定集中在这里，便于用变异验证。
 */
import type {
  EnabledModel,
  ModelProvider,
  ModelStatus,
  ModelType,
  ProviderPayload,
  ProviderType,
  RemoteModel,
} from '../api/model-provider-api';

/** 供应商类型选项，与后端白名单同集合。 */
export const PROVIDER_TYPE_OPTIONS: { value: ProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI Completions API' },
  { value: 'anthropic', label: 'Anthropic Messages API' },
  { value: 'gemini', label: 'Google Gemini API' },
  { value: 'openrouter', label: 'OpenRouter（OpenAI 兼容）' },
];

/** 能力勾选项，与后端 `VALID_MODEL_TYPES` 同集合。 */
export const CAPABILITY_OPTIONS: ModelType[] = ['chat', 'embedding', 'rerank'];

/** 人民币换算汇率；固定 7，不拉实时汇率。 */
export const USD_TO_CNY_RATE = 7;

/** 供应商编辑表单；密钥字段持有的是「本次要写入的值」，编辑态初始为空。 */
export type ProviderForm = {
  provider_id: string;
  display_name: string;
  provider_type: ProviderType;
  base_url: string;
  embedding_base_url: string;
  rerank_base_url: string;
  models_endpoint: string;
  embedding_models_endpoint: string;
  rerank_models_endpoint: string;
  api_key_env: string;
  api_key: string;
  /** 勾选后显式下发 `api_key: null` 清空已配置的直接密钥（后端只认显式 null）。 */
  clear_api_key: boolean;
  capabilities: ModelType[];
  is_enabled: boolean;
  headers_text: string;
  extra_text: string;
};

/** 模型配置表单；`request_body_overrides_text` 是 JSON 文本。 */
export type ModelForm = {
  id: string;
  display_name: string;
  type: ModelType;
  source: 'manual' | 'remote';
  protocol_override: string;
  base_url_override: string;
  request_body_overrides_text: string;
  dimension: number | null;
  batch_size: number | null;
};

/** 新增供应商的初始表单。 */
export const emptyProviderForm = (): ProviderForm => ({
  provider_id: '',
  display_name: '',
  provider_type: 'openai',
  base_url: '',
  embedding_base_url: '',
  rerank_base_url: '',
  models_endpoint: '/models',
  embedding_models_endpoint: '/embeddings/models',
  rerank_models_endpoint: '',
  api_key_env: '',
  api_key: '',
  clear_api_key: false,
  capabilities: ['chat'],
  is_enabled: true,
  headers_text: '{}',
  extra_text: '{}',
});

/** 供应商编辑表单。密钥不回显：`api_key` 留空表示不改动已配置的密钥。 */
export const providerFormValue = (provider: ModelProvider): ProviderForm => ({
  provider_id: provider.provider_id,
  display_name: provider.display_name,
  provider_type: provider.provider_type ?? 'openai',
  base_url: provider.base_url ?? '',
  embedding_base_url: provider.embedding_base_url ?? '',
  rerank_base_url: provider.rerank_base_url ?? '',
  models_endpoint: provider.models_endpoint ?? '',
  embedding_models_endpoint: provider.embedding_models_endpoint ?? '',
  rerank_models_endpoint: provider.rerank_models_endpoint ?? '',
  api_key_env: provider.api_key_env ?? '',
  api_key: '',
  clear_api_key: false,
  capabilities: provider.capabilities.length ? provider.capabilities : ['chat'],
  is_enabled: provider.is_enabled !== false,
  headers_text: formatJsonObject(provider.headers_json),
  extra_text: formatJsonObject(provider.extra_json),
});

/** 空 JSON 对象文本。 */
export const formatJsonObject = (value: unknown): string =>
  JSON.stringify(value && typeof value === 'object' ? value : {}, null, 2);

/**
 * 解析 JSON 对象文本；非法 JSON 与非对象都抛出带标签的中文原因。
 */
export const parseJsonObject = (
  text: string,
  label: string,
): Record<string, unknown> => {
  if (text.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const reason =
      error instanceof Error && error.message ? `：${error.message}` : '';
    throw new Error(`${label} 格式不正确${reason}`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return parsed as Record<string, unknown>;
};

/**
 * 组装写入体。
 *
 * 密钥留空时不带 `api_key` 字段：后端只应用请求里出现的字段，因此留空保留已配置密钥，
 * 显式 `null` 才会清空；也不下发 `default_protocol`，避免把表单不编辑的字段清掉。
 */
export const buildProviderPayload = (form: ProviderForm): ProviderPayload => {
  const payload: ProviderPayload = {
    display_name: form.display_name,
    provider_type: form.provider_type,
    base_url: form.base_url,
    embedding_base_url: form.embedding_base_url || null,
    rerank_base_url: form.rerank_base_url || null,
    models_endpoint: form.models_endpoint || null,
    embedding_models_endpoint: form.embedding_models_endpoint || null,
    rerank_models_endpoint: form.rerank_models_endpoint || null,
    api_key_env: form.api_key_env || null,
    capabilities: form.capabilities,
    is_enabled: form.is_enabled,
    headers_json: parseJsonObject(form.headers_text, '请求头'),
    extra_json: parseJsonObject(form.extra_text, '扩展配置'),
  };
  if (form.clear_api_key) payload.api_key = null;
  else if (form.api_key) payload.api_key = form.api_key;
  return payload;
};

/** 构造 `provider_id:model_id` spec。 */
export const buildModelSpec = (providerId: string, modelId: string): string =>
  `${providerId}:${modelId}`;

/** 默认模型 spec 里的供应商 id；没有冒号或冒号在首位时视为无。 */
export const defaultModelProviderId = (spec: string): string => {
  const index = spec.indexOf(':');
  return index > 0 ? spec.slice(0, index) : '';
};

/** 该供应商是否被当前默认模型使用。 */
export const providerHasDefaultModel = (
  spec: string,
  providerId: string,
): boolean => defaultModelProviderId(spec) === providerId;

/** 该供应商下的某个模型是否是当前默认模型。 */
export const isDefaultModel = (
  spec: string,
  providerId: string,
  modelId: string,
): boolean => spec === buildModelSpec(providerId, modelId);

/**
 * 搜索 + 排序：关键字匹配 provider_id 或展示名；都启用时凭证缺失的排后面，
 * 其余按 provider_id 升序。
 */
export const filterProviders = (
  providers: ModelProvider[],
  keyword: string,
): ModelProvider[] => {
  const trimmed = keyword.trim().toLowerCase();
  const filtered = trimmed
    ? providers.filter(
        (provider) =>
          provider.provider_id.toLowerCase().includes(trimmed) ||
          provider.display_name.toLowerCase().includes(trimmed),
      )
    : providers;
  return [...filtered].sort((a, b) => {
    if (
      a.is_enabled &&
      b.is_enabled &&
      a.credential_status !== b.credential_status
    ) {
      return a.credential_status === 'warning' ? 1 : -1;
    }
    return a.provider_id.localeCompare(b.provider_id);
  });
};

/** 按启用状态分组。 */
export const splitProviders = (
  providers: ModelProvider[],
): { enabled: ModelProvider[]; disabled: ModelProvider[] } => ({
  enabled: providers.filter((provider) => provider.is_enabled),
  disabled: providers.filter((provider) => !provider.is_enabled),
});

/** 头部统计：总数、已启用、已启用但凭证缺失、已启用模型数。 */
export const providerStats = (
  providers: ModelProvider[],
): { total: number; enabled: number; warning: number; models: number } => {
  let enabled = 0;
  let warning = 0;
  let models = 0;
  for (const provider of providers) {
    if (provider.is_enabled) {
      enabled += 1;
      if (provider.credential_status === 'warning') warning += 1;
    }
    models += provider.enabled_models.length;
  }
  return { total: providers.length, enabled, warning, models };
};

/** 凭证缺失提示；后端只对启用的供应商判 warning。 */
export const hasCredentialWarning = (provider: ModelProvider): boolean =>
  provider.credential_status === 'warning';

/** 卡片上的信息行。 */
export const providerInfoRows = (
  provider: ModelProvider,
): { label: string; value: string }[] => [
  { label: 'Base URL', value: provider.base_url || '-' },
  {
    label: '能力',
    value: provider.capabilities.length
      ? provider.capabilities.join(', ')
      : 'chat',
  },
];

/** 模型展示名；远端模型用 `display_name`。 */
export const modelDisplayName = (model: {
  id: string;
  display_name?: string;
}): string => model.display_name || model.id;

/** 已启用模型列表里的模型类型下拉项：受供应商能力约束。 */
export const editingModelTypeOptions = (
  capabilities: ModelType[],
): ModelType[] =>
  capabilities.length ? capabilities : [...CAPABILITY_OPTIONS];

/** 编辑已有模型时的表单值。 */
export const modelFormValue = (model: EnabledModel): ModelForm => ({
  id: model.id,
  display_name: model.display_name ?? '',
  type: model.type,
  source: model.source ?? 'remote',
  protocol_override: model.protocol_override ?? '',
  base_url_override: model.base_url_override ?? '',
  request_body_overrides_text: formatJsonObject(model.request_body_overrides),
  dimension: model.dimension ?? null,
  batch_size: model.batch_size ?? null,
});

/** 手动添加模型的初始表单：类型取供应商能力的首项，来源标 manual。 */
export const emptyModelForm = (provider: ModelProvider): ModelForm => ({
  id: '',
  display_name: '',
  type: editingModelTypeOptions(provider.capabilities)[0],
  source: 'manual',
  protocol_override: '',
  base_url_override: '',
  request_body_overrides_text: '{}',
  dimension: null,
  batch_size: null,
});

/**
 * 组装模型配置对象；请求参数按 JSON 对象解析，空覆盖写成空对象。
 *
 * `base` 是编辑前的原对象：编辑路径必须带上它，否则整对象替换会丢掉表单不编辑的字段
 * （`context_length`、`supported_parameters`、`extra`）并把 `enabled` 强制成 true。
 */
export const buildModelPayload = (
  form: ModelForm,
  base?: EnabledModel,
): EnabledModel => ({
  ...base,
  id: form.id.trim(),
  display_name: form.display_name.trim() || form.id.trim(),
  type: form.type,
  source: form.source,
  enabled: base?.enabled ?? true,
  protocol_override: form.protocol_override || null,
  base_url_override: form.base_url_override || null,
  request_body_overrides: parseJsonObject(
    form.request_body_overrides_text,
    '模型请求参数',
  ),
  dimension: form.dimension,
  batch_size: form.batch_size,
});

/**
 * 把远端候选折成已启用模型。
 *
 * 后端 `_normalize_model_item` 用 `dict(model)` 保留未知字段，因此远端清单里的
 * `context_length` 与 `supported_parameters` 要一起落库——否则面板的「上下文」列永远为空，
 * 编辑模型时也会把这份元信息抹掉。价格与模态是展示用的富信息，不持久化。
 */
export const remoteToEnabledModel = (model: RemoteModel): EnabledModel => ({
  id: model.id,
  display_name: model.display_name || model.id,
  type: model.type,
  source: 'remote',
  enabled: true,
  protocol_override: null,
  base_url_override: null,
  request_body_overrides: {},
  context_length: model.context_length ?? null,
  supported_parameters: model.supported_parameters ?? [],
  dimension: null,
  batch_size: null,
});

/**
 * 陈旧模型：远端清单拉过之后，来源是 remote 的已启用模型已不在远端清单里。
 * 手动添加的模型不参与判定。
 */
export const isModelStale = (
  model: EnabledModel,
  providerId: string,
  remoteIds: Record<string, string[]>,
  remoteLoaded: Record<string, boolean>,
): boolean => {
  if (model.source === 'manual') return false;
  if (!remoteLoaded[providerId]) return false;
  // 只有明确 enabled 的模型才判陈旧：没有该键的历史/内置模型不算
  return (
    Boolean(model.enabled) && !(remoteIds[providerId] ?? []).includes(model.id)
  );
};

/** 远端候选的类型计数，供筛选按钮显示数量。 */
export const remoteTypeCounts = (
  models: RemoteModel[],
): { all: number; chat: number; embedding: number; rerank: number } => {
  const counts = { all: models.length, chat: 0, embedding: 0, rerank: 0 };
  for (const model of models) {
    const type = model.type || 'chat';
    if (type === 'chat' || type === 'embedding' || type === 'rerank')
      counts[type] += 1;
  }
  return counts;
};

/** 远端候选的搜索与类型筛选。 */
export const filterRemoteModels = (
  models: RemoteModel[],
  keyword: string,
  type: ModelType | 'all',
): RemoteModel[] => {
  const trimmed = keyword.trim().toLowerCase();
  return models.filter((model) => {
    if (type !== 'all' && (model.type || 'chat') !== type) return false;
    return !trimmed || model.id.toLowerCase().includes(trimmed);
  });
};

/** 模态标签；后端只回 modalities 字符串，标签与图标由界面映射。 */
export const modelInputModalities = (model: RemoteModel): string[] =>
  model.input_modalities ?? [];

/** token 数量格式化：1M / 128K / 原值。 */
export const formatTokenCount = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  if (value >= 1_000_000)
    return `${trimTrailingZeros((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
};

const trimTrailingZeros = (value: string): string =>
  value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');

/**
 * 远端价格归一：每百万 token 的美元价。
 * 远端缺价时显示 N/A，不引入外部模型目录。
 */
export const normalizeRemotePrice = (
  pricing: Record<string, unknown> | undefined,
): { input: number; output: number } | null => {
  if (!pricing || typeof pricing !== 'object') return null;
  const read = (value: unknown): number => {
    const parsed =
      typeof value === 'string' ? Number.parseFloat(value) : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
  };
  const input = read(pricing.prompt ?? pricing.prompt_price ?? pricing.input);
  const output = read(
    pricing.completion ?? pricing.completion_price ?? pricing.output,
  );
  if (Number.isNaN(input) || Number.isNaN(output)) return null;
  return { input: input * 1_000_000, output: output * 1_000_000 };
};

const formatPrice = (value: number): string => {
  const precision = value < 0.01 ? 4 : value < 1 ? 3 : 2;
  return trimTrailingZeros(value.toFixed(precision));
};

/** 价格展示：`$x / $y` 或 `¥x / ¥y`（按固定汇率换算）。 */
export const formatPriceDisplay = (
  price: { input: number; output: number } | null,
  currency: 'USD' | 'CNY',
): string => {
  if (!price) return '';
  const rate = currency === 'CNY' ? USD_TO_CNY_RATE : 1;
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${symbol}${formatPrice(price.input * rate)} / ${symbol}${formatPrice(price.output * rate)}`;
};

/**
 * 取消能力后仍被已启用模型使用的能力项。
 *
 * 后端只在同一次请求同时带 `capabilities` 与 `enabled_models` 时校验，模型缓存也不按
 * capabilities 过滤，因此不一致会让「能力」与实际可调用的模型对不上。这里先拦一次。
 */
export const capabilityConflicts = (
  capabilities: ModelType[],
  models: EnabledModel[],
): ModelType[] =>
  CAPABILITY_OPTIONS.filter((item) => !capabilities.includes(item)).filter(
    (item) => models.some((model) => model.type === item),
  );

/** 连通性检查结果的一句话说明。 */
export const modelStatusText = (status: ModelStatus | undefined): string => {
  if (!status) return '测试连接';
  const label =
    { available: '可用', unavailable: '不可用', error: '错误' }[
      status.status
    ] ?? '未知';
  return `${label}: ${status.message || '无详细信息'}`;
};
