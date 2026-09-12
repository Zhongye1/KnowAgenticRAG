import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { MutationConfig } from '@/lib/react-query';

/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */

/** MCP Streamable HTTP 端点（JSON-RPC 2.0） */

export const mcpJsonrpcEndpointMcpPost = (): Promise<unknown> => {
  return api.post(`/mcp`).then((res) => res.data);
};

type UseMcpJsonrpcEndpointMcpPostOptions = {
  mutationConfig?: MutationConfig<typeof mcpJsonrpcEndpointMcpPost>;
};

export const useMcpJsonrpcEndpointMcpPost = ({ mutationConfig }: UseMcpJsonrpcEndpointMcpPostOptions = {}) => {
  return useMutation({
    mutationFn: mcpJsonrpcEndpointMcpPost,
    ...mutationConfig,
  });
};