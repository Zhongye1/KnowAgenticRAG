import { queryOptions, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { QueryConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** MCP 工具静态目录（JSON Schema，按调用方权限过滤） */

export const mcpToolsCatalogMcpToolsGet = (): Promise<unknown> => {
  return api.get(`/mcp/tools`).then((res) => res.data);
};

export const mcpToolsCatalogMcpToolsGetQueryOptions = () => {
  return queryOptions({
    queryKey: ['mcp', 'mcp-tools-catalog-mcp-tools-get'],
    queryFn: () => mcpToolsCatalogMcpToolsGet(),
  });
};

type UseMcpToolsCatalogMcpToolsGetOptions = {
  queryConfig?: QueryConfig<typeof mcpToolsCatalogMcpToolsGetQueryOptions>;
};

export const useMcpToolsCatalogMcpToolsGet = ({ queryConfig }: UseMcpToolsCatalogMcpToolsGetOptions = {}) => {
  return useQuery({
    ...mcpToolsCatalogMcpToolsGetQueryOptions(),
    ...queryConfig,
  });
};