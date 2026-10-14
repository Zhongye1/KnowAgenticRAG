/**
 * 智能体端点。
 *
 * 只走契约生成的 SDK。**列表、详情与后端列表在契约里都没有声明响应模型**（200 是空 schema），
 * 因此按不可信的 wire 数据做最小形状校验，字段读取集中在 `model/agent-types.ts`；写入的请求体
 * 契约里有 schema（`AgentCreate` / `AgentUpdate`），直接用生成类型。
 */
import { unwrap } from '@/shared/api';
import {
  createAgentApiAgentPost,
  deleteAgentApiAgentAgentIdDelete,
  getAgentApiAgentAgentIdGet,
  listAgentBackendsApiAgentBackendsGet,
  listAgentsApiAgentGet,
  updateAgentApiAgentAgentIdPut,
  uploadUserImageApiUserUploadImagePost,
} from '@/shared/api/generated/sdk.gen';
import type {
  AgentCreate,
  AgentUpdate,
} from '@/shared/api/generated/types.gen';

/** 新建智能体的请求体；契约里有 schema，直接沿用生成类型。 */
export type AgentCreatePayload = AgentCreate;
/** 更新智能体的请求体；契约里有 schema，直接沿用生成类型。 */
export type AgentUpdatePayload = AgentUpdate;

/** 未类型化的智能体条目。 */
export type RawAgent = Record<string, unknown>;

/** 未类型化的智能体后端条目。 */
export type RawAgentBackend = Record<string, unknown>;

/**
 * 当前用户可见的智能体；形状不符时返回空数组。
 *
 * `includeSubagents` 打开后连子智能体一起返回：管理面板要按「智能体 / 子智能体」分组，
 * 而对话页的候选列表不要它们（子智能体不是用户可切换的入口）。
 */
export async function listAgents(
  options: { includeSubagents?: boolean } = {},
): Promise<RawAgent[]> {
  const data = unwrap<{ agents?: unknown }>(
    await listAgentsApiAgentGet({
      query: { include_subagents: options.includeSubagents ?? false },
    }),
  );
  const agents = (data as { agents?: unknown } | null)?.agents;

  return Array.isArray(agents) ? (agents as RawAgent[]) : [];
}

/** 可选的智能体后端；形状不符时返回空数组。 */
export async function listAgentBackends(): Promise<RawAgentBackend[]> {
  const data = unwrap<{ backends?: unknown }>(
    await listAgentBackendsApiAgentBackendsGet({}),
  );
  const backends = (data as { backends?: unknown } | null)?.backends;

  return Array.isArray(backends) ? (backends as RawAgentBackend[]) : [];
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

/** 新建智能体；返回创建后的那一条。 */
export async function createAgent(payload: AgentCreate): Promise<RawAgent> {
  const data = unwrap<{ agent?: unknown }>(
    await createAgentApiAgentPost({ body: payload }),
  );

  return ((data as { agent?: unknown } | null)?.agent ?? {}) as RawAgent;
}

/** 更新智能体；路径参数同样是 slug。 */
export async function updateAgent(
  agentSlug: string,
  payload: AgentUpdate,
): Promise<RawAgent> {
  const data = unwrap<{ agent?: unknown }>(
    await updateAgentApiAgentAgentIdPut({
      path: { agent_id: agentSlug },
      body: payload,
    }),
  );

  return ((data as { agent?: unknown } | null)?.agent ?? {}) as RawAgent;
}

/** 删除智能体；后端返回 `{success}`，失败会抛错。 */
export async function removeAgent(agentSlug: string): Promise<void> {
  unwrap<unknown>(
    await deleteAgentApiAgentAgentIdDelete({
      path: { agent_id: agentSlug },
    }),
  );
}

/**
 * 上传智能体图标，返回可写进 `icon` 的 URL。
 *
 * 复用通用的用户图片上传端点（与参照同一条路径）。响应是自由 dict，读不到地址就显式抛错，
 * 不把空串写进 `icon`——那样卡片会渲染成一张裂图。
 */
export async function uploadAgentIcon(file: File): Promise<string> {
  const data = unwrap<Record<string, unknown>>(
    await uploadUserImageApiUserUploadImagePost({ body: { file } }),
  );
  const url = data?.image_url ?? data?.url;
  if (typeof url !== 'string' || !url) {
    throw new Error('图标上传失败：响应里没有图片地址');
  }

  return url;
}
