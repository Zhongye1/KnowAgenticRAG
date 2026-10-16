/**
 * 智能体查询层的 key 与归一。
 *
 * 试点把 query key 与 queryFn 交给契约生成物，这里守住两件不能回归的事：`useAgents`
 * 仍把响应体归一成领域对象（`select` 归 observer 层，直接调 `fetchQuery` 观察不到），
 * 以及失效用的生成 key 前缀命中 `includeSubagents` 的两份缓存、不波及无关 key。
 * 生成 key 会读客户端 baseUrl，模块顶层求值会固化错值，因此失效 key 从 `agentsListKey()` 取。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMock = vi.fn();

vi.mock('@/shared/api/generated/sdk.gen', () => ({
  listAgentsApiAgentGet: (...args: unknown[]) => listMock(...args),
}));

const { agentsListKey, agentsListOptions } = await import(
  '@/entities/agent/api/agents-api'
);
const { useAgents } = await import('@/entities/agent/model/agent-queries');

const rawAgent = {
  slug: 'chatbot',
  name: '智能助手',
  description: '默认助手',
  icon: null,
  backend_id: 'ChatbotAgent',
  is_builtin: true,
  is_subagent: false,
  can_manage: false,
  share_config: null,
};

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const wrapperFor = (client: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

/** 用生成 options 种一条列表缓存（`fetchQuery` 不套用 `select`，这里只关心 key）。 */
const seedListQuery = (includeSubagents: boolean) =>
  agentsListOptions(includeSubagents);

describe('智能体列表查询', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({ data: { agents: [rawAgent] } });
  });

  it('useAgents 把响应体归一成领域对象', async () => {
    const { result } = renderHook(() => useAgents(true), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.agents).toHaveLength(1));

    expect(result.current.agents[0]).toEqual({
      slug: 'chatbot',
      name: '智能助手',
      description: '默认助手',
      icon: '',
      backendId: 'ChatbotAgent',
      isBuiltin: true,
      isSubagent: false,
      canManage: false,
      shareConfig: null,
    });
  });

  it('写入后失效命中两份列表缓存，且不波及无关 key', async () => {
    const queryClient = makeClient();

    await queryClient.fetchQuery(seedListQuery(true));
    await queryClient.fetchQuery(seedListQuery(false));
    await queryClient.fetchQuery({
      queryKey: ['unrelated'],
      queryFn: async () => 1,
    });

    await queryClient.invalidateQueries({ queryKey: agentsListKey() });

    // 生成 key 的首元素是操作名，按它筛出该操作的全部缓存条目。
    const listInvalidated = queryClient
      .getQueryCache()
      .getAll()
      .filter(
        (query) =>
          (query.queryKey[0] as { _id?: string } | undefined)?._id ===
          'listAgentsApiAgentGet',
      )
      .map((query) => query.state.isInvalidated);

    expect(listInvalidated).toEqual([true, true]);
    expect(queryClient.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
  });
});
