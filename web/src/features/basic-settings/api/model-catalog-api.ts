/**
 * 基本设置用到的模型清单。
 *
 * 与 `features/chat` 同做法：在自己的 api 段调契约生成物的 `/models/v2`，按 `model_type`
 * 分别取 chat / embedding / rerank。响应没有声明模型，字段按不可信数据处理。
 */
import { unwrap } from '@/shared/api';
import { getV2ModelsApiSystemModelProvidersModelsV2Get } from '@/shared/api/generated/sdk.gen';

/** 三类模型；与后端 `model_cache` 的 `model_type` 同集。 */
export type ModelType = 'chat' | 'embedding' | 'rerank';

export type CatalogModel = {
  /** 下发给后端的 `provider:model`。 */
  spec: string;
  label: string;
  /** 向量维度；只有 embedding 模型给出。 */
  dimension: number | null;
};

export type CatalogGroup = {
  providerId: string;
  providerName: string;
  models: CatalogModel[];
};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * 归一成分组列表：缺 `spec` 的模型丢掉、缺供应商名的退到 id、整组没有模型时不出现，
 * 同一个供应商 id 或同一个 spec 只保留一次（否则会成为渲染时的重复 key）。
 */
export function normalizeCatalog(raw: unknown): CatalogGroup[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [];

  const groups: CatalogGroup[] = [];
  const seenProviders = new Set<string>();

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;

    const group = value as Record<string, unknown>;
    const providerId = asText(group.provider_id) || asText(key);
    if (!providerId || seenProviders.has(providerId)) continue;

    const seenSpecs = new Set<string>();
    const models: CatalogModel[] = [];

    for (const item of Array.isArray(group.models) ? group.models : []) {
      if (typeof item !== 'object' || item === null) continue;

      const model = item as Record<string, unknown>;
      const spec = asText(model.spec);
      if (!spec || seenSpecs.has(spec)) continue;

      seenSpecs.add(spec);
      models.push({
        spec,
        label: asText(model.display_name) || asText(model.model_id) || spec,
        dimension: typeof model.dimension === 'number' ? model.dimension : null,
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

/** 某一类模型，按供应商分组。 */
export async function listCatalogModels(
  modelType: ModelType,
): Promise<CatalogGroup[]> {
  const response = unwrap<{ data?: unknown }>(
    await getV2ModelsApiSystemModelProvidersModelsV2Get({
      query: { model_type: modelType },
    }),
  );

  return normalizeCatalog(response.data);
}
