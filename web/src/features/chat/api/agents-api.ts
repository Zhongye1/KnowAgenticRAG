/**
 * 智能体列表与详情端点。
 *
 * 只走契约生成的 SDK。**两个端点在契约里都没有声明响应模型**（200 是空 schema），因此这里
 * 按不可信的 wire 数据做最小形状校验，而不是假定字段一定存在。
 */
import { unwrap } from '@/shared/api';
import {
  getAgentApiAgentAgentIdGet,
  listAgentsApiAgentGet,
} from '@/shared/api/generated/sdk.gen';

/** 未类型化的智能体条目；字段读取集中在 `lib/agent-options.ts`。 */
export type RawAgent = Record<string, unknown>;

/** 当前用户可见的智能体；形状不符时返回空数组。 */
export async function listAgents(): Promise<RawAgent[]> {
  const data = unwrap<{ agents?: unknown }>(await listAgentsApiAgentGet({}));
  const agents = (data as { agents?: unknown } | null)?.agents;

  return Array.isArray(agents) ? (agents as RawAgent[]) : [];
}

/**
 * 单个智能体的详情；`configurable_items` 与 `config_json` 只有这个端点下发。
 *
 * 路径参数在契约里叫 `agent_id`，**实际值是 slug**：后端把 `agent_id` 直接交给
 * `get_visible_by_slug`（`server/routers/agent_router.py` 的 `get_agent`），会话与请求下发的
 * 也一直是 `agentSlug`。因此这里收 slug，不做 id 翻译。
 */
export async function getAgentDetail(agentSlug: string): Promise<RawAgent> {
  const data = unwrap<{ agent?: unknown }>(
    await getAgentApiAgentAgentIdGet({ path: { agent_id: agentSlug } }),
  );
  const agent = (data as { agent?: unknown } | null)?.agent;

  return (agent ?? {}) as RawAgent;
}
