import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** MCP GET 会话端点（MVP 未实现） */

export const mcpGetNotSupportedMcpGet = (): Promise<unknown> => {
  return api.get(`/mcp`).then((res) => res.data);
};

export const mcpGetNotSupportedMcpGetQueryOptions = () => {
  return queryOptions({
    queryKey: ['mcp', 'mcp-get-not-supported-mcp-get'],
    queryFn: () => mcpGetNotSupportedMcpGet(),
  });
};

type UseMcpGetNotSupportedMcpGetOptions = {
  queryConfig?: QueryConfig<typeof mcpGetNotSupportedMcpGetQueryOptions>;
};

export const useMcpGetNotSupportedMcpGet = ({ queryConfig }: UseMcpGetNotSupportedMcpGetOptions = {}) => {
  return useQuery({
    ...mcpGetNotSupportedMcpGetQueryOptions(),
    ...queryConfig,
  });
};