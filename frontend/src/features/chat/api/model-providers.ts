import { z } from 'zod';

import { api } from '@/lib/api-client';

/**
 * 可选 chat 模型列表（来源：GET /api/v1/system/model-providers，读操作仅需登录态）。
 *
 * 说明：该端点尚未纳入 generated 客户端覆盖范围，此处按后端 ModelProviderDetail
 * 契约做 zod 校验后手写封装；后续 regenerate:api 后可改为引用生成模块。
 */

const modelItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  display_name: z.string().nullish(),
});

const providerSchema = z.object({
  provider_id: z.string(),
  display_name: z.string(),
  capabilities: z.array(z.string()),
  is_enabled: z.boolean(),
  enabled_models: z.array(modelItemSchema).default([]),
});

export const chatModelOptionSchema = z.object({
  /** 模型 spec：provider_id:model_id（ChatParam.model） */
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  keywords: z.array(z.string()),
  /** 全部模型开放思考等级选择（是否生效取决于模型/服务端支持） */
  efforts: z.literal(true),
});

export type ChatModelOption = z.infer<typeof chatModelOptionSchema>;

const providerListSchema = z.array(providerSchema);

export const toChatModelOptions = (payload: unknown): ChatModelOption[] => {
  const providers = providerListSchema.catch([]).parse(payload ?? []);
  const options: ChatModelOption[] = [];
  for (const provider of providers) {
    if (!provider.is_enabled || !provider.capabilities.includes('chat')) continue;
    for (const model of provider.enabled_models) {
      if (model.type !== 'chat') continue;
      options.push({
        id: `${provider.provider_id}:${model.id}`,
        name: model.display_name || model.id,
        description: provider.display_name,
        keywords: [provider.display_name, provider.provider_id],
        efforts: true,
      });
    }
  }
  return options;
};

export const listChatModelOptions = async (): Promise<ChatModelOption[]> => {
  // axios 响应拦截器已剥掉一层 axios 包装，此处拿到 fba 统一信封
  const envelope = (await api.get('/api/v1/system/model-providers')) as {
    data?: unknown;
  };
  return toChatModelOptions(envelope?.data);
};
