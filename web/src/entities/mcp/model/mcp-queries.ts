/**
 * MCP 服务器的查询与写入层。
 *
 * query key 的唯一事实在这里：列表、单体与工具清单共用 `['mcp-servers']` 前缀，任何写入都失效
 * 整棵前缀（启停会改工具可用性，增删会改列表）。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import {
  createMcpServer,
  deleteMcpServer,
  getMcpServer,
  listMcpServerTools,
  listMcpServers,
  refreshMcpServerTools,
  setMcpServerEnabled,
  testMcpServer,
  toggleMcpServerTool,
  updateMcpServer,
} from '../api/mcp-api';
import type {
  McpServer,
  McpServerCreateInput,
  McpServerUpdateInput,
  McpTool,
} from '../api/mcp-api';

/** 列表 key；写入后按它失效所有派生查询。 */
export const MCP_SERVERS_QUERY_KEY = ['mcp-servers'] as const;

export const useMcpServers = (): {
  servers: McpServer[];
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
} => {
  const query = useQuery({
    queryKey: MCP_SERVERS_QUERY_KEY,
    queryFn: listMcpServers,
  });

  return {
    servers: query.data ?? [],
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
};

/** 单个 MCP 服务器；详情页用它，`slug` 为空时不发请求。 */
export const useMcpServer = (
  slug: string,
): {
  server: McpServer | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
} => {
  const query = useQuery({
    queryKey: [...MCP_SERVERS_QUERY_KEY, slug] as const,
    queryFn: () => getMcpServer(slug),
    enabled: Boolean(slug),
  });

  return {
    server: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: () => void query.refetch(),
  };
};

/** 某台服务器暴露的工具；详情页的「工具」tab 用它。 */
export const useMcpServerTools = (
  slug: string,
  enabled = true,
): {
  tools: McpTool[];
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
} => {
  const query = useQuery({
    queryKey: [...MCP_SERVERS_QUERY_KEY, slug, 'tools'] as const,
    queryFn: () => listMcpServerTools(slug),
    enabled: enabled && Boolean(slug),
  });

  return {
    tools: query.data ?? [],
    isLoading: query.isPending,
    error: query.error,
    refetch: () => void query.refetch(),
  };
};

const useInvalidateMcp = (): (() => void) => {
  const client = useQueryClient();

  return () => {
    void client.invalidateQueries({ queryKey: MCP_SERVERS_QUERY_KEY });
  };
};

/** 新建 MCP。 */
export const useCreateMcpServer = (): UseMutationResult<
  McpServer | null,
  Error,
  McpServerCreateInput
> => {
  const invalidate = useInvalidateMcp();

  return useMutation({ mutationFn: createMcpServer, onSuccess: invalidate });
};

/** 更新 MCP。 */
export const useUpdateMcpServer = (): UseMutationResult<
  McpServer | null,
  Error,
  { slug: string; input: McpServerUpdateInput }
> => {
  const invalidate = useInvalidateMcp();

  return useMutation({
    mutationFn: ({ slug, input }) => updateMcpServer(slug, input),
    onSuccess: invalidate,
  });
};

/** 删除 MCP。 */
export const useDeleteMcpServer = (): UseMutationResult<
  void,
  Error,
  string
> => {
  const invalidate = useInvalidateMcp();

  return useMutation({ mutationFn: deleteMcpServer, onSuccess: invalidate });
};

/** 启用/停用 MCP。 */
export const useSetMcpServerEnabled = (): UseMutationResult<
  { enabled: boolean; message: string },
  Error,
  { slug: string; enabled: boolean }
> => {
  const invalidate = useInvalidateMcp();

  return useMutation({
    mutationFn: ({ slug, enabled }) => setMcpServerEnabled(slug, enabled),
    onSuccess: invalidate,
  });
};

/** 测试连接；只读探活，不改缓存。 */
export const useTestMcpServer = (): UseMutationResult<
  { toolCount: number; message: string },
  Error,
  string
> => useMutation({ mutationFn: testMcpServer });

/** 刷新工具缓存；工具清单因此变化。 */
export const useRefreshMcpServerTools = (): UseMutationResult<
  { message: string },
  Error,
  string
> => {
  const invalidate = useInvalidateMcp();

  return useMutation({
    mutationFn: refreshMcpServerTools,
    onSuccess: invalidate,
  });
};

/** 启用/停用单个工具。 */
export const useToggleMcpServerTool = (): UseMutationResult<
  { enabled: boolean; message: string },
  Error,
  { slug: string; toolName: string }
> => {
  const invalidate = useInvalidateMcp();

  return useMutation({
    mutationFn: ({ slug, toolName }) => toggleMcpServerTool(slug, toolName),
    onSuccess: invalidate,
  });
};
