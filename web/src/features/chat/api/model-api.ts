/**
 * 对话页用到的模型列表。
 *
 * 与 `features/knowledge-base` 同做法：在自己的 api 段调契约生成物的 `/models/v2`，只取
 * `model_type: 'chat'`。响应没有声明模型，字段按不可信数据处理。
 */
import { unwrap } from '@/shared/api';
import { getV2ModelsApiSystemModelProvidersModelsV2Get } from '@/shared/api/generated/sdk.gen';

/** 一个可选模型；`spec` 是下发给后端的 `provider:model`。 */
export type ChatModelItem = {
  spec: string;
  label: string;
};

/** 按供应商分组后的模型；供应商名缺失时退到 id。 */
export type ChatModelGroup = {
  providerId: string;
  providerName: string;
  models: ChatModelItem[];
};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * 归一成分组列表：缺 `spec` 的模型丢掉，缺供应商名的退到 id，整组没有模型时不出现。
 */
export function normalizeChatModels(raw: unknown): ChatModelGroup[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [];

  const groups: ChatModelGroup[] = [];
  // 归一后可能出现同一个供应商 id（`provider_id` 与记录键指向同一家）或同一个 spec，
  // 它们会成为渲染时的重复 key，这里先去重
  const seenProviders = new Set<string>();

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;

    const group = value as Record<string, unknown>;
    const providerId = asText(group.provider_id) || asText(key);
    if (!providerId || seenProviders.has(providerId)) continue;

    const seenSpecs = new Set<string>();
    const models: ChatModelItem[] = [];

    for (const item of Array.isArray(group.models) ? group.models : []) {
      if (typeof item !== 'object' || item === null) continue;

      const model = item as Record<string, unknown>;
      const spec = asText(model.spec);
      if (!spec || seenSpecs.has(spec)) continue;

      seenSpecs.add(spec);
      models.push({
        spec,
        label: asText(model.display_name) || asText(model.model_id) || spec,
      });
    }

    if (!models.length) continue;

    seenProviders.add(providerId);
    groups.push({
      providerId,
      providerName: asText(group.provider_display_name) || providerId,
      models,
    });
  }

  return groups;
}

/** 可选的对话模型，按供应商分组。 */
export async function listChatModels(): Promise<ChatModelGroup[]> {
  const response = unwrap<{ data?: unknown }>(
    await getV2ModelsApiSystemModelProvidersModelsV2Get({
      query: { model_type: 'chat' },
    }),
  );

  return normalizeChatModels(response.data);
}
