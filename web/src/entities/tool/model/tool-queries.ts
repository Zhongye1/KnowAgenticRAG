/**
 * 工具清单的查询层。工具由代码注册，运行期不会变，因此给较长的 staleTime。
 */
import { useQuery } from '@tanstack/react-query';

import { listTools } from '../api/tool-api';
import type { Tool } from '../api/tool-api';

export const TOOLS_QUERY_KEY = ['tools'] as const;

export const useTools = (): {
  tools: Tool[];
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
} => {
  const query = useQuery({
    queryKey: TOOLS_QUERY_KEY,
    queryFn: listTools,
    staleTime: 5 * 60_000,
  });

  return {
    tools: query.data ?? [],
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
};
