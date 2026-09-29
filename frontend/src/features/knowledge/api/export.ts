import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createExport } from '@/generated/knowledge_bases/create-export';
import { getExport } from '@/generated/knowledge_bases/get-export';
import { listExports } from '@/generated/knowledge_bases/list-exports';
import { MutationConfig } from '@/lib/react-query';
import type { ExportItem } from '@/generated/types';

/**
 * 整库导出 API 层（kb 落地改造清单 §9.2）。
 *
 * 后端是**异步打包**（大库同步打包必然超时），故这里是「发起 → 轮询状态 → 取预签名 URL」
 * 三步。产物在对象存储，`url` 只在 `status=success` 时有值。
 */

export const EXPORT_QUERY_KEY = ['knowledge_bases', 'export'] as const;

/** 打包是重 IO，2s 一次足够；到终态即停。 */
const EXPORT_POLL_MS = 2000;

export const isExportTerminal = (status?: string) =>
  status === 'success' || status === 'failed';

export const useKbExport = ({
  kbName,
  exportId,
  enabled = true,
}: {
  kbName: string;
  exportId: string | null;
  enabled?: boolean;
}) => {
  return useQuery<ExportItem>({
    queryKey: [...EXPORT_QUERY_KEY, kbName, exportId],
    queryFn: () => getExport({ kb_name: kbName, export_id: exportId ?? '' }),
    enabled: enabled && Boolean(kbName) && Boolean(exportId),
    refetchInterval: (query) =>
      isExportTerminal(query.state.data?.status) ? false : EXPORT_POLL_MS,
  });
};

export const useKbExports = (kbName: string) => {
  return useQuery<ExportItem[]>({
    queryKey: [...EXPORT_QUERY_KEY, kbName, 'list'],
    queryFn: () => listExports({ kb_name: kbName, limit: 10 }),
    enabled: Boolean(kbName),
  });
};

export const useCreateKbExport = ({
  mutationConfig,
}: {
  mutationConfig?: MutationConfig<typeof createExport>;
} = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createExport,
    ...mutationConfig,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: EXPORT_QUERY_KEY });
      mutationConfig?.onSuccess?.(...args);
    },
  });
};
