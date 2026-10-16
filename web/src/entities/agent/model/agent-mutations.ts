/**
 * 智能体的写入层。
 *
 * 三个动作共用一份失效规则：任何写入都可能改动列表里的任意一条（名称、图标、共享范围），
 * 因此统一失效 `agentsListKey()` 下的两份列表，不做逐条改写。写入本身仍走 api 段：
 * 生成的 mutation 只省掉一次 `unwrap`，却要求每个调用点把实参改成 `{ body }` 形状，不划算。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import {
  agentsListKey,
  createAgent,
  removeAgent,
  updateAgent,
} from '../api/agents-api';
import type { AgentCreatePayload, AgentUpdatePayload } from '../api/agents-api';


const useInvalidateAgents = (): (() => void) => {
  const client = useQueryClient();

  return () => {
    void client.invalidateQueries({ queryKey: agentsListKey() });
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
