/**
 * 智能体端点。
 *
 * 只走契约生成的 SDK，响应形状直接复用 `openapi.json` 生成的类型：这些端点在契约里
 * 已声明响应模型，字段的必填性与可空性由后端声明，不再手写宽类型兜底。字段的读取与归一
 * 仍在 `model/agent-types.ts`。
 *
 * 列表读取以「契约生成的查询 options」形式对外：query key 与 queryFn 都来自生成物，参数与
 * 缓存条目因此不会漂移。生成物的接触点必须留在 api 段（`arch:check` 的 `generated-import-boundary`），
 * 因此 `model/` 只消费这里导出的 options 与 key，不直接引用生成物。
 */
import { unwrap } from '@/shared/api';
import {
  listAgentBackendsApiAgentBackendsGetOptions,
  listAgentsApiAgentGetOptions,
  listAgentsApiAgentGetQueryKey,
} from '@/shared/api/generated/@tanstack/react-query.gen';
import {
  createAgentApiAgentPost,
  deleteAgentApiAgentAgentIdDelete,
  getAgentApiAgentAgentIdGet,
  updateAgentApiAgentAgentIdPut,
  uploadUserImageApiUserUploadImagePost,
} from '@/shared/api/generated/sdk.gen';
import type {
  AgentCreate,
  AgentItem,
  AgentItemResponse,
  AgentUpdate,
  UserImageUploadResponse,
} from '@/shared/api/generated/types.gen';

/** 新建智能体的请求体；契约里有 schema，直接沿用生成类型。 */
export type AgentCreatePayload = AgentCreate;
/** 更新智能体的请求体；契约里有 schema，直接沿用生成类型。 */
export type AgentUpdatePayload = AgentUpdate;

/** 智能体列表的查询 options；`includeSubagents` 不同的两份缓存由同一份 key 前缀覆盖。 */
export const agentsListOptions = (includeSubagents: boolean) =>
  listAgentsApiAgentGetOptions({
    query: { include_subagents: includeSubagents },
  });

/** 智能体后端列表的查询 options；只在新建智能体时用到。 */
export const agentBackendsListOptions = () =>
  listAgentBackendsApiAgentBackendsGetOptions({});

/**
 * 智能体列表的 key，用于写入后的失效。
 *
 * 是函数而不是模块级常量：生成 key 会读客户端的 `baseUrl`，在模块顶层求值可能早于
 * `base.ts` 的装配，固化成一个匹配不上真实缓存的键。
 */
export const agentsListKey = () => listAgentsApiAgentGetQueryKey();

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
