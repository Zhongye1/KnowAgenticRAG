/**
 * 知识导图的 React Query 装配。
 *
 * 差异检测只在已经有一张导图时才拉：没有导图时「是否需要更新」没有意义。
 * 生成成功后同时让导图与差异失效——后端会重算 `mindmap_file_ids`。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { mindmapApi } from '../api/mindmap-api';

export const mindmapKeys = {
  all: ['knowledge-mindmap'] as const,
  document: (kbId: string) => [...mindmapKeys.all, 'document', kbId] as const,
  diff: (kbId: string) => [...mindmapKeys.all, 'diff', kbId] as const,
};

/** 当前知识库的导图；没生成时后端返回 null。 */
export const useMindmap = (kbId: string, options: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: mindmapKeys.document(kbId),
    queryFn: () => mindmapApi.getDocument(kbId),
    enabled: options.enabled ?? true,
  });

/** 差异检测；调用方按「有没有导图」决定是否启用。 */
export const useMindmapDiff = (kbId: string, enabled: boolean) =>
  useQuery({
    queryKey: mindmapKeys.diff(kbId),
    queryFn: () => mindmapApi.getDiff(kbId),
    enabled,
  });

/** 生成 / 增量更新。 */
export const useGenerateMindmap = (kbId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      options: { incremental?: boolean; userPrompt?: string } = {},
    ) => mindmapApi.generate(kbId, options),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: mindmapKeys.document(kbId),
      });
      void queryClient.invalidateQueries({ queryKey: mindmapKeys.diff(kbId) });
    },
  });
};
