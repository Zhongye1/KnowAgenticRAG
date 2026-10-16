/**
 * 智能体端点。
 *
 * 只走契约生成的 SDK，响应形状直接复用 `openapi.json` 生成的类型：这些端点在契约里
 * 已声明响应模型，字段的必填性与可空性由后端声明，不再手写宽类型兜底。字段读取与归一
 * 仍在 `model/agent-types.ts`，那里继续按不可信数据逐项读取。
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
  AgentBackendItem,
  AgentBackendListResponse,
  AgentCreate,
  AgentItem,
  AgentItemResponse,
  AgentListResponse,
  AgentUpdate,
  UserImageUploadResponse,
} from '@/shared/api/generated/types.gen';

/** 新建智能体的请求体；契约里有 schema，直接沿用生成类型。 */
export type AgentCreatePayload = AgentCreate;
/** 更新智能体的请求体；契约里有 schema，直接沿用生成类型。 */
export type AgentUpdatePayload = AgentUpdate;

/**
 * 当前用户可见的智能体。
 *
 * `includeSubagents` 打开后连子智能体一起返回：管理面板要按「智能体 / 子智能体」分组，
 * 而对话页的候选列表不要它们（子智能体不是用户可切换的入口）。
 */
export async function listAgents(
  options: { includeSubagents?: boolean } = {},
): Promise<AgentItem[]> {
  const data = unwrap<AgentListResponse>(
    await listAgentsApiAgentGet({
      query: { include_subagents: options.includeSubagents ?? false },
    }),
  );

  return data.agents ?? [];
}

/** 可选的智能体后端。 */
export async function listAgentBackends(): Promise<AgentBackendItem[]> {
  const data = unwrap<AgentBackendListResponse>(
    await listAgentBackendsApiAgentBackendsGet({}),
  );

  return data.backends ?? [];
}

/**
 * 单个智能体的详情；`configurable_items` 与 `config_json` 只有这个端点下发。
 *
 * 路径参数在契约里叫 `agent_id`，**实际值是 slug**：后端把 `agent_id` 直接交给
 * `get_visible_by_slug`（`server/routers/agent_router.py` 的 `get_agent`），会话与请求下发的
 * 也一直是 `agentSlug`。因此这里收 slug，不做 id 翻译。
 *
 * 契约保证 `agent` 存在；`?? {}` 只兜底契约被破坏的情形，调用方按空配置继续。
 */
export async function getAgentDetail(agentSlug: string): Promise<AgentItem> {
  const data = unwrap<AgentItemResponse>(
    await getAgentApiAgentAgentIdGet({ path: { agent_id: agentSlug } }),
  );

  return (data.agent ?? {}) as AgentItem;
}

/** 新建智能体；返回创建后的那一条。 */
export async function createAgent(payload: AgentCreate): Promise<AgentItem> {
  const data = unwrap<AgentItemResponse>(
    await createAgentApiAgentPost({ body: payload }),
  );

  return (data.agent ?? {}) as AgentItem;
}

/** 更新智能体；路径参数同样是 slug。 */
export async function updateAgent(
  agentSlug: string,
  payload: AgentUpdate,
): Promise<AgentItem> {
  const data = unwrap<AgentItemResponse>(
    await updateAgentApiAgentAgentIdPut({
      path: { agent_id: agentSlug },
      body: payload,
    }),
  );

  return (data.agent ?? {}) as AgentItem;
}

/** 删除智能体；后端返回 `{success}`，失败会抛错。 */
export async function removeAgent(agentSlug: string): Promise<void> {
  unwrap<unknown>(
    await deleteAgentApiAgentAgentIdDelete({
      path: { agent_id: agentSlug },
    }),
  );
}

/** 上传智能体图标，返回可写进 `icon` 的 URL。 */
export async function uploadAgentIcon(file: File): Promise<string> {
  const data = unwrap<UserImageUploadResponse>(
    await uploadUserImageApiUserUploadImagePost({ body: { file } }),
  );
  const url = data?.image_url ?? data?.url;
  if (typeof url !== 'string' || !url) {
    throw new Error('图标上传失败：响应里没有图片地址');
  }

  return url;
}
