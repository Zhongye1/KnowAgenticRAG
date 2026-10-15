/**
 * 模型清单的查询层。三类模型各一份缓存，60 秒内不重复取（供应商改动会刷新后端模型缓存，
 * 这里的 staleTime 与 `features/model-providers` 同口径）。
 */
import { useQuery } from '@tanstack/react-query';

import { listCatalogModels } from '../api/model-catalog-api';
import type { CatalogGroup, ModelType } from '../api/model-catalog-api';

export const modelCatalogQueryKey = (modelType: ModelType) =>
  ['model-catalog', modelType] as const;

export const useModelCatalog = (
  modelType: ModelType,
): { groups: CatalogGroup[]; isLoading: boolean } => {
  const query = useQuery({
    queryKey: modelCatalogQueryKey(modelType),
    queryFn: () => listCatalogModels(modelType),
    staleTime: 60_000,
  });

  return { groups: query.data ?? [], isLoading: query.isPending };
};
