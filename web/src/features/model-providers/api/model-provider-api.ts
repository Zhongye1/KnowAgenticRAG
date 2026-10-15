/**
 * 模型供应商接口。
 *
 * 契约在 `backend/server/routers/model_provider_router.py`：响应是 `{success, data}`，
 * 除 `/models/v2` 外都要求 admin，且端点没有 response schema，类型按
 * `ars/models/providers/service.py` 的校验与 `ModelProvider.to_dict()` 手写。
 *
 * 列表项在解包时把明文 `api_key` 折成 `has_api_key`：密钥不出 api 段，界面与断言都拿不到原文。
 */
import {
  createProviderApiSystemModelProvidersPost,
  deleteProviderApiSystemModelProvidersProviderIdDelete,
  getConfigApiSystemConfigGet,
  getModelStatusBySpecApiSystemModelProvidersModelsStatusGet,
  getRemoteModelsApiSystemModelProvidersProviderIdRemoteModelsGet,
  listProvidersApiSystemModelProvidersGet,
  updateProviderApiSystemModelProvidersProviderIdPut,
} from '@/shared/api/generated/sdk.gen';
import { unwrap } from '@/shared/api';

/** 后端 `VALID_MODEL_TYPES`。 */
export type ModelType = 'chat' | 'embedding' | 'rerank';

/** 供应商类型选项；与后端 `VALID_PROVIDER_TYPES` 同集合。 */
export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'openrouter';

/** 供应商下已启用的模型配置；字段对应 `enabled_models` 的规范化结果。 */
export type EnabledModel = {
  id: string;
  display_name?: string;
  type: ModelType;
  source?: 'manual' | 'remote';
  enabled?: boolean;
  protocol_override?: string | null;
  base_url_override?: string | null;
  request_body_overrides?: Record<string, unknown>;
  context_length?: number | null;
  dimension?: number | null;
  batch_size?: number | null;
  supported_parameters?: string[];
  extra?: Record<string, unknown>;
};

/** 远端候选模型；字段来自 `_normalize_remote_model` 的规范化结果。 */
export type RemoteModel = {
  id: string;
  display_name?: string;
  type: ModelType;
  description?: string | null;
  context_length?: number | null;
  input_modalities?: string[];
  output_modalities?: string[];
  supported_parameters?: string[];
  pricing?: Record<string, unknown>;
};

/** 供应商列表项；`api_key` 已被换成 `has_api_key`。 */
export type ModelProvider = {
  provider_id: string;
  display_name: string;
  provider_type: ProviderType;
  default_protocol?: string | null;
  base_url: string;
  embedding_base_url?: string | null;
  rerank_base_url?: string | null;
  models_endpoint?: string | null;
  embedding_models_endpoint?: string | null;
  rerank_models_endpoint?: string | null;
  api_key_env?: string | null;
  has_api_key: boolean;
  capabilities: ModelType[];
  enabled_models: EnabledModel[];
  headers_json?: Record<string, unknown> | null;
  extra_json?: Record<string, unknown> | null;
  is_enabled: boolean;
  is_builtin: boolean;
  /** 后端判定的凭证状态：启用的供应商既没有直接密钥、也没有可用环境变量时为 warning。 */
  credential_status: 'ok' | 'warning';
};

/** 写入体；未包含的字段后端保持原值（`PUT` 只应用请求里出现的字段）。 */
export type ProviderPayload = {
  provider_id?: string;
  display_name?: string;
  provider_type?: ProviderType;
  base_url?: string;
  embedding_base_url?: string | null;
  rerank_base_url?: string | null;
  models_endpoint?: string | null;
  embedding_models_endpoint?: string | null;
  rerank_models_endpoint?: string | null;
  api_key_env?: string | null;
  /** 缺省＝不改动；显式 `null` 才会清空已配置的直接密钥。 */
  api_key?: string | null;
  capabilities?: ModelType[];
  is_enabled?: boolean;
  headers_json?: Record<string, unknown>;
  extra_json?: Record<string, unknown>;
  enabled_models?: EnabledModel[];
};

/** 连通性检查结果；`status` 只有 available / unavailable / error 三种取值。 */
export type ModelStatus = {
  spec: string;
  status: 'available' | 'unavailable' | 'error';
  message?: string;
};

type ProviderResponse = { success: boolean; data?: Record<string, unknown> };
type ListResponse = { success: boolean; data?: Record<string, unknown>[] };
type StatusResponse = { success: boolean; data?: Record<string, unknown> };

/** 把后端投影折成列表项；密钥原文只在这里出现一次，随即丢弃。 */
const toProvider = (raw: Record<string, unknown>): ModelProvider => {
  const { api_key: apiKey, ...rest } = raw;
  return {
    ...(rest as unknown as Omit<ModelProvider, 'has_api_key'>),
    has_api_key: typeof apiKey === 'string' && apiKey.length > 0,
  };
};

export const modelProviderApi = {
  /** 全部供应商配置（含已停用）。 */
  async listProviders(): Promise<ModelProvider[]> {
    const result = unwrap<ListResponse>(
      await listProvidersApiSystemModelProvidersGet(),
    );
    return (result.data ?? []).map(toProvider);
  },

  /** 新建供应商；`provider_id` 重复时后端返回 400。 */
  async createProvider(payload: ProviderPayload): Promise<void> {
    const result = unwrap<ProviderResponse>(
      await createProviderApiSystemModelProvidersPost({
        body: payload as never,
      }),
    );
    if (!result.success) throw new Error('创建供应商失败');
  },

  /** 局部更新：未出现的字段保持原值，显式 `null` 才清空。 */
  async updateProvider(
    providerId: string,
    payload: ProviderPayload,
  ): Promise<void> {
    const result = unwrap<ProviderResponse>(
      await updateProviderApiSystemModelProvidersProviderIdPut({
        path: { provider_id: providerId },
        body: payload as never,
      }),
    );
    if (!result.success) throw new Error('保存供应商失败');
  },

  /** 删除供应商；内置供应商后端也允许删除（面板按默认模型保护拦截）。 */
  async deleteProvider(providerId: string): Promise<void> {
    await unwrap<ProviderResponse>(
      await deleteProviderApiSystemModelProvidersProviderIdDelete({
        path: { provider_id: providerId },
      }),
    );
  },

  /** 实时拉取远端 `/models`，不落库；远端 401 会被后端折成 502。 */
  async fetchRemoteModels(providerId: string): Promise<RemoteModel[]> {
    const result = unwrap<ListResponse>(
      await getRemoteModelsApiSystemModelProvidersProviderIdRemoteModelsGet({
        path: { provider_id: providerId },
      }),
    );
    return (result.data ?? []) as unknown as RemoteModel[];
  },

  /** 连通性检查；后端即使内部失败也返回 200 + `success:false`，两条路都折成异常。 */
  async testModelStatus(spec: string): Promise<ModelStatus> {
    const result = unwrap<StatusResponse>(
      await getModelStatusBySpecApiSystemModelProvidersModelsStatusGet({
        query: { spec },
      }),
    );
    if (!result.success || !result.data) {
      throw new Error(`模型检查失败：${spec}`);
    }
    return result.data as unknown as ModelStatus;
  },

  /**
   * 当前默认模型 spec（`provider_id:model_id`）。
   *
   * 来源是系统配置的 `default_model`（任何登录用户可读）。面板用它拦「删除或停用
   * 正在被默认模型使用的供应商」——后端没有这条守卫，前端拦不住时也只能如实报告。
   */
  async getDefaultModelSpec(): Promise<string> {
    const config = unwrap<Record<string, unknown>>(
      await getConfigApiSystemConfigGet(),
    );
    const spec = config.default_model;
    return typeof spec === 'string' ? spec : '';
  },
};
