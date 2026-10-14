/**
 * 用户沙盒环境变量的查询与写入层。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { getAgentEnv, updateAgentEnv } from '../api/agent-env-api';
import type { AgentEnv } from '../api/agent-env-api';

/** 配置查询的 key。 */
export const AGENT_ENV_QUERY_KEY = ['agent-env'] as const;

export const useAgentEnv = (
  enabled: boolean,
): {
  env: AgentEnv | undefined;
  isLoading: boolean;
  refetch: () => void;
} => {
  const query = useQuery({
    queryKey: AGENT_ENV_QUERY_KEY,
    queryFn: getAgentEnv,
    enabled,
  });

  return {
    env: query.data,
    isLoading: query.isPending,
    refetch: () => void query.refetch(),
  };
};

/** 整体保存；成功后回写缓存（响应即保存后的状态）。 */
export const useUpdateAgentEnv = (): UseMutationResult<
  AgentEnv,
  Error,
  { env: Record<string, string> }
> => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: updateAgentEnv,
    onSuccess: (saved) => {
      client.setQueryData(AGENT_ENV_QUERY_KEY, saved);
    },
  });
};
