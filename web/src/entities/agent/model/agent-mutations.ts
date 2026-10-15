/**
 * 智能体的写入层。
 *
 * 三个动作共用一份失效规则：任何写入都可能改动列表里的任意一条（名称、图标、共享范围），
 * 因此统一失效 `AGENTS_QUERY_ROOT` 下的两份列表，不做逐条改写。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { createAgent, removeAgent, updateAgent } from '../api/agents-api';
import type { AgentCreatePayload, AgentUpdatePayload } from '../api/agents-api';
import { AGENTS_QUERY_ROOT } from './agent-queries';

const useInvalidateAgents = (): (() => void) => {
  const client = useQueryClient();

  return () => {
    void client.invalidateQueries({ queryKey: AGENTS_QUERY_ROOT });
  };
};

export const useCreateAgent = (): UseMutationResult<
  unknown,
  Error,
  AgentCreatePayload
> => {
  const invalidate = useInvalidateAgents();

  return useMutation({
    mutationFn: (payload: AgentCreatePayload) => createAgent(payload),
    onSuccess: invalidate,
  });
};

export const useUpdateAgent = (): UseMutationResult<
  unknown,
  Error,
  { slug: string; payload: AgentUpdatePayload }
> => {
  const invalidate = useInvalidateAgents();

  return useMutation({
    mutationFn: ({
      slug,
      payload,
    }: {
      slug: string;
      payload: AgentUpdatePayload;
    }) => updateAgent(slug, payload),
    onSuccess: invalidate,
  });
};

export const useRemoveAgent = (): UseMutationResult<unknown, Error, string> => {
  const invalidate = useInvalidateAgents();

  return useMutation({
    mutationFn: (slug: string) => removeAgent(slug),
    onSuccess: invalidate,
  });
};
